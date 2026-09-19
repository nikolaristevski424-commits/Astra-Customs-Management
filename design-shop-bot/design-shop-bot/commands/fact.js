const { SlashCommandBuilder } = require('discord.js');
const facts = require('../utils/facts');

module.exports = {
    data: new SlashCommandBuilder().setName('fact').setDescription('Learn a random fun fact.'),

    async execute(interaction) {
        const fact = facts[Math.floor(Math.random() * facts.length)];
        return interaction.reply(`💡 **Did you know?** ${fact}`);
    },
};
