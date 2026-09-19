const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reverse')
        .setDescription('Reverse any text.')
        .addStringOption((o) => o.setName('text').setDescription('Text to reverse').setRequired(true)),

    async execute(interaction) {
        const text = interaction.options.getString('text', true);
        const reversed = [...text].reverse().join('');
        return interaction.reply({ content: reversed, allowedMentions: { parse: [] } });
    },
};
