const { SlashCommandBuilder } = require('discord.js');
const config = require('../utils/config');
const perms = require('../utils/permissions');

const ICONS = { available: '✅', limited: '🕒', unavailable: '❌' };

module.exports = {
    ICONS,

    data: new SlashCommandBuilder()
        .setName('service')
        .setDescription('Set service availability shown on the order-status panel.')
        .addStringOption((o) => o.setName('name').setDescription('Service name, e.g. Liveries').setRequired(true))
        .addStringOption((o) =>
            o
                .setName('status')
                .setDescription('Availability')
                .setRequired(true)
                .addChoices({ name: 'Available', value: 'available' }, { name: 'Limited', value: 'limited' }, { name: 'Unavailable', value: 'unavailable' })
        ),

    async execute(interaction) {
        const guildId = interaction.guildId;
        const cfg = config.getConfig(guildId);
        if (!perms.isStaff(interaction.member, cfg)) {
            return interaction.reply({ content: 'You do not have permission to change service status.', ephemeral: true });
        }

        const name = interaction.options.getString('name', true);
        const status = interaction.options.getString('status', true);
        config.setNested(guildId, 'serviceStatus', { [name]: status });

        return interaction.reply({ content: `Set **${name}** to ${ICONS[status]} **${status}**.`, ephemeral: true });
    },
};
