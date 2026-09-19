const store = require('./store');

const STORE = 'packages';

function defaultState() {
    return { counter: 1, list: [] };
}

function create(guildId, data) {
    let created;
    store.update(STORE, guildId, defaultState(), (state) => {
        const id = state.counter;
        state.counter += 1;
        created = { id, status: 'draft', createdAt: Date.now(), ...data };
        state.list.push(created);
        return state;
    });
    return created;
}

function find(guildId, id) {
    return store.get(STORE, guildId, defaultState()).list.find((p) => p.id === Number(id));
}

function listByCreator(guildId, userId) {
    return store.get(STORE, guildId, defaultState()).list.filter((p) => p.createdBy === userId);
}

function list(guildId, status) {
    const all = store.get(STORE, guildId, defaultState()).list;
    return status ? all.filter((p) => p.status === status) : all;
}

function updateStatus(guildId, id, status, extra = {}) {
    let updated = null;
    store.update(STORE, guildId, defaultState(), (state) => {
        const record = state.list.find((p) => p.id === Number(id));
        if (record) {
            Object.assign(record, { status, ...extra });
            updated = record;
        }
        return state;
    });
    return updated;
}

function setPrice(guildId, id, price, changedBy) {
    let updated = null;
    store.update(STORE, guildId, defaultState(), (state) => {
        const record = state.list.find((p) => p.id === Number(id));
        if (record) {
            record.price = price;
            record.priceLastChangedBy = changedBy;
            updated = record;
        }
        return state;
    });
    return updated;
}

module.exports = { create, find, listByCreator, list, updateStatus, setPrice };
