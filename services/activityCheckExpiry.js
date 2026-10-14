// Closes activity checks after 24 hours and records a Notice for each
// member who was in the selected role when the check was posted but did
// not respond before the deadline.

const config = require('../utils/config');
const activity = require('../utils/activity');
const hr = require('../utils/hr');
const activityCmd = require('../commands/activity');
const { buildPanel } = require('../utils/embeds');
const { sendWithAttachments } = require('../utils/respond');
const { MessageFlags } = require('discord.js');

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

    let channel = null;
    if (cfg.infractionsChannelId) {
        channel = await client.channels.fetch(cfg.infractionsChannelId);
        if (!channel?.isTextBased?.() || channel.isDMBased?.()) {
            throw new Error(`Configured infractions channel ${cfg.infractionsChannelId} is not a usable server text channel.`);
        }
    }

    const voters = new Set(record.voterIds);
    const processed = new Set(record.processedUserIds || []);
    let issuedCount = 0;

    for (const userId of targetIds) {
        if (voters.has(userId) || processed.has(userId)) continue;

        try {
            const infraction = hr.issueInfraction(guildId, {
                userId,
                issuedBy: client.user.id,
                punishment: 'Notice',
                reason: `Did not respond to activity check #${record.id} within 24 hours.`,
                sourceActivityCheckId: record.id,
            });

            if (channel) {
                const container = buildPanel(cfg, {
                    mention: `<@${userId}>`,
                    heading: 'Activity Notice',
                    body: 'This member did not respond to the activity check within 24 hours.',
                    extraBlocks: [
                        `**Punishment** \`-\` Notice`,
                        `**Reason** \`-\` Did not react to Activity Check #${record.id}`,
                        `**Role** \`-\` <@&${record.roleId}>`,
                        `**Infraction ID** \`-\` ${infraction.infractionId}`,
                    ],
                });
                await sendWithAttachments(channel, {
                    flags: MessageFlags.IsComponentsV2,
                    components: [container],
                    allowedMentions: { users: [userId] },
                });
            }

            activity.markUserProcessed(guildId, record.id, userId);
            processed.add(userId);
            issuedCount += 1;
        } catch (error) {
            console.error(`[activityCheckExpiry] Failed issuing Notice for user ${userId}, check #${record.id} in guild ${guildId}:`, error.message);
        }
    }

    if (!channel && issuedCount > 0) {
        console.warn(`[activityCheckExpiry] Recorded ${issuedCount} Notice infraction(s) for check #${record.id} in guild ${guildId}, but INFRACTIONS_CHANNEL_ID is not configured.`);
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
            await message.edit({
                embeds: [activityCmd.buildEmbed(cfg, updatedRecord, targetIds.length)],
                components: [activityCmd.buildRow(updatedRecord)],
            });
        } catch (error) {
            console.error(`[activityCheckExpiry] Could not close activity check #${record.id} in guild ${guildId}:`, error.message);
        }
    }

    console.log(`[activityCheckExpiry] Closed check #${record.id} in guild ${guildId}; issued ${issuedCount} Notice infraction(s).`);
}

async function processDueChecks(client) {
    if (isProcessing) return;
    isProcessing = true;

    try {
        for (const [guildId, guild] of client.guilds.cache) {
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

module.exports = { start, processDueChecks };
