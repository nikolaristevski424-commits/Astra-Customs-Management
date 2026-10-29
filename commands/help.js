const { withFooter } = require('../utils/footerBranding');
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../utils/config');
const { parseColor } = require('../utils/embeds');

const CATEGORIES = [
    { name: '📊 Service & Review Tools', value: '`/availability` — live status for customers; `/status` — update services (manager); `/panel refresh` and `/panel track-status` — repair status panels; `/review queue` and `/review diagnose` — review submissions and check channel permissions.' },
    { name: '📋 Job Queue', value: '`/order add`, `/order list` — post work and let designers claim it' },
    { name: '🧾 Sales Ledger', value: '`/order log|status|view|history|reset`, `/earnings`' },
    { name: '💰 Pricing', value: '`/pricelist view|set`, `/quote`, `/tax`' },
    { name: '💸 Payments', value: '`/payment request|release|pool`, `/payment link get|check`' },
    { name: '🤑 Payouts & Credit', value: '`/payout request|list`, `/credit add|remove|view|history`, `/leaderboard credits|designers`' },
    { name: '🪙 Economy', value: '`/economy balance|daily|work|pay|coinflip|leaderboard` — virtual Astra Coins, separate from Robux credit' },
    { name: '🏷️ Discounts', value: '`/discounts list|redeem`, executives: `/discounts create|disable`' },
    { name: '📦 Packages & Bundles', value: '`/package create|request|setprice|list|view|collect`, `/bundle request`' },
    { name: '🖼️ Portfolio', value: '`/portfolio add|view|remove|profile`' },
    { name: '✅ Quality Control', value: '`/qc submit` — submit work for QC approval' },
    { name: '🎉 Fun', value: '`/release`, `/giveaway start|reroll`, `/fact`, `/reverse`, `/wanted`, `/8ball`, `/coinflip`, `/roll`, `/rps`, `/ship`, `/wouldyourather, /poll create|results|end, /deadchat start|results|end`, `/avatar`' },
    { name: '🎫 Ticket Operations', value: '`/close request` — 24-hour close request. Staff: `/closee` for immediate closure, `/ticket info|list|stats|add|remove|rename|priority|claim|assign|unclaim|lock|unlock|transcript`' },
    { name: '🤝 Partnerships & Ads', value: '\`/partnership\` — management post with up to five representatives. Ownership: \`/paid ad\` — sponsored advertisement with optional giveaway-style ping. \`/health\` — staff diagnostics.' },
    { name: '🛠️ Staff & HR', value: '`/addstaff`, `/infract issue|void`, `/promote issue|void`, `/logs`, `/loa request|return|list`' },
    { name: '🖌️ Design Tools', value: '`/watermark`, `/say`' },
    { name: '📋 Panels & status', value: '`/panel order-status|tickets|order|applications|portfolio|affiliations|honeypot`, `/dashboard`, `/status`, `/text edit`' },
    { name: '📈 Activity', value: '`/activity check` — executive role activity check with live reactions' },
    { name: '🏆 Leaderboards', value: '`/leaderboard designers|credits` — top designers and store-credit rankings' },
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
        return interaction.reply(withFooter({ embeds: [embed], ephemeral: true }));
    },
};
