const store = require('./store');

const STORE = 'releases';

function defaultState() {
    return { counter: 1, list: [] };
}

function create(guildId, data) {
    let created;
    store.update(STORE, guildId, defaultState(), (state) => {
        const id = state.counter;
        state.counter += 1;
        created = { id, status: 'active', reactedUserIds: [], createdAt: Date.now(), ...data };
        state.list.push(created);
        return state;
    });
    return created;
}

function find(guildId, id) {
    return store.get(STORE, guildId, defaultState()).list.find((r) => r.id === Number(id));
}

function addReaction(guildId, id, userId) {
    let updated = null;
    store.update(STORE, guildId, defaultState(), (state) => {
        const record = state.list.find((r) => r.id === Number(id));
        if (record && !record.reactedUserIds.includes(userId)) {
            record.reactedUserIds.push(userId);
            updated = record;
        } else {
            updated = record;
        }
        return state;
    });
    return updated;
}

function updateStatus(guildId, id, status) {
    let updated = null;
    store.update(STORE, guildId, defaultState(), (state) => {
        const record = state.list.find((r) => r.id === Number(id));
        if (record) {
            record.status = status;
            updated = record;
        }
        return state;
    });
    return updated;
}

function attachMessage(guildId, id, messageId, channelId) {
    return store.update(STORE, guildId, defaultState(), (state) => {
        const record = state.list.find((r) => r.id === Number(id));
        if (record) Object.assign(record, { messageId, channelId });
        return state;
    });
}

module.exports = { create, find, addReaction, updateStatus, attachMessage };
