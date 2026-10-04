const { SlashCommandBuilder } = require('discord.js');
const config = require('../utils/config');
const ordersUtil = require('../utils/orders');
const jobsUtil = require('../utils/jobs');
const store = require('../utils/store');
const { baseEmbed } = require('../utils/embeds');

function countOpenTickets(guildId) {
    const all = store.get('tickets', guildId, {});
    return Object.values(all).filter((ticket) => !ticket.closedAt).length;
}

function countActiveGiveaways(guildId) {
    const giveaways = store.get('giveaways', guildId, { counter: 1, list: [] }).list || [];
    return giveaways.filter((entry) => entry.status === 'active').length;
}

function summarizeServices(cfg) {
    const serviceStatus = cfg.serviceStatus || {};
    if (!Object.keys(serviceStatus).length) return 'No service statuses set yet — use /service or /status to set them.';

    const counts = { open: 0, delayed: 0, closed: 0, premium: 0 };
    const lines = [];

    for (const [service, status] of Object.entries(serviceStatus)) {
        const key = status && typeof status === 'string' ? status.toLowerCase() : 'open';
        if (counts[key] !== undefined) counts[key] += 1;
        lines.push(`• ${service}: **${status}**`);
    }

    return `${lines.slice(0, 6).join('\n')}${lines.length > 6 ? `\n… and ${lines.length - 6} more` : ''}\n\nOpen: ${counts.open} • Delayed: ${counts.delayed} • Closed: ${counts.closed} • Premium: ${counts.premium}`;
}

function buildDashboardEmbed(cfg, guildId) {
    const orderState = ordersUtil.getState(guildId);
    const totalOrders = orderState.list.length;
    const awaitingPayment = orderState.list.filter((order) => order.status === 'Not Paid').length;
    const paid = orderState.list.filter((order) => order.status === 'Paid').length;
    const inProgress = orderState.list.filter((order) => order.status === 'In Progress').length;
    const delivered = orderState.list.filter((order) => order.status === 'Delivered').length;

    const openJobCount = jobsUtil.listOpenInstances(guildId).length;
    const pendingJobs = jobsUtil.getState(guildId).jobs.reduce((sum, job) => sum + job.instances.filter((instance) => instance.status === 'pending').length, 0);
    const activeGiveaways = countActiveGiveaways(guildId);
    const openTickets = countOpenTickets(guildId);

    return baseEmbed(cfg, {
        color: 0x2d8cff,
        title: `${cfg.brandName} | Live Dashboard`,
        description: 'A quick snapshot of what is active in the shop right now.',
        fields: [
            { name: '📦 Orders', value: `${totalOrders} total`, inline: true },
            { name: '💳 Awaiting payment', value: `${awaitingPayment}`, inline: true },
            { name: '✅ Paid', value: `${paid}`, inline: true },
            { name: '🛠️ In progress', value: `${inProgress}`, inline: true },
            { name: '🚚 Delivered', value: `${delivered}`, inline: true },
            { name: '🧵 Open job slots', value: `${openJobCount}`, inline: true },
            { name: '⏳ Pending requests', value: `${pendingJobs}`, inline: true },
            { name: '🎉 Active giveaways', value: `${activeGiveaways}`, inline: true },
            { name: '🎫 Open tickets', value: `${openTickets}`, inline: true },
            { name: '🧭 Service health', value: summarizeServices(cfg) },
            { name: '⚡ Quick actions', value: 'Use /panel, /dashboard, /activity check, and /status to keep operations visible and responsive.' },
        ],
        footer: `${cfg.brandName} operations`,
        timestamp: Date.now(),
    });
}

module.exports = {
    buildDashboardEmbed,

    data: new SlashCommandBuilder()
        .setName('dashboard')
        .setDescription('Show a live summary of the shop and ongoing activity.'),

    async execute(interaction) {
        const guildId = interaction.guildId;
        const cfg = config.getConfig(guildId);
        return interaction.reply({ embeds: [buildDashboardEmbed(cfg, guildId)] });
    },
};
