const { Events } = require('discord.js');
const scope = require('../utils/serverScope');

// Future invites to another server are blocked or automatically removed,
// depending on AUTO_LEAVE_OTHER_GUILDS. The official Astra server is protected.
module.exports = {
    name: Events.GuildCreate,
    async execute(guild) {
        await scope.checkGuild(guild);
    },
};
