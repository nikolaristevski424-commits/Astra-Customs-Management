const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../utils/config');
const economy = require('../utils/economy');
const { parseColor } = require('../utils/embeds');

function remainingText(ms) {
    return `<t:${Math.ceil((Date.now() + ms) / 1000)}:R>`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('economy')
        .setDescription('Play with virtual Astra Coins. These are not Robux or store credit.')
        .addSubcommand((sub) => sub.setName('balance').setDescription('View your Astra Coins').addUserOption((o) => o.setName('user').setDescription('User to check')))
        .addSubcommand((sub) => sub.setName('daily').setDescription('Claim a daily Astra Coins reward'))
        .addSubcommand((sub) => sub.setName('work').setDescription('Work for Astra Coins once per hour'))
        .addSubcommand((sub) => sub.setName('pay').setDescription('Send Astra Coins to another member').addUserOption((o) => o.setName('user').setDescription('Recipient').setRequired(true)).addIntegerOption((o) => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)))
        .addSubcommand((sub) => sub.setName('coinflip').setDescription('Bet Astra Coins on heads or tails').addIntegerOption((o) => o.setName('amount').setDescription('Amount to bet').setRequired(true).setMinValue(1)).addStringOption((o) => o.setName('choice').setDescription('Your choice').setRequired(true).addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' })))
        .addSubcommand((sub) => sub.setName('slots').setDescription('Spin the Astra Coins slot machine').addIntegerOption((o) => o.setName('amount').setDescription('Amount to bet').setRequired(true).setMinValue(1)))
        .addSubcommand((sub) => sub.setName('roulette').setDescription('Bet Astra Coins on red, black, or green').addIntegerOption((o) => o.setName('amount').setDescription('Amount to bet').setRequired(true).setMinValue(1)).addStringOption((o) => o.setName('choice').setDescription('Your choice').setRequired(true).addChoices({ name: 'Red', value: 'red' }, { name: 'Black', value: 'black' }, { name: 'Green', value: 'green' })))
        .addSubcommand((sub) => sub.setName('leaderboard').setDescription('View the richest Astra Coins users')),

    async execute(interaction) {
        const guildId = interaction.guildId;
        const cfg = config.getConfig(guildId);
        const sub = interaction.options.getSubcommand();

        if (sub === 'balance') {
            const user = interaction.options.getUser('user') || interaction.user;
            const amount = economy.getBalance(guildId, user.id);
            return interaction.reply({ content: `🪙 **${user.username}** has **${amount.toLocaleString()} Astra Coins**.`, ephemeral: user.id === interaction.user.id, allowedMentions: { users: [] } });
        }

        if (sub === 'daily') {
            const result = economy.claimDaily(guildId, interaction.user.id);
            if (!result.success) return interaction.reply({ content: `You already claimed your daily reward. Come back ${remainingText(result.remaining)}.`, ephemeral: true });
            return interaction.reply({ content: `🎁 You received **${result.amount} Astra Coins**. Your balance is **${result.balance.toLocaleString()}**.`, ephemeral: false });
        }

        if (sub === 'work') {
            const result = economy.work(guildId, interaction.user.id);
            if (!result.success) return interaction.reply({ content: `You are still on cooldown. You can work again ${remainingText(result.remaining)}.`, ephemeral: true });
            return interaction.reply({ content: `💼 You earned **${result.amount} Astra Coins**. Your balance is **${result.balance.toLocaleString()}**.` });
        }

        if (sub === 'pay') {
            const user = interaction.options.getUser('user', true);
            const amount = interaction.options.getInteger('amount', true);
            const result = economy.transfer(guildId, interaction.user.id, user.id, amount);
            if (!result.success) return interaction.reply({ content: interaction.user.id === user.id ? 'You cannot pay yourself.' : `You do not have enough Astra Coins. Your balance is **${result.senderBalance}**.`, ephemeral: true });
            return interaction.reply({ content: `💸 Sent **${amount.toLocaleString()} Astra Coins** to **${user.username}**. Your balance is **${result.senderBalance.toLocaleString()}**.`, allowedMentions: { users: [] } });
        }

        if (sub === 'coinflip') {
            const amount = interaction.options.getInteger('amount', true);
            const choice = interaction.options.getString('choice', true);
            const result = economy.coinflip(guildId, interaction.user.id, amount, choice);
            if (!result.success) return interaction.reply({ content: `You do not have enough Astra Coins to bet **${amount}**. Your balance is **${result.balance}**.`, ephemeral: true });
            return interaction.reply({ content: `${result.won ? '🎉' : '🪙'} The coin landed on **${result.result}**. You ${result.won ? `won **${amount.toLocaleString()} Astra Coins**` : `lost **${amount.toLocaleString()} Astra Coins**`}. Balance: **${result.balance.toLocaleString()}**.` });
        }

        if (sub === 'slots') {
            const amount = interaction.options.getInteger('amount', true);
            const result = economy.slots(guildId, interaction.user.id, amount);
            if (!result.success) return interaction.reply({ content: `You do not have enough Astra Coins to bet **${amount}**. Your balance is **${result.balance}**.`, ephemeral: true });
            const outcome = result.winnings ? `won **${result.winnings.toLocaleString()}**` : `lost **${amount.toLocaleString()}**`;
            return interaction.reply({ content: `🎰 ${result.reels.join(' | ')}\nYou ${outcome}. Balance: **${result.balance.toLocaleString()} Astra Coins**.` });
        }

        if (sub === 'roulette') {
            const amount = interaction.options.getInteger('amount', true);
            const choice = interaction.options.getString('choice', true);
            const result = economy.roulette(guildId, interaction.user.id, amount, choice);
            if (!result.success) return interaction.reply({ content: `You do not have enough Astra Coins to bet **${amount}**. Your balance is **${result.balance}**.`, ephemeral: true });
            return interaction.reply({ content: `🎡 The wheel landed on **${result.result} (${result.roll})**. You ${result.won ? `won **${result.winnings.toLocaleString()} Astra Coins**` : `lost **${amount.toLocaleString()} Astra Coins**`}. Balance: **${result.balance.toLocaleString()}**.` });
        }

        const top = economy.leaderboard(guildId);
        if (!top.length) return interaction.reply({ content: 'No one has earned Astra Coins yet.', ephemeral: true });
        const lines = top.map((entry, index) => `**#${index + 1}** <@${entry.userId}> — 🪙 ${entry.amount.toLocaleString()}`);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(parseColor(cfg.accentColor)).setTitle('Astra Coins Leaderboard').setDescription(lines.join('\n')).setFooter({ text: 'Astra Coins are virtual and have no Robux value.' })], allowedMentions: { users: [] } });
    },
};