const { withFooter } = require('../utils/footerBranding');
const config = require('../utils/config');
const serverScope = require('../utils/serverScope');
const tickets = require('../utils/tickets');
const { closeTicket } = require('../utils/ticketClosing');

const CHECK_INTERVAL_MS = 30_000;
const CLOSE_REQUEST_DURATION_MS = 24 * 60 * 60 * 1000;
let isProcessing = false;

async function processDueRequests(client, now = Date.now()) {
    if (isProcessing) return;
    isProcessing = true;

    try {
        for (const [guildId] of client.guilds.cache) {
            if (!serverScope.isAstraGuild(guildId)) continue;
            const cfg = config.getConfig(guildId);
            for (const ticket of tickets.list(guildId)) {
                const request = ticket.closeRequest;
                if (!request || request.status !== 'pending' || request.deadlineAt > now) continue;

                tickets.update(guildId, ticket.channelId, {
                    closeRequest: { ...request, status: 'auto-closing', resolvedAt: now },
                });
                if (request.messageId) {
                    const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
                    const message = await channel?.messages?.fetch(request.messageId).catch(() => null);
                    if (message) {
                        await message.edit(withFooter({
                            content: 'No one responded to the close request within 24 hours. This ticket is now closing.',
                            components: [],
                        })).catch((error) => {
                            console.error(`[ticketCloseRequests] Could not update close request ${request.messageId}:`, error.message);
                        });
                    }
                }

                await closeTicket(client, guildId, cfg, ticket.channelId, 'automatic 24-hour timeout');
            }
        }
    } finally {
        isProcessing = false;
    }
}

function start(client) {
    setInterval(() => {
        processDueRequests(client).catch((error) => {
            console.error('[ticketCloseRequests] Failed to process close requests:', error.message);
        });
    }, CHECK_INTERVAL_MS);
}

module.exports = { start, processDueRequests, CLOSE_REQUEST_DURATION_MS };
