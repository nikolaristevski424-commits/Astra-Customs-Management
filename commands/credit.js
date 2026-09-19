const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../utils/config');
const credits = require('../utils/credits');
const perms = require('../utils/permissions');
const { parseColor } = require('../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('credit')
        .setDescription('Manage Robux store credit (refunds/bonuses tied to real payments).')
        .addSubcommand((sub) =>
            sub
                .setName('add')
                .setDescription('Add credit to a user')
                .addUserOption((o) => o.setName('user').setDescription('User to credit').setRequired(true))
                .addIntegerOption((o) => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1))
                .addStringOption((o) => o.setName('reason').setDescription('Why (shown in /credit history)'))
        )
        .addSubcommand((sub) =>
            sub
                .setName('remove')
                .setDescription('Remove credit from a user')
                .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
                .addIntegerOption((o) => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1))
                .addStringOption((o) => o.setName('reason').setDescription('Why (shown in /credit history)'))
        )
        .addSubcommand((sub) =>
            sub
                .setName('view')
                .setDescription('View a user\'s credit balance')
                .addUserOption((o) => o.setName('user').setDescription('User (defaults to you)'))
        )
        .addSubcommand((sub) =>
            sub
                .setName('history')
                .setDescription('View a user\'s credit transaction history')
                .addUserOption((o) => o.setName('user').setDescription('User (defaults to you)'))
        )
        .addSubcommand((sub) => sub.setName('leaderboard').setDescription('Top store-credit balances')),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guildId;
        const cfg = config.getConfig(guildId);

        if (sub === 'view') {
            const user = interaction.options.getUser('user') || interaction.user;
            if (user.id !== interaction.user.id && !perms.isCreditManager(interaction.member, cfg)) {
                return interaction.reply({ content: "You don't have permission to view someone else's credit balance.", ephemeral: true });
            }
            const balance = credits.getBalance(guildId, user.id);
            return interaction.reply({ content: `**${user.tag}** has R$${balance} in store credit.`, ephemeral: true, allowedMentions: { users: [] } });
        }

        if (sub === 'history') {
            const user = interaction.options.getUser('user') || interaction.user;
            if (user.id !== interaction.user.id && !perms.isCreditManager(interaction.member, cfg)) {
                return interaction.reply({ content: "You don't have permission to view someone else's credit history.", ephemeral: true });
            }
            const history = credits.getHistory(guildId, user.id);
            if (!history.length) return interaction.reply({ content: `No credit history for ${user.username}.`, ephemeral: true });

            const lines = history.map((e) => {
                const sign = e.type === 'add' ? '+' : '-';
                const who = e.by ? ` by <@${e.by}>` : '';
                const why = e.reason ? ` — ${e.reason}` : '';
                return `${sign}R$${e.amount}${who}${why} (<t:${Math.floor(e.at / 1000)}:R>)`;
            });
            return interaction.reply({ content: lines.join('\n'), ephemeral: true, allowedMentions: { users: [] } });
        }

        if (sub === 'leaderboard') {
            const top = credits.getLeaderboard(guildId);
            if (!top.length) return interaction.reply({ content: 'No one has store credit yet.', ephemeral: true });

            const lines = top.map((entry, i) => `**#${i + 1}** <@${entry.userId}> — R$${entry.amount}`);
            const embed = new EmbedBuilder().setColor(parseColor(cfg.accentColor)).setTitle('Store Credit Leaderboard').setDescription(lines.join('\n'));
            return interaction.reply({ embeds: [embed], allowedMentions: { users: [] } });
        }

        if (!perms.isCreditManager(interaction.member, cfg)) {
            return interaction.reply({ content: 'You do not have permission to manage credits.', ephemeral: true });
        }

        const user = interaction.options.getUser('user', true);
        const amount = interaction.options.getInteger('amount', true);
        const reason = interaction.options.getString('reason');

        if (sub === 'add') {
            const newTotal = credits.addCredit(guildId, user.id, amount, { reason, by: interaction.user.id });
            return interaction.reply({
                content: `Successfully added R$**${amount}** credit to **${user.tag}**'s balance.\n-# Their balance: R$${newTotal}`,
                allowedMentions: { users: [] },
            });
        }

        if (sub === 'remove') {
            const newTotal = credits.removeCredit(guildId, user.id, amount, { reason, by: interaction.user.id });
            return interaction.reply({
                content: `Successfully removed R$**${amount}** credit from **${user.tag}**'s balance.\n-# Their balance: R$${newTotal}`,
                allowedMentions: { users: [] },
            });
        }
    },
};
