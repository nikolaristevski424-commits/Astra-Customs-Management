const store = require('./store');

const STORE = 'activityChecks';

function state(guildId) {
    return store.get(STORE, guildId, { counter: 1, checks: {} });
}

function create(guildId, data) {
    let record;
    store.update(STORE, guildId, state(guildId), (current) => {
        const id = current.counter++;
        record = { id, voterIds: [], createdAt: Date.now(), ...data };
        current.checks[id] = record;
        return current;
    });
    return record;
}

function find(guildId, id) {
    return state(guildId).checks[String(id)] || null;
}

function addVote(guildId, id, userId) {
    let result = null;
    store.update(STORE, guildId, state(guildId), (current) => {
        const record = current.checks[String(id)];
        if (!record) return current;
        if (!record.voterIds.includes(userId)) record.voterIds.push(userId);
        result = record;
        return current;
    });
    return result;
}

function attachMessage(guildId, id, messageId, channelId) {
    store.update(STORE, guildId, state(guildId), (current) => {
        const record = current.checks[String(id)];
        if (record) Object.assign(record, { messageId, channelId });
        return current;
    });
}

module.exports = { create, find, addVote, attachMessage };