const store = require('./store');

const STORE = 'designerProfiles';

function get(guildId, userId) {
    const all = store.get(STORE, guildId, {});
    return all[userId] || null;
}

function set(guildId, userId, specialties) {
    return store.update(STORE, guildId, {}, (all) => {
        all[userId] = { specialties, updatedAt: Date.now() };
        return all;
    })[userId];
}

module.exports = { get, set };
