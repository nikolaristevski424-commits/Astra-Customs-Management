const store = require('./store');

const STORE = 'portfolio';

function list(guildId, category) {
    const all = store.get(STORE, guildId, []);
    return category ? all.filter((p) => (p.category || 'General').toLowerCase() === category.toLowerCase()) : all;
}

function listByDesigner(guildId, designerId) {
    return store.get(STORE, guildId, []).filter((p) => p.designerId === designerId);
}

function add(guildId, piece) {
    return store.update(STORE, guildId, [], (all) => {
        all.push({ addedAt: Date.now(), category: 'General', ...piece });
        return all;
    });
}

function removeAt(guildId, index) {
    let removed = null;
    store.update(STORE, guildId, [], (all) => {
        if (index >= 0 && index < all.length) removed = all.splice(index, 1)[0];
        return all;
    });
    return removed;
}

function categories(guildId) {
    const all = store.get(STORE, guildId, []);
    return [...new Set(all.map((p) => p.category || 'General'))];
}

module.exports = { list, listByDesigner, add, removeAt, categories };
