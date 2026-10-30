const { withFooter } = require('../utils/footerBranding');
const { SlashCommandBuilder } = require('discord.js');
const config = require('../utils/config');
const hr = require('../utils/hr');
const perms = require('../utils/permissions');
const { sendInfractionMessages } = require('../utils/infractionMessages');
const { updateStatusPanel } = require('../utils/statusPanel');
const staffDiscipline = require('../services/staffDiscipline');

const PUNISHMENTS = ['Notice', 'Warning', 'Strike', 'Suspension', 'Demotion', 'Under Investigation', 'Termination', 'Staff Blacklist'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('infract')
        .setDescription('Issue or void a staff infraction.')
        .addSubcommand((sub) =>
            sub
                .setName('issue')
                .setDescription('Issue an infraction')
                .addUserOption((o) => o.setName('user').setDescription('Staff member').setRequired(true))
                .addStringOption((o) => o.setName('punishment').setDescription('Punishment').setRequired(true).addChoices(...PUNISHMENTS.map((p) => ({ name: p, value: p }))))
                .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true))
                .addStringOption((o) => o.setName('issuer_visibility').setDescription('Whether to show who issued this infraction').setRequired(true).addChoices(
                    { name: 'Show issuer', value: 'identified' },
                    { name: 'Anonymous', value: 'anonymous' },
                ))
        )
        .addSubcommand((sub) =>
            sub.setName('void').setDescription('Void an infraction').addStringOption((o) => o.setName('id').setDescription('Infraction ID, e.g. #ABCXYZ').setRequired(true))
        ),

    async execute(interaction) {
        const guildId = interaction.guildId;
        const cfg = config.getConfig(guildId);

        if (!perms.isHR(interaction.member, cfg)) {
            return interaction.reply({ content: "You don't have permission to use this command.", ephemeral: true });
        }

        const sub = interaction.options.getSubcommand();

        if (sub === 'issue') {
            await interaction.deferReply({ ephemeral: true });
            const channel = cfg.infractionsChannelId
                ? await interaction.client.channels.fetch(cfg.infractionsChannelId).catch(() => null)
                : null;
            if (!channel?.isTextBased?.() || channel.isDMBased?.()) {
                return interaction.editReply('Could not issue the infraction: the configured infractions channel is unavailable. No infraction was recorded.');
            }

            const user = interaction.options.getUser('user', true);
            const punishment = interaction.options.getString('punishment', true);
            const reason = interaction.options.getString('reason', true);
            const anonymous = interaction.options.getString('issuer_visibility', true) === 'anonymous';

            const infraction = hr.issueInfraction(guildId, {
                userId: user.id,
                issuedBy: interaction.user.id,
                anonymous,
                punishment,
                reason,
            });

            const escalations=infraction.escalations||[];
            // Apply suspensions and terminations even when the announcement channel is temporarily unavailable.
            for(const item of [infraction,...escalations]) await staffDiscipline.apply(interaction.client,guildId,item);
            let notificationSent = false;
            let notificationError = null;
            try {
                const { panelMessage, pingMessage } = await sendInfractionMessages(channel, cfg, {
                    userId: user.id,
                    heading: 'Staff Punishment',
                    body: 'This user has received a punishment from the HR team.',
                    punishment,
                    reason,
                    infractionId: infraction.infractionId,
                    issuer: anonymous ? null : `<@${interaction.user.id}>`,
                });
                hr.updateInfraction(guildId, infraction.infractionId, {
                    announcementChannelId: channel.id,
                    announcementMessageId: panelMessage.id,
                    notificationMessageId: pingMessage.id,
                });
                for (const item of escalations) {
                    await sendInfractionMessages(channel,cfg,{
                        userId:user.id,heading:'Automatic HR Escalation',body:'The configured staff discipline threshold was reached.',
                        punishment:item.punishment,reason:item.reason,infractionId:item.infractionId,
                        issuer:'Automatic escalation system'
                    });
                }
                notificationSent = true;
            } catch (error) {
                notificationError = error;
                console.error(`[infract] Could not notify ${user.id} about infraction ${infraction.infractionId}:`, error.message);
            }

            const automaticSummary=escalations.length ? '\n**Automatic escalations:** '+escalations.map(item=>item.punishment+' (#'+item.infractionId+')').join(', ') : '';
            const notificationWarning = notificationSent ? '' : `\n**Warning:** the infraction was recorded, but its notification could not be sent${notificationError ? ` (${notificationError.message})` : ''}.`;
            return interaction.editReply({ content: `Successfully infracted **${user.tag}**.\nID: \`${infraction.infractionId}\`${automaticSummary}${notificationWarning}`, allowedMentions: { users: [] } });
        }

        if (sub === 'void') {
            await interaction.deferReply({ ephemeral: true });
            const id = interaction.options.getString('id', true).toUpperCase();
            const removed = hr.voidInfraction(guildId, id, interaction.user.id);
            if (!removed) {
                const existing = hr.listInfractions(guildId).find((infraction) => infraction.infractionId === id);
                return interaction.editReply(existing ? `Infraction \`${id}\` has already been voided.` : `No infraction found with ID \`${id}\`.`);
            }

            let announcementUpdated = false;
            let announcementError = null;
            if (removed.announcementChannelId && removed.announcementMessageId) {
                const channel = await interaction.client.channels.fetch(removed.announcementChannelId).catch(() => null);
                if (channel?.isTextBased?.() && !channel.isDMBased?.()) {
                    if (removed.notificationMessageId) {
                        const pingMessage = await channel.messages.fetch(removed.notificationMessageId).catch(() => null);
                        if (pingMessage) {
                            try {
                                await pingMessage.edit({
                                    content: `Infraction \`${id}\` was voided. <@${removed.userId}>`,
                                    allowedMentions: { parse: [] },
                                });
                            } catch (error) {
                                announcementError = error;
                                console.error(`[infract] Could not update the notification for voided infraction ${id}:`, error.message);
                            }
                        }
                    }

                    const panelMessage = await channel.messages.fetch(removed.announcementMessageId).catch(() => null);
                    if (panelMessage) {
                        try {
                            await updateStatusPanel(panelMessage, {
                                color: 0xf1c40f,
                                heading: 'Infraction Voided',
                                details: `Infraction \`${id}\` for <@${removed.userId}> has been voided.`,
                            });
                            await panelMessage.reply(withFooter({
                                embeds: [{
                                    title: 'Infraction Voided',
                                    description: `Infraction \`${id}\` for <@${removed.userId}> has been voided.`,
                                    color: 0xf1c40f,
                                    fields: [
                                        { name: 'Voided by', value: `<@${removed.voidedBy || interaction.user.id}>`, inline: true },
                                        { name: 'Reason', value: removed.reason || 'Not provided', inline: false },
                                    ],
                                    timestamp: new Date().toISOString(),
                                }],
                                allowedMentions: { parse: [] },
                            }));
                            announcementUpdated = true;
                        } catch (error) {
                            announcementError = error;
                            console.error(`[infract] Could not add the yellow void notice for infraction ${id}:`, error.message);
                        }
                    }
                }
            }

            const announcementStatus = announcementUpdated
                ? ''
                : ` Its original announcement could not be updated${announcementError ? ` (${announcementError.message})` : ''}, so no yellow notice was added.`;
            return interaction.editReply(`Infraction \`${id}\` has been **voided** and retained in the audit history.${announcementStatus}`);
        }
    },
};
