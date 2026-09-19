const store = require('./store');

const STORE = 'payoutRequests';

function defaultState() {
    return { counter: 1, list: [] };
}

function create(guildId, data) {
    let created;
    store.update(STORE, guildId, defaultState(), (state) => {
        const id = state.counter;
        state.counter += 1;
        created = { id, status: 'Pending', createdAt: Date.now(), ...data };
        state.list.push(created);
        return state;
    });
    return created;
}

function find(guildId, id) {
    return store.get(STORE, guildId, defaultState()).list.find((r) => r.id === Number(id));
}

function list(guildId, status) {
    const all = store.get(STORE, guildId, defaultState()).list;
    return status ? all.filter((r) => r.status === status) : all;
}

function updateStatus(guildId, id, status, extra = {}) {
    let updated = null;
    store.update(STORE, guildId, defaultState(), (state) => {
        const record = state.list.find((r) => r.id === Number(id));
        if (record) {
            Object.assign(record, { status, ...extra });
            updated = record;
        }
        return state;
    });
    return updated;
}

module.exports = { create, find, list, updateStatus };
