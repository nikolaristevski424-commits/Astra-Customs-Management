const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const config = require('../utils/config');
const perms = require('../utils/permissions');
const { BUILDERS } = require('./panel');
const { withFooter }=require('../utils/footerBranding');
const {isOwner}=require('../utils/ownership');
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
                .addChoices(...Object.entries(APPLICATIONS).map(([value,app])=>({name:app.name,value}))))
            .addStringOption((option) => option
                .setName('status')
                .setDescription('Application availability.')
                .setRequired(true)
                .addChoices(...STATUS_CHOICES))),

    async execute(interaction) {
        const cfg = config.getConfig(interaction.guildId);
        if (!perms.isManager(interaction.member,cfg) && !isOwner(interaction)) {
            return interaction.reply({ content: 'You do not have permission to change application status.', flags: MessageFlags.Ephemeral });
        }

        const application = interaction.options.getString('application', true);
        const status = interaction.options.getString('status', true);
        const updatedConfig = config.setNested(interaction.guildId, 'applicationStatus', { [application]: status });

        const definition = APPLICATIONS[application];
        const statusInfo = STATUSES[status];
        let panelMessage='';
        const location=updatedConfig.applicationPanel;
        if(location?.channelId&&location?.messageId){
          try {
            const channel=await interaction.client.channels.fetch(location.channelId);
            const previous=await channel?.messages?.fetch(location.messageId);
            if(!previous || previous.author?.id!==interaction.client.user.id)
              throw Error('The saved panel is missing or was posted by a different bot.');
            await previous.edit(withFooter({
              flags:MessageFlags.IsComponentsV2,
              ...BUILDERS.applications(updatedConfig)
            },updatedConfig));
            panelMessage=' ✅ Existing applications panel updated in place: '+previous.url;
          }catch(error){
            console.error('[application] Could not edit applications panel:',error);
            panelMessage=' ⚠️ The status was saved but the existing panel could not be edited: '+error.message.slice(0,180)+
              '. Run \`/panel applications\` to publish a new panel.';
          }
        }else{
          panelMessage=' No published panel registered. Run \`/panel applications\` to publish one.';
        }

        return interaction.reply({
            content: `Set **${definition.name}** applications to ${statusInfo.emoji} **${statusInfo.label}**.${panelMessage}`,
            flags: MessageFlags.Ephemeral,
        });
    },
};
