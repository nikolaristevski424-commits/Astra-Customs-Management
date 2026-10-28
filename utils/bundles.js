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

function list(guildId,status=null){
  const records=store.get(STORE,guildId,defaultState()).list;
  return status?records.filter(r=>r.status===status):records;
}
function find(guildId, id) {
    return store.get(STORE, guildId, defaultState()).list.find((b) => b.id === Number(id));
}

function updateStatus(guildId, id, status, extra = {}) {
    let updated = null;
    store.update(STORE, guildId, defaultState(), (state) => {
        const record = state.list.find((b) => b.id === Number(id));
        if (record) {
            Object.assign(record,{status,...extra});
            updated = record;
        }
        return state;
    });
    return updated;
}

module.exports = { create, find, list, updateStatus };
