const store = require('./store');

const STORE = 'bundles';

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
    return store.get(STORE, guildId, defaultState()).list.find((b) => b.id === Number(id));
}

function updateStatus(guildId, id, status) {
    let updated = null;
    store.update(STORE, guildId, defaultState(), (state) => {
        const record = state.list.find((b) => b.id === Number(id));
        if (record) {
            record.status = status;
            updated = record;
        }
        return state;
    });
    return updated;
}

module.exports = { create, find, updateStatus };
