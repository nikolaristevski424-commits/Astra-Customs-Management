const { ChannelType } = require('discord.js');
const { collectAttachmentFiles } = require('./respond');
const {withFooter} = require('./footerBranding');

async function createCatalogThread(channel, name, message) {
    if (!channel?.threads?.create) return null;

    const brandedMessage = withFooter(message);
    const options = {
        name: name.slice(0, 100),
        autoArchiveDuration: 10080,
        reason: 'Create package or bundle review thread',
    };

    if (channel.type === ChannelType.GuildForum) {
        const files = collectAttachmentFiles(brandedMessage);
        options.message = files.length ? { ...brandedMessage, files } : brandedMessage;
    } else {
        const files = collectAttachmentFiles(brandedMessage);
        options.startMessage = files.length ? { ...brandedMessage, files } : brandedMessage;
    }

    return channel.threads.create(options);
}

module.exports = { createCatalogThread };