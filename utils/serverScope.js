// Astra Customs Management is a private, single-server bot.
// Only the official Astra guild may run commands or receive service actions.
// AUTO_LEAVE_OTHER_GUILDS=1 enables automatic cleanup at startup and on joins.
const ASTRA_GUILD_ID = '1488378242846036070';

function isAstraGuild(guildId) {
    return String(guildId || '') === ASTRA_GUILD_ID;
}

function autoLeaveEnabled(env = process.env) {
    const value = String(env.AUTO_LEAVE_OTHER_GUILDS ?? '0').trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(value);
}

function joinedGuilds(client) {
    return [...client.guilds.cache.values()]
        .map(guild => ({
            id: String(guild.id),
            name: String(guild.name || 'Unknown server'),
            memberCount: guild.memberCount || 0,
            allowed: isAstraGuild(guild.id),
        }))
        .sort((a, b) => Number(b.allowed) - Number(a.allowed) || a.name.localeCompare(b.name));
}

async function checkGuild(guild, { autoLeave = autoLeaveEnabled() } = {}) {
    if (isAstraGuild(guild.id)) return { id: guild.id, status: 'allowed' };
    console.warn('[serverScope] Other server detected: '+guild.name+' ('+guild.id+').');
    if (!autoLeave) return { id: guild.id, status: 'blocked' };
    try {
        await guild.leave();
        console.warn('[serverScope] Left unauthorized server: '+guild.name+' ('+guild.id+').');
        return { id: guild.id, status: 'left' };
    } catch (error) {
        console.error('[serverScope] Could not leave '+guild.name+' ('+guild.id+'):', error);
        return { id: guild.id, status: 'error', error: error.message };
    }
}

async function enforceGuilds(client, options = {}) {
    const before = joinedGuilds(client);
    console.log('[serverScope] Connected servers: '+(before.length || 0));
    for (const guild of before) {
        console.log('[serverScope] '+(guild.allowed ? 'ASTRA' : 'OTHER')+' | '+guild.name+' | '+guild.id);
    }
    const results = [];
    for (const guild of [...client.guilds.cache.values()]) {
        results.push(await checkGuild(guild, options));
    }
    return results;
}

module.exports = {
    ASTRA_GUILD_ID, isAstraGuild, autoLeaveEnabled, joinedGuilds, checkGuild, enforceGuilds
};
