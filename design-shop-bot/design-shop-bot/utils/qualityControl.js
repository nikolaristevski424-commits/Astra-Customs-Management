const store = require('./store');

const STORE = 'qualityControl';

function defaultState() {
    return { counter: 1, list: [] };
}

function create(guildId, data) {
    let created;
    store.update(STORE, guildId, defaultState(), (state) => {
        const id = state.counter;
        state.counter += 1;
        created = { id, status: 'pending', createdAt: Date.now(), ...data };
        state.list.push(created);
        return state;
    });
    return created;
}

function find(guildId, id) {
    return store.get(STORE, guildId, defaultState()).list.find((s) => s.id === Number(id));
}

function updateStatus(guildId, id, status, extra = {}) {
    let updated = null;
    store.update(STORE, guildId, defaultState(), (state) => {
        const record = state.list.find((s) => s.id === Number(id));
        if (record) {
            Object.assign(record, { status, ...extra });
            updated = record;
        }
        return state;
    });
    return updated;
}

function attachMessage(guildId, id, messageId, channelId) {
    return store.update(STORE, guildId, defaultState(), (state) => {
        const record = state.list.find((s) => s.id === Number(id));
        if (record) Object.assign(record, { messageId, channelId });
        return state;
    });
}

module.exports = { create, find, updateStatus, attachMessage };
