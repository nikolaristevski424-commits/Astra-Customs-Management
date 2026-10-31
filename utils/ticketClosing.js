const { AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const tickets = require('./tickets');
const specialTickets = require('./specialTickets');

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
        console.error(`[tickets] Ticket ${channelId} is unavailable; preserving the open record for staff review.`);
        return false;
    }

    tickets.update(guildId, channelId, { closingAt: Date.now() });

    let transcript;
    try {
        transcript = await buildTranscript(channel);
        if(!/^\d{10,22}$/.test(String(guildId)) || !/^\d{10,22}$/.test(String(channelId))) {
            throw new Error('Invalid Discord identifiers for archive storage.');
        }
        const dir = path.join(__dirname, '..', 'data', 'ticket-transcripts', String(guildId));
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        // Archive first, so channel deletion never loses the only transcript copy.
        const file = path.join(dir, `${channelId}.txt`);
        fs.writeFileSync(file, transcript, { mode: 0o600 });
    } catch(error) {
        console.error(`[tickets] Could not archive transcript for ${channelId}; keeping ticket open:`,error.message);
        tickets.update(guildId,channelId,{closingAt:null});
        return false;
    }

    const fileName = `transcript-${channel.name}.txt`;
    // Management and report transcripts are confidential: never fall back to
    // the ordinary support transcript channel.
    const privateType = specialTickets.routing(ticket.type);
    const transcriptChannelId = privateType?.transcriptChannelId || cfg.transcriptChannelId;
    const requirePrivateArchive = !!privateType;
    if (transcript && (transcriptChannelId || requirePrivateArchive)) {
        const transcriptChannel = transcriptChannelId
            ? await client.channels.fetch(transcriptChannelId).catch((error) => {
                console.error('[tickets] Could not fetch transcript channel '+transcriptChannelId+':', error.message);
                return null;
            }) : null;
        const allowedChannel = transcriptChannel?.isTextBased?.()
            && !transcriptChannel.isDMBased?.()
            && (!transcriptChannel.guildId || String(transcriptChannel.guildId)===String(guildId));
        let posted = false;
        if (allowedChannel) {
            try {
                await transcriptChannel.send({
                    content: 'Transcript for **#'+channel.name+'** ('+
                        (privateType?.label || ticket.type || 'support')+', ticket opener: <@'+ticket.userId+'>).',
                    files: [new AttachmentBuilder(transcript, { name: fileName })],
                    allowedMentions: { parse: [] },
                });
                posted = true;
            } catch (error) {
                console.error('[tickets] Failed to post transcript for '+channelId+':',error.message);
            }
        } else {
            console.error('[tickets] Transcript destination '+transcriptChannelId+' is unavailable or belongs to another server.');
        }
        if (requirePrivateArchive && !posted) {
            // Keep a confidential ticket open until its specified archive channel
            // actually accepts the transcript; a local file alone is not enough.
            tickets.update(guildId,channelId,{closingAt:null,transcriptError:'Private transcript delivery failed'});
            console.error('[tickets] Preserved '+ticket.type+' ticket '+channelId+' because its private transcript was not delivered.');
            return false;
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

    try {
        await channel.delete(`Ticket closed by ${closedBy || 'automatic 24-hour close request'}`);
    } catch (error) {
        // Channel is still open: release the lock so staff can retry /close.
        tickets.update(guildId, channelId, { closingAt: null });
        console.error(`[tickets] Could not delete ticket channel ${channelId}:`, error.message);
        return false;
    }

    // Only record closure once Discord confirms channel deletion.
    tickets.update(guildId, channelId, {
        closedAt: Date.now(),
        closedBy,
        closeRequest: null,
        closingAt: null,
    });
    return true;
}

module.exports = { buildTranscript, closeTicket };
