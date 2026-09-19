// Seed data for /pricelist, taken from the shop's bot-development price sheet.
// Everything here is editable in-server afterwards with /setprice.

function defaultPricelist() {
    return {
        commandPacks: [
            { name: 'Session Management Commands', price: 300 },
            { name: 'Partnership Management', price: 300 },
            { name: 'ER:LC Integration', price: 400 },
            { name: 'ER:LC Reminders Management', price: 250 },
            { name: 'Staff Management', price: 400 },
            { name: 'Ticket System', price: 500 },
            { name: 'Shift Management', price: 300 },
            { name: 'In-Game Punishments System', price: 200 },
            { name: 'Paid Advertisement Management', price: 300 },
            { name: 'Permissions Request Feature', price: 150 },
        ],
        singleCommands: [
            { name: 'Application', price: 125 },
            { name: 'Suggest', price: 100 },
            { name: 'Review', price: 100 },
            { name: 'Voting', price: 100 },
            { name: 'Staff Request', price: 125 },
            { name: 'Formats (for support system)', price: 150 },
        ],
        basicPack: {
            name: 'Basic Pack',
            price: 200,
            includes: ['Server Creation', 'Creating Channels', 'Roles Creation'],
        },
        basicPackAddons: [
            { name: 'Setting Role Permissions', price: 50 },
            { name: 'Setting Channel Permissions', price: 120 },
            { name: '4 Bots Setup (cannot be ticket or moderation bot)', price: 200 },
            { name: 'Ticket Bot Setup', price: 150 },
            { name: 'Discord Moderation Bot', price: 150 },
        ],
        fullPack: {
            name: 'Full Pack',
            price: 650,
            includes: ['Basic Pack', 'All Basic Pack Addons'],
        },
    };
}

module.exports = { defaultPricelist };
