const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('avatar')
        .setDescription("Show someone's full-size avatar.")
        .addUserOption((o) => o.setName('user').setDescription('Whose avatar (defaults to you)')),

    async execute(interaction) {
        const target = interaction.options.getUser('user') || interaction.user;
        const url = target.displayAvatarURL({ extension: 'png', size: 1024 });
        const embed = new EmbedBuilder().setTitle(`${target.username}'s avatar`).setImage(url).setColor(0x2d2d31);
        return interaction.reply({ embeds: [embed] });
    },
};
