const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, userMention } = require('discord.js');
const config = require('../utils/config');
const { isExecutive } = require('../utils/env');
const payoutRequests = require('../utils/payoutRequests');
const { baseEmbed } = require('../utils/embeds');

function buildEmbed(cfg, record) {
    return baseEmbed(cfg, {
        title: 'Astra Customs | Robux Payout Request',
        fields: [
            { name: 'Requested by', value: userMention(record.requestedBy), inline: true },
            { name: 'Amount', value: `R$${record.amount}`, inline: true },
            { name: 'Roblox username', value: record.robloxUsername, inline: true },
            { name: 'Reason', value: record.reason },
            { name: 'Status', value: record.status, inline: true },
            ...(record.paidBy ? [{ name: 'Paid by', value: userMention(record.paidBy), inline: true }] : []),
            ],
            footer: `Payout request #${record.id}`,
            timestamp: record.createdAt,
            });
}

function buildButtons(record) {
    if (record.status !== 'Pending') return [];
    return [
        new ButtonBuilder().setCustomId(`payout_markpaid_${record.id}`).setLabel('Mark Paid').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`payout_deny_${record.id}`).setLabel('Deny').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`payout_autosend_${record.id}`).setLabel('Try Auto-Send').setStyle(ButtonStyle.Secondary),
    ];
}

module.exports = {
    buildEmbed,
    buildButtons,

    data: new SlashCommandBuilder()
        .setName('payout')
        .setDescription('Request a Robux payout from the group.')
        .addSubcommand((sub) =>
            sub
                .setName('request')
                .setDescription('Request to be paid Robux from the group\'s funds')
                .addIntegerOption((o) => o.setName('amount').setDescription('Amount in Robux').setRequired(true).setMinValue(1))
                .addStringOption((o) => o.setName('robux_username').setDescription('Your Roblox username').setRequired(true))
                .addStringOption((o) => o.setName('reason').setDescription('What this payout is for').setRequired(true))
                .addStringOption((o) => o.setName('roblox_id').setDescription('Your Roblox user ID, if known (speeds up an auto-send attempt)'))
        )
        .addSubcommand((sub) =>
            sub
                .setName('list')
                .setDescription('View payout requests')
                .addStringOption((o) =>
                    o.setName('status').setDescription('Filter by status').addChoices({ name: 'Pending', value: 'Pending' }, { name: 'Paid', value: 'Paid' }, { name: 'Denied', value: 'Denied' })
                )
        ),

    async execute(interaction) {
        const guildId = interaction.guildId;
        const cfg = config.getConfig(guildId);
        const sub = interaction.options.getSubcommand();

        if (sub === 'list') {
            if (!isExecutive(interaction.member)) {
                return interaction.reply({ content: 'This command is restricted to the executive team.', ephemeral: true });
            }
            const status = interaction.options.getString('status');
            const all = payoutRequests.list(guildId, status);
            if (!all.length) return interaction.reply({ content: 'No matching payout requests.', ephemeral: true });
            const lines = all.slice(-25).reverse().map((r) => `\`#${r.id}\` <@${r.requestedBy}> — R$${r.amount} — ${r.status}`);
            return interaction.reply({ content: lines.join('\n'), ephemeral: true, allowedMentions: { users: [] } });
        }

        if (sub === 'request') {
            const amount = interaction.options.getInteger('amount', true);
            const robuxUsername = interaction.options.getString('robux_username', true);
            const reason = interaction.options.getString('reason', true);
            const robloxId = interaction.options.getString('roblox_id') || null;

            const record = payoutRequests.create(guildId, { requestedBy: interaction.user.id, amount, robloxUsername: robuxUsername, robloxId, reason });

            const targetChannelId = cfg.payoutRequestsChannelId || interaction.channelId;
            const channel = await interaction.client.channels.fetch(targetChannelId).catch(() => null);
            if (!channel) {
                return interaction.reply({ content: `Payout request \`#${record.id}\` saved, but the payout requests channel isn't reachable. Set \`PAYOUT_REQUESTS_CHANNEL_ID\` in \`.env\`.`, ephemeral: true });
            }

            const row = new ActionRowBuilder().addComponents(buildButtons(record));
            await channel.send({ embeds: [buildEmbed(cfg, record)], components: [row], allowedMentions: { parse: [] } });

            return interaction.reply({ content: `Payout request \`#${record.id}\` submitted for R$${amount}. The team will send it manually (or attempt an auto-send) and mark it paid.`, ephemeral: true });
        }
    },
};
