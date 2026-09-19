const store = require('./store');

const STORE = 'orders';

const STATUSES = ['Not Paid', 'Paid', 'In Progress', 'Completed', 'Delivered', 'Cancelled', 'Void'];

function defaultState() {
    return { counter: 1, list: [] };
}

function getState(guildId) {
    return store.get(STORE, guildId, defaultState());
}

function createOrder(guildId, order) {
    let created;
    store.update(STORE, guildId, defaultState(), (state) => {
        const id = state.counter;
        state.counter += 1;
        created = {
            id,
            status: 'Not Paid',
            createdAt: Date.now(),
            ...order,
        };
        state.list.push(created);
        return state;
    });
    return created;
}

function findOrder(guildId, id) {
    const state = getState(guildId);
    return state.list.find((o) => o.id === Number(id));
}

function updateOrder(guildId, id, patch) {
    store.update(STORE, guildId, defaultState(), (state) => {
        const order = state.list.find((o) => o.id === Number(id));
        if (order) Object.assign(order, patch);
        return state;
    });
    return findOrder(guildId, id);
}

function listOrders(guildId, filter = {}) {
    const state = getState(guildId);
    return state.list.filter((o) => {
        if (filter.status && o.status !== filter.status) return false;
        if (filter.customerId && o.customerId !== filter.customerId) return false;
        if (filter.designerId && o.designerId !== filter.designerId) return false;
        return true;
    });
}

function resetOrders(guildId) {
    return store.set(STORE, guildId, defaultState());
}

/** Sum of designerEarning across completed/paid orders for a given designer. */
function totalEarnings(guildId, designerId) {
    const state = getState(guildId);
    return state.list
        .filter((o) => o.designerId === designerId && o.status !== 'Void' && o.status !== 'Cancelled')
        .reduce((sum, o) => sum + (o.designerEarning || 0), 0);
}

module.exports = { STATUSES, getState, createOrder, findOrder, updateOrder, listOrders, resetOrders, totalEarnings };
