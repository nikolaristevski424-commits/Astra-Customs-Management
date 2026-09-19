const { Events } = require('discord.js');
const purchaseMonitor = require('../services/purchaseMonitor');
const loaExpiry = require('../services/loaExpiry');
const giveawayScheduler = require('../services/giveawayScheduler');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`[ready] Logged in as ${client.user.tag} — serving ${client.guilds.cache.size} server(s).`);
        client.user.setActivity('/help');

        purchaseMonitor.start(client);
        loaExpiry.start(client);
        giveawayScheduler.start(client);
    },
};
