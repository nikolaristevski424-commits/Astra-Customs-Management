const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../utils/config');
const { parseColor } = require('../utils/embeds');

const CATEGORIES = [
    { name: '📋 Job Queue', value: '`/order add`, `/order list` — post work and let designers claim it' },
    { name: '🧾 Sales Ledger', value: '`/order log|status|view|history|reset`, `/earnings`' },
    { name: '💰 Pricing', value: '`/pricelist view|set`, `/quote`, `/tax`' },
    { name: '💸 Payments', value: '`/payment request|release|pool`, `/payment link get|check`, `/paymentrequest`' },
    { name: '🤑 Payouts & Credit', value: '`/payout request|list`, `/credit add|remove|view|history|leaderboard`' },
    { name: '🪙 Economy', value: '`/economy balance|daily|work|pay|coinflip|leaderboard` — virtual Astra Coins, separate from Robux credit' },
    { name: '🏷️ Discounts', value: '`/discounts list|redeem`, executives: `/discounts create|disable`' },
    { name: '📦 Packages & Bundles', value: '`/package create|request|setprice|list|view|collect`, `/bundle request`' },
    { name: '🖼️ Portfolio', value: '`/portfolio add|view|remove|profile`' },
    { name: '✅ Quality Control', value: '`/qc submit` — submit work for QC approval' },
    { name: '🎉 Fun', value: '`/release`, `/giveaway start|reroll`, `/fact`, `/reverse`, `/wanted`, `/8ball`, `/coinflip`, `/roll`, `/rps`, `/ship`, `/wouldyourather`, `/avatar`' },
    { name: '🛠️ Staff & HR', value: '`/addstaff`, `/infract issue|void`, `/promote issue|void`, `/logs`, `/loa request|return|list`' },
    { name: '🖌️ Design Tools', value: '`/watermark`, `/say`' },
    { name: '📋 Panels & status', value: '`/panel order-status|tickets|order|applications`, `/status`, `/service`, `/text edit`' },
    { name: '🤖 Bot Info', value: '`/help`, `/ping`' },
];

module.exports = {
    data: new SlashCommandBuilder().setName('help').setDescription('List everything this bot can do.'),

    async execute(interaction) {
        const cfg = config.getConfig(interaction.guildId);
        const embed = new EmbedBuilder()
            .setColor(parseColor(cfg.accentColor))
            .setTitle(`${cfg.brandName} — Commands`)
            .setDescription(`Staff can also use \`${cfg.prefix}orderstatus\`, \`${cfg.prefix}tickets\`, \`${cfg.prefix}order\`, or \`${cfg.prefix}applications\` as shortcuts for the retained panels.`)
            .addFields(CATEGORIES);
        return interaction.reply({ embeds: [embed], ephemeral: true });
    },
};
