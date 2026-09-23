const { SlashCommandBuilder } = require('discord.js');
const config = require('../utils/config');
const { isExecutive } = require('../utils/env');
const { ICONS } = require('./service');

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

        const service = interaction.options.getString('service', true).trim();
        const status = interaction.options.getString('status', true);
        config.setNested(interaction.guildId, 'serviceStatus', { [service]: status });

        return interaction.reply({ content: `Set **${service}** to ${ICONS[status]} **${status === 'premium' ? 'Premium / Boosters Only' : status}**.`, ephemeral: true });
    },
};