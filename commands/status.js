const { SlashCommandBuilder } = require('discord.js');
const config = require('../utils/config');
const { isExecutive } = require('../utils/env');
const { ICONS } = require('./service');
const availability=require('../utils/serviceAvailability');
const panel=require('./panel');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Change a service status shown on the order-status panel.')
        .addStringOption((option) => option.setName('service').setDescription('Service name, such as Liveries or Clothing').setRequired(true))
        .addStringOption((option) => option.setName('status').setDescription('New service status').setRequired(true).addChoices(
            { name: 'Open', value: 'open' },
            { name: 'Delayed', value: 'delayed' },
            { name: 'Closed', value: 'closed' },
            { name: 'Premium / Boosters Only', value: 'premium' },
        )),

    async execute(interaction) {
        const cfg = config.getConfig(interaction.guildId);
        if (!isExecutive(interaction.member)) {
            return interaction.reply({ content: 'Only configured executives can change service status.', ephemeral: true });
        }

        const service = availability.normalize(interaction.options.getString('service', true));
        if(!service)return interaction.reply({content:'Unknown service. Use Discord, Liveries, Graphics, Uniforms, Bots, Logos, Embeds, Websites, or ELS.',flags:64});
        await interaction.deferReply({flags:64});
        const status = interaction.options.getString('status', true);
        config.setNested(interaction.guildId, 'serviceStatus', { [service]: status });
        await panel.refreshPanels(interaction.client,interaction.guildId);

        return interaction.editReply({ content: `Set **${service}** to ${ICONS[status]} **${status === 'premium' ? 'Premium / Boosters Only' : status}**. Live panels refreshed.` });
    },
};