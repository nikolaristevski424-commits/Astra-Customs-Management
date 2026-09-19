const store = require('./store');

const STORE = 'tickets';

function get(guildId, channelId) {
    const all = store.get(STORE, guildId, {});
    return all[channelId];
}

function findOpenForUser(guildId, userId) {
    const all = store.get(STORE, guildId, {});
    return Object.values(all).find((ticket) => ticket.userId === userId && !ticket.closedAt);
}

function create(guildId, channelId, data) {
    return store.update(STORE, guildId, {}, (all) => {
        all[channelId] = { channelId, createdAt: Date.now(), ...data };
        return all;
    })[channelId];
}

function update(guildId, channelId, patch) {
    return store.update(STORE, guildId, {}, (all) => {
        if (all[channelId]) Object.assign(all[channelId], patch);
        return all;
    })[channelId];
}

function remove(guildId, channelId) {
    store.update(STORE, guildId, {}, (all) => {
        delete all[channelId];
        return all;
    });
}

module.exports = { get, findOpenForUser, create, update, remove };
