const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const prompts = require('../utils/wouldyourather');

module.exports = {
    data: new SlashCommandBuilder().setName('wouldyourather').setDescription('Get a random "would you rather" question.'),

    async execute(interaction) {
        const [a, b] = prompts[Math.floor(Math.random() * prompts.length)];
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('wyr_a').setLabel('Option A').setEmoji('🅰️').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('wyr_b').setLabel('Option B').setEmoji('🅱️').setStyle(ButtonStyle.Primary),
        );
        return interaction.reply({
            content: `🤔 **Would you rather...**\n🅰️ ${a}\n**or**\n🅱️ ${b}`,
            components: [row],
        });
    },
};
