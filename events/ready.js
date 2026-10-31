const { Events } = require('discord.js');
const purchaseMonitor = require('../services/purchaseMonitor');
const serverScope = require('../utils/serverScope');
const loaExpiry = require('../services/loaExpiry');
const giveawayScheduler = require('../services/giveawayScheduler');
const activityCheckExpiry = require('../services/activityCheckExpiry');
const ticketCloseRequests = require('../services/ticketCloseRequests');
const staffDiscipline = require('../services/staffDiscipline');
const partnerships=require('../services/partnershipLifecycle');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`[ready] Logged in as ${client.user.tag} — serving ${client.guilds.cache.size} server(s).`);
        client.user.setActivity('/help');

        await serverScope.enforceGuilds(client);
        purchaseMonitor.start(client);
        loaExpiry.start(client);
        giveawayScheduler.start(client);
        activityCheckExpiry.start(client);
        ticketCloseRequests.start(client);
        staffDiscipline.start(client);
        // Repair active partnerships if representatives left while offline.
        partnerships.reconcileOnReady(client).catch(error=>
          console.warn('[ready] Partnership reconciliation failed:',error.message));
    },
};
