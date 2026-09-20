const { SlashCommandBuilder } = require('discord.js');
const config = require('../utils/config');
const perms = require('../utils/permissions');

module.exports = {
    data: new SlashCommandBuilder().setName('ad').setDescription('Post the Astra Customs advertisement.'),

    async execute(interaction) {
        const cfg = config.getConfig(interaction.guildId);
        if (!perms.isStaff(interaction.member, cfg)) return interaction.reply({ content: 'You do not have permission to post advertisements.', ephemeral: true });

        const invite = cfg.discordInviteUrl || 'our Discord server';
        return interaction.reply({
            content: [
                '**ASTRA CUSTOMS**',
                'We are the world\'s cheapest design server for ER:LC communities.',
                '',
                'We offer affordable custom liveries, clothing, graphics, free releases, advertising, and designer opportunities.',
                'Designers, staff, and partners are welcome to apply through the main dashboard.',
                '',
                `Join us: ${invite}`,
            ].join('\n'),
        });
    },
};