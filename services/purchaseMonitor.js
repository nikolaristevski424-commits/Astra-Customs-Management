// Polls the configured Roblox group's transaction feed and posts a log
// embed to each guild's purchase-log channel. Optionally looks up the
// buyer's linked Discord account via Bloxlink so staff can @ mention them.
//
// Requires in .env: ROBLOX_COOKIE (a .ROBLOSECURITY cookie for an account
// that can view the group's transactions) and, optionally, BLOXLINK_API_KEY.
// Requires in .env: ROBLOX_GROUP_ID, BLOXLINK_GUILD_ID.

const axios = require('axios');
const config = require('../utils/config');
const { baseEmbed } = require('../utils/embeds');
const { robloxToDiscord } = require('../utils/bloxlink');
const credits = require('../utils/credits');
const packages = require('../utils/packages');
const paymentPool = require('../utils/paymentPool');
const store = require('../utils/store');

const POLL_INTERVAL_MS = 60_000;
const TRANSACTION_LIMIT = 100;
const MAX_SEEN_TRANSACTION_IDS = 500;
const STATE_STORE = 'purchaseMonitor';
const retryAfter = new Map();
const consecutiveFailures = new Map();
let isStarted = false;
let lastRobloxRequestAt = 0;
let hasLoadedRobloxRequestAt = false;

function getGroupState(groupId) {
    const all = store.get(STATE_STORE, 'global', {});
    return all[String(groupId)] || { initialized: false, lastSeenAt: 0, seenIds: [], nextRequestAt: 0 };
}

function saveGroupState(groupId, state) {
    store.update(STATE_STORE, 'global', {}, (all) => {
        all[String(groupId)] = state;
        return all;
    });
}

function saveLastRobloxRequestAt(timestamp) {
    store.update(STATE_STORE, 'global', {}, (all) => {
        all.lastRobloxRequestAt = timestamp;
        return all;
    });
}

function transactionKey(transaction) {
    if (transaction.id !== undefined && transaction.id !== null) return String(transaction.id);
    return [
        transaction.created instanceof Date ? transaction.created.getTime() : new Date(transaction.created).getTime(),
        transaction.agent?.id || '',
        transaction.details?.id || transaction.details?.gamepassId || '',
        transaction.currency?.amount || 0,
    ].join(':');
}

async function fetchRecentTransactions(groupId, cookie) {
    const { data } = await axios.get(`https://economy.roblox.com/v2/groups/${groupId}/transactions`, {
        params: { transactionType: 'Sale', limit: TRANSACTION_LIMIT, sortOrder: 'Desc' },
        headers: { Cookie: `.ROBLOSECURITY=${cookie}` },
        timeout: 20_000,
    });
    if (!Array.isArray(data?.data)) throw new Error('Roblox returned an invalid group-transactions response.');
    return data.data;
}

function backoffDuration(error, failureCount) {
    const retryHeader = error.response?.headers?.['retry-after'];
    if (retryHeader) {
        const seconds = Number(retryHeader);
        if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
        const retryAt = Date.parse(retryHeader);
        if (Number.isFinite(retryAt)) return Math.max(retryAt - Date.now(), POLL_INTERVAL_MS);
    }
    return Math.min(POLL_INTERVAL_MS * (2 ** Math.min(failureCount, 4)), 15 * 60_000);
}

