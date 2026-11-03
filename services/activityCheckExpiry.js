const { withFooter } = require('../utils/footerBranding');
// Closes activity checks after 24 hours and records a Notice for each
// member who was in the selected role when the check was posted but did
// not respond before the deadline.

const config = require('../utils/config');
const serverScope = require('../utils/serverScope');
const activity = require('../utils/activity');
const loa=require('../utils/loa');
const LOA_ROLE_ID='1507411048167112724';
const hr = require('../utils/hr');
const activityCmd = require('../commands/activity');
const { sendInfractionMessages } = require('../utils/infractionMessages');
const staffDiscipline = require('./staffDiscipline');

const CHECK_INTERVAL_MS = 30_000;
let isProcessing = false;

async function processCheck(client, guildId, guild, cfg, record) {
    let targetIds = record.targetIds;
    if (!Array.isArray(targetIds)) {
        const members = await guild.members.fetch();
        targetIds = [...members.values()]
            .filter((member) => !member.user.bot && member.roles.cache.has(record.roleId))
            .map((member) => member.id);
    }

    if (!cfg.infractionsChannelId) {
        throw new Error(`INFRACTIONS_CHANNEL_ID is not configured for guild ${guildId}; activity Notices were not issued.`);
    }
    const channel = await client.channels.fetch(cfg.infractionsChannelId);
    if (!channel?.isTextBased?.() || channel.isDMBased?.()) {
        throw new Error(`Configured infractions channel ${cfg.infractionsChannelId} is not a usable server text channel.`);
    }

    const voters = new Set(record.voterIds);
    const processed = new Set(record.processedUserIds || []);
    let issuedCount = 0;
    let exemptCount = 0;

    for (const userId of targetIds) {
        if (voters.has(userId) || processed.has(userId)) continue;

        try {
            // Always re-check LOA when a notice would be issued, rather than
            // trusting a stale membership snapshot from 24 hours ago.
            let member;
            try{
                member=await guild.members.fetch(userId);
            }catch(error){
                if(error?.code===10007){
                    // A departed member cannot receive an activity infraction.
                    activity.markUserProcessed(guildId,record.id,userId);
                    processed.add(userId);
                    continue;
                }
                // Network/permission failures must NOT result in an infraction;
                // retry once we can check the member's LOA role reliably.
                throw new Error('Could not confirm member LOA status: '+(error?.message||error?.code||'unknown'));
            }
            if(!member || !member.roles?.cache?.has){
                throw new Error('Member roles could not be verified for '+userId);
            }
            const hasLoaRole=member.roles.cache.has(LOA_ROLE_ID) ||
                (cfg.loaRoleId && member.roles.cache.has(cfg.loaRoleId));
            const approved=loa.findActiveForUser(guildId,userId);
            const activeLoa=approved && approved.startDate<=Date.now() && approved.endDate>Date.now();
            if(hasLoaRole||activeLoa){
                activity.markUserExempt(guildId,record.id,userId);
                processed.add(userId);
                exemptCount++;
                continue;
            }
            const infraction = hr.issueInfraction(guildId, {
                userId,
                issuedBy: client.user.id,
                punishment: 'Notice',
                reason: `Did not respond to activity check #${record.id} within 24 hours.`,
                sourceActivityCheckId: record.id,
            });

            for(const item of infraction.escalations||[]){
                await staffDiscipline.apply(client,guildId,item);
                await sendInfractionMessages(channel,cfg,{userId,heading:'Automatic HR Escalation',body:'The configured staff discipline threshold was reached.',punishment:item.punishment,reason:item.reason,infractionId:item.infractionId,issuer:'Activity check escalation'});
            }

            const { panelMessage, pingMessage } = await sendInfractionMessages(channel, cfg, {
                userId,
                heading: 'Activity Notice',
                body: 'This member did not respond to the activity check within 24 hours.',
                punishment: 'Notice',
                reason: `Did not react to Activity Check #${record.id}`,
                infractionId: infraction.infractionId,
                issuer: 'Activity check automation',
                roleId: record.roleId,
            });
            hr.updateInfraction(guildId, infraction.infractionId, {
                announcementChannelId: channel.id,
                announcementMessageId: panelMessage.id,
                notificationMessageId: pingMessage.id,
            });

            activity.markUserProcessed(guildId, record.id, userId);
            processed.add(userId);
            issuedCount += 1;
        } catch (error) {
            console.error(`[activityCheckExpiry] Failed issuing Notice for user ${userId}, check #${record.id} in guild ${guildId}:`, error.message);
        }
    }

    const incomplete = targetIds.some((userId) => !voters.has(userId) && !processed.has(userId));
    if (incomplete) {
        console.error(`[activityCheckExpiry] Check #${record.id} in guild ${guildId} still has unprocessed members; it will be retried.`);
        return;
    }

    activity.complete(guildId, record.id);

    if (record.messageId && record.channelId) {
        try {
            const messageChannel = await client.channels.fetch(record.channelId);
            const message = await messageChannel.messages.fetch(record.messageId);
            const updatedRecord = activity.find(guildId, record.id);
            await message.edit(withFooter({
                embeds: [activityCmd.buildEmbed(cfg, updatedRecord, targetIds.length)],
                components: [activityCmd.buildRow(updatedRecord)],
            }));
        } catch (error) {
            console.error(`[activityCheckExpiry] Could not close activity check #${record.id} in guild ${guildId}:`, error.message);
        }
    }

    console.log(`[activityCheckExpiry] Closed check #${record.id} in guild ${guildId}; issued ${issuedCount} Notice infraction(s), exempted ${exemptCount} member(s) on LOA.`);
}

async function processDueChecks(client) {
    if (isProcessing) return;
    isProcessing = true;

    try {
        for (const [guildId, guild] of client.guilds.cache) {
            if (!serverScope.isAstraGuild(guildId)) continue;
            try {
                const cfg = config.getConfig(guildId);
                for (const record of activity.listDue(guildId)) {
                    await processCheck(client, guildId, guild, cfg, record);
                }
            } catch (error) {
                console.error(`[activityCheckExpiry] Failed processing activity checks for guild ${guildId}:`, error.message);
            }
        }
    } finally {
        isProcessing = false;
    }
}

function start(client) {
    setInterval(() => {
        processDueChecks(client).catch((error) => {
            console.error('[activityCheckExpiry] Failed to process expired activity checks:', error.message);
        });
    }, CHECK_INTERVAL_MS);
}

module.exports = { start, processDueChecks, processCheck, LOA_ROLE_ID };
