// All outbound calls to Roblox live here so there's one place that knows
// about CSRF tokens, auth headers, and error shapes.
//
// Auth priority for anything under apis.roblox.com: prefer ROBLOX_API_KEY
// (an Open Cloud key from https://create.roblox.com/dashboard/credentials,
// scoped to game-pass:write) over ROBLOX_COOKIE. The API key is the
// officially supported path and doesn't need CSRF handling; the cookie is
// a fallback for groups/collectible endpoints that don't have an Open
// Cloud equivalent yet.

let cachedCsrfToken = null;

async function getCsrfToken(cookie) {
    if (cachedCsrfToken) return cachedCsrfToken;
    const axios = require('axios');
    try {
        await axios.post('https://auth.roblox.com/v2/logout', {}, { headers: { Cookie: `.ROBLOSECURITY=${cookie}` } });
    } catch (error) {
        const token = error.response?.headers?.['x-csrf-token'];
        if (token) {
            cachedCsrfToken = token;
            return token;
        }
    }
    return null;
}

/**
 * Update a game pass's price via Roblox's Open Cloud game-passes API.
 * Needs `universeId` + `gamePassId`. Prefers ROBLOX_API_KEY; falls back
 * to ROBLOX_COOKIE (with CSRF) if no API key is configured.
 */
async function updateGamePassPrice({ universeId, gamePassId, price }) {
    const axios = require('axios');
    const apiKey = process.env.ROBLOX_API_KEY;
    const cookie = process.env.ROBLOX_COOKIE;

    if (!apiKey && !cookie) {
        return { success: false, reason: 'no_credentials' };
    }

    const url = `https://apis.roblox.com/game-passes/v1/universes/${universeId}/game-passes/${gamePassId}`;
    const form = new FormData();
    form.append('price', String(price));
    form.append('isForSale', 'true');

    const headers = {};
    if (apiKey) {
        headers['x-api-key'] = apiKey;
    } else {
        headers.Cookie = `.ROBLOSECURITY=${cookie}`;
        const csrf = await getCsrfToken(cookie);
        if (csrf) headers['X-CSRF-TOKEN'] = csrf;
    }

    try {
        await axios.patch(url, form, { headers });
        return { success: true };
    } catch (error) {
        const status = error.response?.status;
        const message = error.response?.data?.errorMessage || error.message;
        console.error('[roblox] updateGamePassPrice failed:', status, message);
        return { success: false, reason: 'request_failed', status, message };
    }
}

/** Legacy collectible (limited item) price update — kept for shops still selling limiteds instead of gamepasses. */
async function updateCollectiblePrice(assetId, price) {
    const axios = require('axios');
    const cookie = process.env.ROBLOX_COOKIE;
    if (!cookie) return { success: false, reason: 'no_credentials' };

    let collectibleId;
    try {
        const { data } = await axios.get(`https://itemconfiguration.roblox.com/v1/collectibles/0/${assetId}`, {
            headers: { Cookie: `.ROBLOSECURITY=${cookie}` },
        });
        collectibleId = data.collectibleItemId;
    } catch {
        return { success: false, reason: 'not_collectible' };
    }
    if (!collectibleId) return { success: false, reason: 'not_collectible' };

    const csrf = await getCsrfToken(cookie);
    if (!csrf) return { success: false, reason: 'csrf_failed' };

    try {
        await axios.patch(
            `https://itemconfiguration.roblox.com/v1/collectibles/${collectibleId}`,
            {
                saleLocationConfiguration: { saleLocationType: 1, places: [] },
                saleStatus: 0,
                quantityLimitPerUser: 0,
                resaleRestriction: 2,
                priceInRobux: price,
                priceOffset: 0,
                isFree: false,
            },
            { headers: { Cookie: `.ROBLOSECURITY=${cookie}`, 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf } }
        );
        return { success: true };
    } catch (error) {
        return { success: false, reason: 'request_failed', message: error.response?.data || error.message };
    }
}

/**
 * Pay Robux out of the group's funds to a member.
 *
 * IMPORTANT / honest limitation: as of 2026 Roblox frequently requires an
 * interactive security challenge (2FA / "chef" challenge) on this endpoint,
 * even with a valid cookie. This function makes the standard, documented
 * request and does NOT attempt to solve or bypass that challenge — if
 * Roblox responds with a challenge requirement, it's surfaced back as an
 * error so a human can complete the payout manually. There is no reliable
 * way to fully automate around Roblox's account-security challenges, and
 * we're not going to try to build one.
 */
async function payoutGroupRobux({ groupId, robloxUserId, amount }) {
    const axios = require('axios');
    const cookie = process.env.ROBLOX_COOKIE;
    if (!cookie) return { success: false, reason: 'no_credentials' };

    const csrf = await getCsrfToken(cookie);
    if (!csrf) return { success: false, reason: 'csrf_failed' };

    try {
        await axios.post(
            `https://groups.roblox.com/v1/groups/${groupId}/payouts`,
            {
                PayoutType: 'FixedAmount',
                Recipients: [{ recipientId: Number(robloxUserId), recipientType: 'User', amount: Number(amount) }],
            },
            { headers: { Cookie: `.ROBLOSECURITY=${cookie}`, 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf } }
        );
        return { success: true };
    } catch (error) {
        const status = error.response?.status;
        const body = error.response?.data;
        if (body?.challengeId || status === 403) {
            return { success: false, reason: 'challenge_required', message: 'Roblox is requiring an additional security challenge (2FA) on this payout. It has to be completed manually on roblox.com by whoever holds the group funds — this can\'t be automated further.' };
        }
        return { success: false, reason: 'request_failed', status, message: body?.errors?.[0]?.message || error.message };
    }
}

function gamePassLink(gamePassId) {
    return `https://www.roblox.com/game-pass/${gamePassId}`;
}

function gamePlaceLink(placeId) {
    return `https://www.roblox.com/games/${placeId}`;
}

module.exports = { getCsrfToken, updateGamePassPrice, updateCollectiblePrice, payoutGroupRobux, gamePassLink, gamePlaceLink };
