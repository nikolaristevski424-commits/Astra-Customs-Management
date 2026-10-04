const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../utils/config');
const credits = require('../utils/credits');
const orders = require('../utils/orders');
const { parseColor } = require('../utils/embeds');

function designerLeaderboard(guildId, limit = 10) {
    const state = orders.getState(guildId);
    const totals = new Map();

    for (const order of state.list || []) {
        if (!order.designerId) continue;
        if (order.status === 'Void' || order.status === 'Cancelled') continue;

        const earned = Number(order.designerEarning || 0);
        totals.set(order.designerId, (totals.get(order.designerId) || 0) + earned);
    }

    return [...totals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([userId, total]) => ({ userId, total }));
}

function buildCreditLeaderboard(guildId, limit = 10) {
    return credits.getLeaderboard(guildId, limit);
}

function buildEmbed(cfg, title, entries, formatter, emptyMessage) {
    if (!entries.length) {
        return new EmbedBuilder()
            .setColor(parseColor(cfg.accentColor))
            .setTitle(title)
            .setDescription(emptyMessage);
    }

    const lines = entries.map((entry, index) => `**#${index + 1}** ${formatter(entry)}`);
    return new EmbedBuilder()
        .setColor(parseColor(cfg.accentColor))
        .setTitle(title)
        .setDescription(lines.join('\n'));
}

module.exports = {
    designerLeaderboard,
    buildCreditLeaderboard,

    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View the top shop credit holders or best-performing designers.')
        .addStringOption((option) =>
            option
                .setName('type')
                .setDescription('Leaderboard type')
                .setRequired(true)
                .addChoices(
                    { name: 'Designers', value: 'designers' },
                    { name: 'Store Credit', value: 'credits' }
                )
        )
        .addIntegerOption((option) => option.setName('limit').setDescription('How many entries to show').setMinValue(3).setMaxValue(10).setRequired(false)),

    async execute(interaction) {
        const guildId = interaction.guildId;
        const cfg = config.getConfig(guildId);
        const type = interaction.options.getString('type', true);
        const limit = interaction.options.getInteger('limit') || 10;

        if (type === 'designers') {
            const entries = designerLeaderboard(guildId, limit);
            const embed = buildEmbed(
                cfg,
                `${cfg.brandName} | Designer Leaderboard`,
                entries,
                (entry) => `<@${entry.userId}> — R$${entry.total}`,
                'No designer earnings have been logged yet.'
            );
            return interaction.reply({ embeds: [embed], allowedMentions: { users: [] } });
        }

        const entries = buildCreditLeaderboard(guildId, limit);
        const embed = buildEmbed(
            cfg,
            `${cfg.brandName} | Credit Leaderboard`,
            entries,
            (entry) => `<@${entry.userId}> — R$${entry.amount}`,
            'No one has store credit yet.'
        );
        return interaction.reply({ embeds: [embed], allowedMentions: { users: [] } });
    },
};
