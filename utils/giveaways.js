const store = require('./store');

const STORE = 'giveaways';

function defaultState() {
    return { counter: 1, list: [] };
}

function create(guildId, data) {
    let created;
    store.update(STORE, guildId, defaultState(), (state) => {
        const id = state.counter;
        state.counter += 1;
        created = { id, status: 'active', entrantIds: [], winnerIds: [], createdAt: Date.now(), ...data };
        state.list.push(created);
        return state;
    });
    return created;
}

function find(guildId, id) {
    return store.get(STORE, guildId, defaultState()).list.find((g) => g.id === Number(id));
}

function addEntrant(guildId, id, userId) {
    let updated = null;
    store.update(STORE, guildId, defaultState(), (state) => {
        const record = state.list.find((g) => g.id === Number(id));
        if (record && !record.entrantIds.includes(userId)) record.entrantIds.push(userId);
        updated = record;
        return state;
    });
    return updated;
}

function setWinners(guildId, id, winnerIds) {
    let updated = null;
    store.update(STORE, guildId, defaultState(), (state) => {
        const record = state.list.find((g) => g.id === Number(id));
        if (record) {
            record.status = 'ended';
            record.winnerIds = winnerIds;
            updated = record;
        }
        return state;
    });
    return updated;
}

function attachMessage(guildId, id, messageId, channelId) {
    return store.update(STORE, guildId, defaultState(), (state) => {
        const record = state.list.find((g) => g.id === Number(id));
        if (record) Object.assign(record, { messageId, channelId });
        return state;
    });
}

/** Active giveaways whose end time has passed. */
function findExpired(guildId, now = Date.now()) {
    return store.get(STORE, guildId, defaultState()).list.filter((g) => g.status === 'active' && g.endsAt <= now);
}

/** Pick `count` unique random winners from a list of entrant IDs. */
function pickWinners(entrantIds, count) {
    const pool = [...entrantIds];
    const winners = [];
    while (pool.length && winners.length < count) {
        const idx = Math.floor(Math.random() * pool.length);
        winners.push(pool.splice(idx, 1)[0]);
    }
    return winners;
}

const UNIT_MS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/** "1h", "30m", "2d", "45s" -> milliseconds. Null if unparseable. */
function parseDuration(input) {
    const match = /^(\d+)\s*(s|m|h|d)$/i.exec((input || '').trim());
    if (!match) return null;
    const [, amount, unit] = match;
    return Number(amount) * UNIT_MS[unit.toLowerCase()];
}

module.exports = { create, find, addEntrant, setWinners, attachMessage, findExpired, pickWinners, parseDuration };
