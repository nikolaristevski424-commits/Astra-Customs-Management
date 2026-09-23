const { SlashCommandBuilder } = require('discord.js');
const config = require('../utils/config');
const perms = require('../utils/permissions');

const ICONS = {
    open: '<:StatusEMOJIGreen:1545902027299627018><:OpenedEmoji1:1545902291469467668><:OpenedEmoji2:1545902335421841509><:OpenedEmoji3:1545902388961878188>',
    delayed: '<:StatusEmojiYellow:1545902089186705459>',
    closed: '<:StatusEmojiRed:1545902134258827294><:ClosedEmoji1:1545902477621072022><:ClosedEmoji2:1545902533703245914><:ClosedEmoji3:1545902589403594903>',
    premium: '<:boost_1:1492387526613143683>',
};

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
                .addChoices({ name: 'Open', value: 'open' }, { name: 'Delayed', value: 'delayed' }, { name: 'Closed', value: 'closed' }, { name: 'Premium / Boosters Only', value: 'premium' })
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
