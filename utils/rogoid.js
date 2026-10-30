const axios = require('axios');

// RoGoid's documented read-only API supports Discord -> Roblox lookups.
// There is NO documented Roblox -> Discord lookup endpoint.
// Ref: https://docs.rogoid.xyz/api/verifications/
const DISCORD_ID = /^\d{17,22}$/;
const ROBLOX_ID = /^\d{1,20}$/;
const BASE_URL = 'https://api.rogoid.xyz/v1/verifications/';

function readVerifiedAccount(payload, requestedDiscordId) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    // Only a direct, well-formed 200 response is proof of verification.
    const discordId = String(payload.discordId ?? '');
    const robloxId = String(payload.robloxId ?? '');
    if (discordId !== String(requestedDiscordId) || !DISCORD_ID.test(discordId) ||
        !ROBLOX_ID.test(robloxId)) return null;
    return { discordId, robloxId };
}

/** Return the current verified Roblox ID for a Discord member, or null. */
async function discordToRoblox(guildId, discordId, { get = axios.get, env = process.env } = {}) {
    const apiKey = String(env.ROGOID_API_KEY || '').trim();
    if (!apiKey || !DISCORD_ID.test(String(guildId)) || !DISCORD_ID.test(String(discordId))) return null;

    // A RoGoid key can read one server only. Never use this bot's key in another guild.
    if (env.GUILD_ID && String(guildId) !== String(env.GUILD_ID)) return null;

    try {
        const response = await get(BASE_URL + encodeURIComponent(discordId), {
            headers: { Authorization: 'Bearer ' + apiKey, Accept: 'application/json' },
            timeout: 6000,
            maxRedirects: 0,
            validateStatus: status => status >= 200 && status < 500
        });
        if (response.status === 404) return null; // Member is not verified.
        if (response.status !== 200) {
            console.warn('[rogoid] Verification lookup returned HTTP ' + response.status +
                '; leaving member unverified for automatic payment handling.');
            return null;
        }
        return readVerifiedAccount(response.data, discordId)?.robloxId || null;
    } catch (error) {
        // Do not log API keys, request headers, or raw response bodies.
        console.warn('[rogoid] Verification lookup unavailable (' +
            String(error?.code || error?.response?.status || 'network error') +
            '); manual verification may be required.');
        return null;
    }
}

module.exports = { discordToRoblox, readVerifiedAccount, BASE_URL };
