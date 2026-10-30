const bloxlink = require('./bloxlink');
const rogoid = require('./rogoid');

const DISCORD_ID = /^\d{17,22}$/;
const ROBLOX_ID = /^\d{1,20}$/;

/**
 * For standalone Discord-member lookups: check Bloxlink first, then
 * RoGoid's documented GET /v1/verifications/:discordId endpoint.
 */
async function discordToRobloxWithSource(guildId, discordId, {
    bloxlinkLookup = bloxlink.discordToRoblox,
    rogoidLookup = rogoid.discordToRoblox
} = {}) {
    if (!DISCORD_ID.test(String(guildId)) || !DISCORD_ID.test(String(discordId)))
        return { userId: null, source: null };
    const fromBloxlink = await bloxlinkLookup(guildId, discordId).catch(() => null);
    if (fromBloxlink != null && ROBLOX_ID.test(String(fromBloxlink)))
        return { userId: String(fromBloxlink), source: 'bloxlink' };
    const fromRogoid = await rogoidLookup(guildId, discordId).catch(() => null);
    if (fromRogoid != null && ROBLOX_ID.test(String(fromRogoid)))
        return { userId: String(fromRogoid), source: 'rogoid' };
    return { userId: null, source: null };
}

/**
 * Bloxlink can resolve Roblox ID -> Discord ID. RoGoid cannot: its public
 * API only supports Discord ID -> Roblox ID. Never invent a reverse lookup.
 */
async function robloxToDiscordWithSource(guildId, robloxId, {
    bloxlinkLookup = bloxlink.robloxToDiscord
} = {}) {
    if (!DISCORD_ID.test(String(guildId)) || !ROBLOX_ID.test(String(robloxId)))
        return { userId: null, source: null };
    const fromBloxlink = await bloxlinkLookup(guildId, robloxId).catch(() => null);
    if (fromBloxlink != null && DISCORD_ID.test(String(fromBloxlink)))
        return { userId: String(fromBloxlink), source: 'bloxlink' };
    return { userId: null, source: null };
}

/**
 * Verify a Roblox sale. First use Bloxlink's reverse mapping.
 * When Bloxlink finds nobody, compare the Roblox buyer directly against the
 * RoGoid verification of the *known Discord customer* on the payment reservation.
 *
 * Never treat a different buyer ID, a missing reservation, or a provider error
 * as proof of payment. Without a known customer, RoGoid has no reverse-lookup
 * endpoint to safely identify who should receive automatic credit/delivery.
 */
async function verifyPurchaseBuyer(guildId, buyerRobloxId, customerDiscordId, {
    bloxlinkLookup = bloxlink.robloxToDiscord,
    rogoidLookup = rogoid.discordToRoblox
} = {}) {
    const fromBloxlink = await robloxToDiscordWithSource(guildId, buyerRobloxId, {bloxlinkLookup});
    if (fromBloxlink.userId) return fromBloxlink;

    if (!DISCORD_ID.test(String(guildId)) ||
        !ROBLOX_ID.test(String(buyerRobloxId)) ||
        !DISCORD_ID.test(String(customerDiscordId ?? '')))
        return { userId: null, source: null };

    const verifiedRoblox = await rogoidLookup(guildId, customerDiscordId).catch(() => null);
    if (verifiedRoblox != null && String(verifiedRoblox) === String(buyerRobloxId))
        return { userId: String(customerDiscordId), source: 'rogoid' };
    return { userId: null, source: null };
}
async function robloxToDiscord(guildId, robloxId, options) {
    return (await robloxToDiscordWithSource(guildId, robloxId, options)).userId;
}
async function discordToRoblox(guildId, discordId, options) {
    return (await discordToRobloxWithSource(guildId, discordId, options)).userId;
}

module.exports = {
    robloxToDiscord, discordToRoblox, robloxToDiscordWithSource,
    discordToRobloxWithSource, verifyPurchaseBuyer
};