async function sendPurchaseEmbed(client, guildId, cfg, transaction) {
    const itemName = transaction.details?.name || 'Unknown Item';
    const itemId = transaction.details?.id;
    const buyerId = transaction.agent?.id;
    const buyerName = transaction.agent?.name || 'Unknown';
    const price = transaction.currency?.amount || 0;
    const purchasedLink = itemId ? `https://www.roblox.com/catalog/${itemId}` : null;
    const discordId = buyerId ? await robloxToDiscord(cfg.discordServerIdForBloxlink, buyerId) : null;
    const buyerLine = discordId
        ? `<@${discordId}> ([${buyerName}](https://www.roblox.com/users/${buyerId}/profile))`
        : `[${buyerName}](https://www.roblox.com/users/${buyerId}/profile)`;

    const descriptionLines = [];

    if (discordId && cfg.autoCreditPercent > 0) {
        const awarded = Math.floor(price * (cfg.autoCreditPercent / 100));
        if (awarded > 0) {
            credits.addCredit(guildId, discordId, awarded, { reason: `${cfg.autoCreditPercent}% auto-reward for purchasing ${itemName}` });
            descriptionLines.push(`**Store Credit Awarded:** R$${awarded} (${cfg.autoCreditPercent}%)`);
        }
    }

    const embed = baseEmbed(cfg, {
        title: 'Purchase Confirmed',
        bannerKey: 'order',
        description: descriptionLines.length ? descriptionLines.join('\n') : 'A Roblox purchase was detected and recorded.',
        fields: [
            { name: 'Buyer', value: buyerLine, inline: true },
            { name: 'Item', value: purchasedLink ? `[${itemName}](${purchasedLink})` : itemName, inline: true },
            { name: 'Amount After Tax', value: `R$${price}`, inline: true },
        ],
        timestamp: transaction.created instanceof Date ? transaction.created : new Date(transaction.created),
    });

    if (cfg.purchaseLogChannelId) {
        try {
            const channel = await client.channels.fetch(cfg.purchaseLogChannelId);
            await channel.send({ embeds: [embed], allowedMentions: { users: discordId ? [discordId] : [] } });
        } catch (err) {
            console.error('[purchaseMonitor] Failed to send purchase log:', err.message);
        }
    }

    let reservation = null;
    if (itemId) {
        reservation = paymentPool.findReservation(guildId, String(itemId));
        if (reservation) {
            paymentPool.release(guildId, String(itemId));
        }
    }

    if (!reservation && transaction.details?.gamepassId) {
        const gamePassId = String(transaction.details.gamepassId);
        reservation = paymentPool.findReservation(guildId, gamePassId);
        if (reservation) {
            paymentPool.release(guildId, gamePassId);
        }
    }

    if (!reservation?.packageId) return;

    const pkg = packages.find(guildId, reservation.packageId);
    if (!pkg?.files?.length) return;

    const recipientId = reservation.customerDiscordId || discordId;
    if (!recipientId) {
        console.warn(`[purchaseMonitor] Package #${pkg.id} was paid for by ${buyerName}, but no Discord account is linked. Manual delivery is required.`);
        return;
    }

    try {
        const recipient = await client.users.fetch(recipientId);
        await recipient.send({
            content: `Your purchase of **${pkg.name}** is confirmed. Thank you! Your files are attached below.`,
            files: pkg.files.map((file) => ({ attachment: file.url, name: file.name })),
        });
        console.log(`[purchaseMonitor] Automatically delivered package #${pkg.id} to Discord user ${recipientId}.`);
    } catch (err) {
        console.error(`[purchaseMonitor] Could not DM package #${pkg.id} to Discord user ${recipientId}:`, err.message);
    }
}

async function processGroup(client, groupId, destinations, transactions) {
    const state = getGroupState(groupId);
    const seenIds = new Set(state.seenIds || []);
    const createdAt = (transaction) => new Date(transaction.created).getTime();
    const newestAt = transactions.reduce((latest, transaction) => Math.max(latest, createdAt(transaction) || 0), state.lastSeenAt || 0);

    if (!state.initialized) {
        saveGroupState(groupId, {
            initialized: true,
            lastSeenAt: newestAt,
            seenIds: transactions.map(transactionKey).slice(0, MAX_SEEN_TRANSACTION_IDS),
        });
        console.log(`[purchaseMonitor] Initialized transaction tracking for Roblox group ${groupId}.`);
        return;
    }

    const pending = transactions
        .filter((transaction) => {
            const timestamp = createdAt(transaction);
            return Number.isFinite(timestamp) && timestamp >= state.lastSeenAt && !seenIds.has(transactionKey(transaction));
        })
        .sort((a, b) => createdAt(a) - createdAt(b));

    for (const transaction of pending) {
        for (const { guildId, cfg } of destinations) {
            await sendPurchaseEmbed(client, guildId, cfg, transaction);
        }
        seenIds.add(transactionKey(transaction));
        saveGroupState(groupId, {
            initialized: true,
            lastSeenAt: Math.max(state.lastSeenAt, createdAt(transaction)),
            seenIds: [...seenIds].slice(-MAX_SEEN_TRANSACTION_IDS),
        });
        state.lastSeenAt = Math.max(state.lastSeenAt, createdAt(transaction));
    }
}

