const { ChannelType } = require('discord.js');

async function createCatalogThread(channel, name, message) {
    if (!channel?.threads?.create) return null;

    const options = {
        name: name.slice(0, 100),
        autoArchiveDuration: 10080,
        reason: 'Create package or bundle review thread',
    };

    if (channel.type === ChannelType.GuildForum) {
        options.message = message;
    } else {
        options.startMessage = message;
    }

    return channel.threads.create(options);
}

module.exports = { createCatalogThread };