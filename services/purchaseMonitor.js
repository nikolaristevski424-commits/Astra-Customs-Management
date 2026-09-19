// Polls the configured Roblox group's transaction feed and posts a log
// embed to each guild's purchase-log channel. Optionally looks up the
// buyer's linked Discord account via Bloxlink so staff can @ mention them.
//
// Requires in .env: ROBLOX_COOKIE (a .ROBLOSECURITY cookie for an account
// that can view the group's transactions) and, optionally, BLOXLINK_API_KEY.
// Requires in .env: ROBLOX_GROUP_ID, BLOXLINK_GUILD_ID.

const config = require('../utils/config');
const { baseEmbed } = require('../utils/embeds');
const { robloxToDiscord } = require('../utils/bloxlink');
const credits = require('../utils/credits');

const POLL_INTERVAL_MS = 30_000;
const queue = [];
let isProcessing = false;

async function sendPurchaseEmbed(client, guildId, cfg, transaction) {
    if (!cfg.purchaseLogChannelId) return;

    const itemName = transaction.details?.name || 'Unknown Item';
    const itemId = transaction.details?.id;
    const buyerId = transaction.agent?.id;
    const buyerName = transaction.agent?.name || 'Unknown';
    const price = transaction.currency?.amount || 0;
    const purchasedLink = itemId ? `https://www.roblox.com/catalog/${itemId}` : null;
    const unixTimestamp = Math.floor(new Date(transaction.created).getTime() / 1000);

    const discordId = buyerId ? await robloxToDiscord(cfg.discordServerIdForBloxlink, buyerId) : null;
    const buyerLine = discordId
        ? `<@${discordId}> ([${buyerName}](https://www.roblox.com/users/${buyerId}/profile))`
        : `[${buyerName}](https://www.roblox.com/users/${buyerId}/profile)`;

    const descriptionLines = [
        `**Buyer:** ${buyerLine}`,
        `**Item:** ${purchasedLink ? `[${itemName}](${purchasedLink})` : itemName}`,
        `**Amount After Tax:** R$${price}`,
        `**Purchased:** <t:${unixTimestamp}:R>`,
    ];

    if (discordId && cfg.autoCreditPercent > 0) {
        const awarded = Math.floor(price * (cfg.autoCreditPercent / 100));
        if (awarded > 0) {
            credits.addCredit(guildId, discordId, awarded, { reason: `${cfg.autoCreditPercent}% auto-reward for purchasing ${itemName}` });
            descriptionLines.push(`**Store Credit Awarded:** R$${awarded} (${cfg.autoCreditPercent}%)`);
        }
    }

    const embed = baseEmbed(cfg, { title: 'Purchase Log', description: descriptionLines.join('\n') });

    try {
        const channel = await client.channels.fetch(cfg.purchaseLogChannelId);
        await channel.send({ embeds: [embed], allowedMentions: { users: discordId ? [discordId] : [] } });
    } catch (err) {
        console.error('[purchaseMonitor] Failed to send purchase log:', err.message);
    }
}

function processQueue() {
    if (isProcessing) return;
    isProcessing = true;

    (async () => {
        while (queue.length > 0) {
            const task = queue.shift();
            await task();
            await new Promise((r) => setTimeout(r, 3000));
        }
        isProcessing = false;
    })();
}

/**
 * Start polling. `client` is the logged-in discord.js Client. Call once
 * on `ready`. Requires ROBLOX_COOKIE in .env — silently does nothing
 * without it (rather than crashing the whole bot).
 */
function start(client) {
    const cookie = process.env.ROBLOX_COOKIE;
    if (!cookie) {
        console.log('[purchaseMonitor] ROBLOX_COOKIE not set — purchase monitoring disabled.');
        return;
    }

    let noblox;
    try {
        noblox = require('noblox.js');
    } catch {
        console.log('[purchaseMonitor] noblox.js not installed — purchase monitoring disabled.');
        return;
    }

    noblox
        .setCookie(cookie)
        .then(() => console.log('[purchaseMonitor] Logged into Roblox for purchase monitoring.'))
        .catch((err) => console.error('[purchaseMonitor] Failed to log into Roblox:', err.message));

    const lastSeen = new Map(); // guildId -> last transaction Date seen

    setInterval(() => {
        queue.push(async () => {
            for (const [guildId, guild] of client.guilds.cache) {
                const cfg = config.getConfig(guildId);
                if (!cfg.robloxGroupId || !cfg.purchaseLogChannelId) continue;

                try {
                    const transactions = await noblox.getGroupTransactions(cfg.robloxGroupId, 'Sale');
                    const firstRunForGuild = !lastSeen.has(guildId);
                    const since = lastSeen.get(guildId) || new Date(0);
                    let newest = since;

                    for (const transaction of transactions) {
                        const created = new Date(transaction.created);
                        if (created > since) {
                            // Don't replay a group's entire sales history the first time we see it.
                            if (!firstRunForGuild) await sendPurchaseEmbed(client, guildId, cfg, transaction);
                            if (created > newest) newest = created;
                        }
                    }
                    lastSeen.set(guildId, newest > since ? newest : new Date());
                } catch (err) {
                    if (err.message?.includes('429')) {
                        console.log('[purchaseMonitor] Rate limited, backing off.');
                        await new Promise((r) => setTimeout(r, 60_000));
                    } else {
                        console.error(`[purchaseMonitor] Error fetching transactions for guild ${guildId}:`, err.message);
                    }
                }
            }
        });
        processQueue();
    }, POLL_INTERVAL_MS);
}

module.exports = { start };
