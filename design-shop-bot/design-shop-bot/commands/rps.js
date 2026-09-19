const { SlashCommandBuilder } = require('discord.js');

const CHOICES = ['rock', 'paper', 'scissors'];
const EMOJI = { rock: '🪨', paper: '📄', scissors: '✂️' };
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rps')
        .setDescription('Play rock-paper-scissors against the bot.')
        .addStringOption((o) =>
            o
                .setName('choice')
                .setDescription('Your choice')
                .setRequired(true)
                .addChoices({ name: 'Rock', value: 'rock' }, { name: 'Paper', value: 'paper' }, { name: 'Scissors', value: 'scissors' })
        ),

    async execute(interaction) {
        const playerChoice = interaction.options.getString('choice', true);
        const botChoice = CHOICES[Math.floor(Math.random() * CHOICES.length)];

        let result;
        if (playerChoice === botChoice) result = "It's a tie!";
        else if (BEATS[playerChoice] === botChoice) result = 'You win! 🎉';
        else result = 'I win!';

        return interaction.reply(`You chose ${EMOJI[playerChoice]} **${playerChoice}**, I chose ${EMOJI[botChoice]} **${botChoice}** — ${result}`);
    },
};