async function pollGroups(client, cookie) {
    if (!hasLoadedRobloxRequestAt) {
        lastRobloxRequestAt = store.get(STATE_STORE, 'global', {}).lastRobloxRequestAt || 0;
        hasLoadedRobloxRequestAt = true;
    }

    const groupedDestinations = new Map();
    for (const [guildId] of client.guilds.cache) {
        const cfg = config.getConfig(guildId);
        if (!cfg.robloxGroupId) continue;
        const groupId = String(cfg.robloxGroupId);
        if (!groupedDestinations.has(groupId)) groupedDestinations.set(groupId, []);
        groupedDestinations.get(groupId).push({ guildId, cfg });
    }

    for (const [groupId, destinations] of groupedDestinations) {
        const state = getGroupState(groupId);
        const allowedAt = Math.max(retryAfter.get(groupId) || 0, state.nextRequestAt || 0);
        if (Date.now() < allowedAt) continue;

        try {
            const rateLimitWait = lastRobloxRequestAt + POLL_INTERVAL_MS - Date.now();
            if (rateLimitWait > 0) await new Promise((resolve) => setTimeout(resolve, rateLimitWait));
            lastRobloxRequestAt = Date.now();
            saveLastRobloxRequestAt(lastRobloxRequestAt);
            const transactions = await fetchRecentTransactions(groupId, cookie);
            await processGroup(client, groupId, destinations, transactions);
            const updatedState = getGroupState(groupId);
            updatedState.nextRequestAt = 0;
            saveGroupState(groupId, updatedState);
            retryAfter.delete(groupId);
            consecutiveFailures.delete(groupId);
        } catch (error) {
            const failures = (consecutiveFailures.get(groupId) || 0) + 1;
            consecutiveFailures.set(groupId, failures);
            const delay = backoffDuration(error, failures);
            retryAfter.set(groupId, Date.now() + delay);
            const failedState = getGroupState(groupId);
            failedState.nextRequestAt = Date.now() + delay;
            saveGroupState(groupId, failedState);
            if (error.response?.status === 429) {
                console.warn(`[purchaseMonitor] Roblox rate-limited group ${groupId}; retrying in ${Math.ceil(delay / 1000)} seconds.`);
            } else {
                console.error(`[purchaseMonitor] Error fetching transactions for group ${groupId}; retrying in ${Math.ceil(delay / 1000)} seconds:`, error.message);
            }
        }
    }
}

/**
 * Start polling. `client` is the logged-in discord.js Client. Call once
 * on `ready`. Requires ROBLOX_COOKIE in .env — silently does nothing
 * without it (rather than crashing the whole bot).
 */
function start(client) {
    if (isStarted) return;
    const cookie = process.env.ROBLOX_COOKIE;
    if (!cookie) {
        console.log('[purchaseMonitor] ROBLOX_COOKIE not set — purchase monitoring disabled.');
        return;
    }

    isStarted = true;
    console.log(`[purchaseMonitor] Polling each unique Roblox group at most once every ${POLL_INTERVAL_MS / 1000} seconds (up to ${TRANSACTION_LIMIT} transactions per request).`);

    const poll = async () => {
        try {
            await pollGroups(client, cookie);
        } catch (error) {
            console.error('[purchaseMonitor] Polling loop failed:', error.message);
        } finally {
            setTimeout(poll, POLL_INTERVAL_MS);
        }
    };
    poll();
}

module.exports = { start, fetchRecentTransactions, processGroup, pollGroups, transactionKey };
