const store = require('./store');
const { generateId } = require('./ids');

const STORE = 'loa';

function list(guildId, userId) {
    const all = store.get(STORE, guildId, []);
    return userId ? all.filter((l) => l.userId === userId) : all;
}

function get(guildId, id) {
    return store.get(STORE, guildId, []).find((l) => l.id === id);
}

function request(guildId, data) {
    let created;
    store.update(STORE, guildId, [], (all) => {
        const id = generateId(all.map((l) => l.id));
        created = { id, status: 'pending', requestedAt: Date.now(), ...data };
        all.push(created);
        return all;
    });
    return created;
}

function setStatus(guildId, id, status, extra = {}) {
    let updated = null;
    store.update(STORE, guildId, [], (all) => {
        const record = all.find((l) => l.id === id);
        if (record) {
            Object.assign(record, { status, ...extra });
            updated = record;
        }
        return all;
    });
    return updated;
}

/** Approved LOAs whose end date (ms epoch) has passed and haven't been marked ended yet. */
function findExpired(guildId, now = Date.now()) {
    const all = store.get(STORE, guildId, []);
    return all.filter((l) => l.status === 'approved' && l.endDate && l.endDate <= now);
}

function findActiveForUser(guildId, userId) {
    const all = store.get(STORE, guildId, []);
    return all.find((l) => l.userId === userId && l.status === 'approved');
}

module.exports = { list, get, request, setStatus, findExpired, findActiveForUser };
