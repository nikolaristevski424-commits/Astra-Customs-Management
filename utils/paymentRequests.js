const store = require('./store');

const STORE = 'paymentRequests';

function defaultState() {
    return { counter: 1, list: [] };
}

function create(guildId, data) {
    let created;
    store.update(STORE, guildId, defaultState(), (state) => {
        const id = state.counter;
        state.counter += 1;
        created = { id, status: 'Awaiting Payment', createdAt: Date.now(), ...data };
        state.list.push(created);
        return state;
    });
    return created;
}

function find(guildId, id) {
    return store.get(STORE, guildId, defaultState()).list.find((r) => r.id === Number(id));
}

function attachMessage(guildId, id, messageId, channelId) {
    return store.update(STORE, guildId, defaultState(), (state) => {
        const record = state.list.find((r) => r.id === Number(id));
        if (record) Object.assign(record, { messageId, channelId });
        return state;
    });
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

module.exports = { create, find, updateStatus, attachMessage };
