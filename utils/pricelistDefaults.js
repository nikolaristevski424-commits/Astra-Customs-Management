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
        products: [
            { category: 'Clothing', name: 'Shirts', price: 60 },
            { category: 'Clothing', name: 'Pants', price: 40 },
            { category: 'Liveries', name: 'Staff Livery', price: '120-140' },
            { category: 'Liveries', name: 'Fire Department Livery', price: '140-160' },
            { category: 'Liveries', name: 'Job Livery', price: '130-150' },
            { category: 'Google Document Guides', name: 'Staff Guide', price: 250 },
            { category: 'Google Document Guides', name: 'Department/Division Guide', price: 350 },
            { category: 'Google Document Guides', name: 'Other Guides', price: '300-500' },
            { category: 'Discord', name: 'Server Advertisement', price: 30 },
            { category: 'Discord', name: 'Banner', price: '50-60' },
            { category: 'Discord', name: 'Logo', price: 200 },
            { category: 'Discord', name: 'Professional Photo', price: 30 },
            { category: 'Discord', name: 'Embeds', price: '50-60' },
            { category: 'Pictures', name: 'Picture Creation', price: 10 },
            { category: 'Pictures', name: 'Picture Editing', price: 10 },
            { category: 'ELS', name: 'ELS', price: '50-60' },
            { category: 'Stickers & Emojis', name: 'Emoji', price: '45-50' },
            { category: 'Stickers & Emojis', name: 'Sticker', price: '50-55' },
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
