const { ChannelType } = require('discord.js');
const { collectAttachmentFiles } = require('./respond');

async function createCatalogThread(channel, name, message) {
    if (!channel?.threads?.create) return null;

    const options = {
        name: name.slice(0, 100),
        autoArchiveDuration: 10080,
        reason: 'Create package or bundle review thread',
    };

    if (channel.type === ChannelType.GuildForum) {
        const files = collectAttachmentFiles(message);
        options.message = files.length ? { ...message, files } : message;
    } else {
        const files = collectAttachmentFiles(message);
        options.startMessage = files.length ? { ...message, files } : message;
    }

    return channel.threads.create(options);
}

module.exports = { createCatalogThread };