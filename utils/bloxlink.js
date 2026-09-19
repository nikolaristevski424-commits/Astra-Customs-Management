const axios = require('axios');

/** Discord ID a Roblox user has verified with, via Bloxlink. Null if unlinked/unknown. */
async function robloxToDiscord(bloxlinkGuildId, robloxId) {
    const apiKey = process.env.BLOXLINK_API_KEY;
    if (!apiKey || !bloxlinkGuildId || !robloxId) return null;
    try {
        const { data } = await axios.get(`https://api.blox.link/v4/public/guilds/${bloxlinkGuildId}/roblox-to-discord/${robloxId}`, {
            headers: { Authorization: apiKey },
        });
        return data.discordIDs?.[0] ?? null;
    } catch {
        return null;
    }
}

/** Roblox user ID a Discord member has verified with, via Bloxlink. Null if unlinked/unknown. */
async function discordToRoblox(bloxlinkGuildId, discordId) {
    const apiKey = process.env.BLOXLINK_API_KEY;
    if (!apiKey || !bloxlinkGuildId || !discordId) return null;
    try {
        const { data } = await axios.get(`https://api.blox.link/v4/public/guilds/${bloxlinkGuildId}/discord-to-roblox/${discordId}`, {
            headers: { Authorization: apiKey },
        });
        return data.robloxID ?? null;
    } catch {
        return null;
    }
}

module.exports = { robloxToDiscord, discordToRoblox };
