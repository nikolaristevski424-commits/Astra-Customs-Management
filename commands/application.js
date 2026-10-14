const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const config = require('../utils/config');
const perms = require('../utils/permissions');
const { BUILDERS } = require('./panel');
const { sendWithAttachments } = require('../utils/respond');
const { APPLICATIONS, STATUSES, STATUS_CHOICES } = require('../utils/applicationStatus');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('application')
        .setDescription('Manage employee application availability.')
        .addSubcommand((subcommand) => subcommand
            .setName('status')
            .setDescription('Set an application to open, delayed, or closed.')
            .addStringOption((option) => option
                .setName('application')
                .setDescription('Application to update.')
                .setRequired(true)
                .addChoices(
                    { name: APPLICATIONS.designer.name, value: 'designer' },
                    { name: APPLICATIONS.staff.name, value: 'staff' },
                ))
            .addStringOption((option) => option
                .setName('status')
                .setDescription('Application availability.')
                .setRequired(true)
                .addChoices(...STATUS_CHOICES))),

    async execute(interaction) {
        const cfg = config.getConfig(interaction.guildId);
        if (!perms.isStaff(interaction.member, cfg)) {
            return interaction.reply({ content: 'You do not have permission to change application status.', flags: MessageFlags.Ephemeral });
        }

        const application = interaction.options.getString('application', true);
        const status = interaction.options.getString('status', true);
        const updatedConfig = config.setNested(interaction.guildId, 'applicationStatus', { [application]: status });

        const definition = APPLICATIONS[application];
        const statusInfo = STATUSES[status];
        let panelMessage = '';
        const panelLocation = updatedConfig.applicationPanel;
        if (panelLocation?.channelId && panelLocation.messageId) {
            try {
                const channel = await interaction.client.channels.fetch(panelLocation.channelId);
                if (!channel?.isTextBased?.() || channel.isDMBased?.()) {
                    throw new Error('The saved applications panel channel is unavailable or is not a server text channel.');
                }

                let previousPanel;
                try {
                    previousPanel = await channel.messages.fetch(panelLocation.messageId);
                } catch (error) {
                    console.warn('[applications] Could not fetch the previous panel; posting a replacement:', error.message);
                }

                const replacement = await sendWithAttachments(channel, {
                    flags: MessageFlags.IsComponentsV2,
                    ...BUILDERS.applications(updatedConfig),
                });
                config.setNested(interaction.guildId, 'applicationPanel', { channelId: replacement.channelId, messageId: replacement.id });
                panelMessage = ' The applications panel was refreshed.';

                if (previousPanel) {
                    try {
                        await previousPanel.delete();
                    } catch (error) {
                        console.warn('[applications] Could not remove the previous panel message:', error.message);
                    }
                }
            } catch (error) {
                console.error('[applications] Status saved, but the panel could not be refreshed:', error);
                panelMessage = ' The status was saved, but the panel could not be refreshed. Run `/panel applications` to post it again.';
            }
        } else {
            panelMessage = ' Run `/panel applications` once to publish the status panel.';
        }

        return interaction.reply({
            content: `Set **${definition.name}** applications to ${statusInfo.emoji} **${statusInfo.label}**.${panelMessage}`,
            flags: MessageFlags.Ephemeral,
        });
    },
};
