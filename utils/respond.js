const fs = require('fs');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');

// For "panel"-style commands (pricelist, portfolio, tax, dashboard, etc.)
// the user wants the channel to just show the resulting embed/panel, not
// a visible "SomeUser used /command" line above it. Discord removes that
// line when the interaction's response is deleted, so: defer ephemerally,
// delete the (empty) reply, then send the real payload as a normal
// message in the channel.
//
// This only works for slash commands. Message-based ("-prefix") shortcuts
// get the same visual effect by deleting the triggering message instead —
// see events/messageCreate.js.

const BANNERS_DIR = path.join(__dirname, '..', 'assets', 'banners');

function collectAttachmentFiles(value, files = [], seen = new Set()) {
    if (!value) return files;

    if (Array.isArray(value)) {
        for (const item of value) collectAttachmentFiles(item, files, seen);
        return files;
    }

    if (typeof value === 'string') {
        if (!value.startsWith('attachment://')) return files;
        const fileName = value.replace('attachment://', '');
        if (seen.has(fileName)) return files;

        const filePath = path.join(BANNERS_DIR, fileName);
        if (fs.existsSync(filePath)) {
            files.push(new AttachmentBuilder(filePath).setName(fileName));
            seen.add(fileName);
        }
        return files;
    }

    if (typeof value.toJSON === 'function') {
        collectAttachmentFiles(value.toJSON(), files, seen);
        return files;
    }

    if (typeof value === 'object') {
        for (const entry of Object.values(value)) collectAttachmentFiles(entry, files, seen);
    }

    return files;
}

async function sendAsPanel(interaction, payload, targetChannel = null) {
    const destination = targetChannel || interaction.channel;
    const files = collectAttachmentFiles(payload);
    const messagePayload = files.length ? { ...payload, files } : payload;

    try {
        await interaction.deferReply({ ephemeral: true });
        await interaction.deleteReply();
    } catch {
        // If we couldn't defer/delete for some reason, fall back to a normal reply
        // rather than losing the response entirely.
        return destination.send(messagePayload);
    }
    return destination.send(messagePayload);
}

module.exports = { collectAttachmentFiles, sendAsPanel };
