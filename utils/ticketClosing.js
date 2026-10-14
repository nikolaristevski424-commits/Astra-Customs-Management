const { AttachmentBuilder } = require('discord.js');
const tickets = require('./tickets');

async function buildTranscript(channel) {
    const messages = [];
    let before;

    while (true) {
        const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
        if (!batch.size) break;
        messages.push(...batch.values());
        before = batch.last().id;
        if (batch.size < 100) break;
    }

    messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    const lines = messages.map((message) => {
        const content = message.content || '';
        const attachments = [...message.attachments.values()].map((attachment) => attachment.url);
        const embeds = message.embeds.map((embed) => embed.title || embed.description).filter(Boolean);
        const details = [content, ...embeds, ...attachments].filter(Boolean).join('\n');
        return `[${message.createdAt.toISOString()}] ${message.author?.tag || 'Unknown author'} (${message.author?.id || 'unknown'}): ${details || '[no text content]'}`;
    });

    return Buffer.from(lines.join('\n\n') || 'No messages.', 'utf8');
}

async function closeTicket(client, guildId, cfg, channelId, closedBy) {
    const ticket = tickets.get(guildId, channelId);
    if (!ticket || ticket.closedAt || ticket.closingAt) return false;

    const channel = await client.channels.fetch(channelId).catch((error) => {
        console.error(`[tickets] Could not fetch ticket ${channelId} before closing:`, error.message);
        return null;
    });
    if (!channel?.isTextBased?.() || channel.isDMBased?.()) {
        tickets.update(guildId, channelId, { closedAt: Date.now(), closedBy, closeRequest: null });
        console.error(`[tickets] Ticket ${channelId} was untracked as closed because its channel is unavailable.`);
        return false;
    }

    tickets.update(guildId, channelId, { closingAt: Date.now() });

    let transcript;
    try {
        transcript = await buildTranscript(channel);
    } catch (error) {
        console.error(`[tickets] Failed to build transcript for ${channelId}:`, error.message);
    }

    const fileName = `transcript-${channel.name}.txt`;
    if (transcript && cfg.transcriptChannelId) {
        const transcriptChannel = await client.channels.fetch(cfg.transcriptChannelId).catch((error) => {
            console.error(`[tickets] Could not fetch transcript channel ${cfg.transcriptChannelId}:`, error.message);
            return null;
        });
        if (transcriptChannel?.isTextBased?.() && !transcriptChannel.isDMBased?.()) {
            try {
                await transcriptChannel.send({
                    content: `Transcript for **#${channel.name}** (ticket opener: <@${ticket.userId}>).`,
                    files: [new AttachmentBuilder(transcript, { name: fileName })],
                    allowedMentions: { parse: [] },
                });
            } catch (error) {
                console.error(`[tickets] Failed to post transcript for ${channelId}:`, error.message);
            }
        } else {
            console.error(`[tickets] Configured transcript channel ${cfg.transcriptChannelId} is unavailable or not a server text channel.`);
        }
    }

    if (transcript) {
        const opener = await client.users.fetch(ticket.userId).catch((error) => {
            console.error(`[tickets] Could not fetch ticket opener ${ticket.userId} for transcript delivery:`, error.message);
            return null;
        });
        if (opener) {
            try {
                await opener.send({
                    content: `Your ticket **#${channel.name}** has been closed. The transcript is attached below.`,
                    files: [new AttachmentBuilder(transcript, { name: fileName })],
                });
            } catch (error) {
                console.error(`[tickets] Could not DM the transcript for ticket ${channelId} to ${ticket.userId}:`, error.message);
            }
        }
    }

    tickets.update(guildId, channelId, {
        closedAt: Date.now(),
        closedBy,
        closeRequest: null,
        closingAt: null,
    });

    try {
        await channel.delete(`Ticket closed by ${closedBy || 'automatic 24-hour close request'}`);
    } catch (error) {
        console.error(`[tickets] Could not delete closed ticket channel ${channelId}:`, error.message);
        return false;
    }

    return true;
}

module.exports = { buildTranscript, closeTicket };
