const {makeCard,COLORS}=require('../utils/visualSystem');
const { SlashCommandBuilder } = require('discord.js');
const config = require('../utils/config');

const CATEGORIES = [
    { name: '📊 Service & Review Tools', value: '`/availability` — live status for customers; `/status` — update services (manager); `/panel refresh` and `/panel track-status` — repair status panels; `/review queue` and `/review diagnose` — review submissions and check channel permissions.' },
    { name: '📋 Job Queue', value: '`/order add`, `/order list` — post work and let designers claim it' },
    { name: '🧾 Sales Ledger', value: '`/order log|status|view|history|reset`, `/earnings`' },
    { name: '💰 Pricing', value: '`/pricelist view|set`, `/quote`, `/tax`' },
    { name: '💸 Payments', value: '`/payment create|release|pool`, `/payment link get|check`' },
    { name: '🤑 Payouts & Credit', value: '`/payout request|list`, `/credit add|remove|view|history`, `/leaderboard credits|designers`' },
    { name: '🪙 Economy', value: '`/economy balance|daily|work|pay|coinflip|leaderboard` — virtual Astra Coins, separate from Robux credit' },
    { name: '🏷️ Discounts', value: '`/discounts list|redeem`, executives: `/discounts create|disable`' },
    { name: '📦 Packages & Bundles', value: '`/package create|request|setprice|list|view|collect`, `/bundle request`' },
    { name: '🖼️ Portfolio', value: '`/portfolio add|view|remove|profile`' },
    { name: '✅ Quality Control', value: '`/qc submit` — submit work for QC approval' },
    { name: '🎉 Fun', value: '`/release`, `/giveaway start|reroll`, `/fact`, `/reverse`, `/wanted`, `/8ball`, `/coinflip`, `/roll`, `/rps`, `/ship`, `/wouldyourather, /poll create|results|end, /deadchat start|results|end`, `/avatar`' },
    { name: '🎫 Ticket Operations', value: 'The ticket panel offers Support, Management and Report a User tickets with private routing. `/close-request` — 24-hour close request. Staff: `/close` for immediate closure, `/ticket info|list|stats|add|remove|rename|priority|claim|assign|unclaim|lock|unlock|transcript`' },
    { name: '🤝 Partnerships & Ads', value: '\`/partnership\` — Partnership Team or management announcements; \`/partnership-stats mine|user|leaderboard\` — 20 Robux per unique published partnership. Ownership: \`/paid ad\`. \`/health\` — staff diagnostics.' },
    { name: '🛠️ Staff & HR', value: '`/addstaff`, `/infract issue|void` (includes Demotion), `/promote issue|void`, `/logs`, `/loa request|return|list`' },
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
        const sections=CATEGORIES.map(({name,value})=>'**'+name+'**\n'+value);
        const chunks=[
            sections.slice(0,6).join('\n\n'),
            sections.slice(6,12).join('\n\n'),
            sections.slice(12).join('\n\n')
        ];
        return interaction.reply(makeCard(cfg,{
            title:'Command Directory',
            subtitle:'OPERATIONS  /  CUSTOMER SERVICE  /  STAFF TOOLS',
            intro:'Use the slash commands below to manage commissions, payments, the community and Astra Customs staff.',
            details:chunks,
            note:'**Quick links**  \`/panel tickets\` · \`/panel order\` · \`/panel order-status\`\n'+
                 '**Instant staff close**  \`/close\`  ·  **Customer closure request**  \`/close-request\`',
            accentColor:COLORS.primary,ephemeral:true
        }));
    },
};
