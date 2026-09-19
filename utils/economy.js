const store = require('./store');

const STORE = 'economy';
const DAY = 24 * 60 * 60 * 1000;
const WORK_COOLDOWN = 60 * 60 * 1000;

function defaultState() {
    return { balances: {}, dailyAt: {}, workAt: {} };
}

function normalize(state) {
    state.balances ||= {};
    state.dailyAt ||= {};
    state.workAt ||= {};
    return state;
}

function getState(guildId) {
    const saved = store.get(STORE, guildId, defaultState());
    return { ...defaultState(), ...saved, balances: saved.balances || {}, dailyAt: saved.dailyAt || {}, workAt: saved.workAt || {} };
}

function getBalance(guildId, userId) {
    return getState(guildId).balances[userId] || 0;
}

function add(guildId, userId, amount) {
    return store.update(STORE, guildId, defaultState(), (state) => {
        normalize(state);
        state.balances[userId] = Math.max(0, (state.balances[userId] || 0) + amount);
        return state;
    }).balances[userId];
}

function remove(guildId, userId, amount) {
    let removed = false;
    const state = store.update(STORE, guildId, defaultState(), (current) => {
        normalize(current);
        if ((current.balances[userId] || 0) < amount) return current;
        current.balances[userId] -= amount;
        removed = true;
        return current;
    });
    return { success: removed, balance: state.balances[userId] || 0 };
}

function transfer(guildId, fromId, toId, amount) {
    let success = false;
    const state = store.update(STORE, guildId, defaultState(), (current) => {
        normalize(current);
        if (fromId === toId || (current.balances[fromId] || 0) < amount) return current;
        current.balances[fromId] -= amount;
        current.balances[toId] = (current.balances[toId] || 0) + amount;
        success = true;
        return current;
    });
    return { success, senderBalance: state.balances[fromId] || 0 };
}

function claimDaily(guildId, userId) {
    let result;
    store.update(STORE, guildId, defaultState(), (state) => {
        normalize(state);
        const now = Date.now();
        const last = state.dailyAt[userId] || 0;
        if (now - last < DAY) {
            result = { success: false, remaining: DAY - (now - last) };
            return state;
        }
        const amount = 100 + Math.floor(Math.random() * 151);
        state.dailyAt[userId] = now;
        state.balances[userId] = (state.balances[userId] || 0) + amount;
        result = { success: true, amount, balance: state.balances[userId] };
        return state;
    });
    return result;
}

function work(guildId, userId) {
    let result;
    store.update(STORE, guildId, defaultState(), (state) => {
        normalize(state);
        const now = Date.now();
        const last = state.workAt[userId] || 0;
        if (now - last < WORK_COOLDOWN) {
            result = { success: false, remaining: WORK_COOLDOWN - (now - last) };
            return state;
        }
        const amount = 50 + Math.floor(Math.random() * 101);
        state.workAt[userId] = now;
        state.balances[userId] = (state.balances[userId] || 0) + amount;
        result = { success: true, amount, balance: state.balances[userId] };
        return state;
    });
    return result;
}

function coinflip(guildId, userId, amount, choice) {
    const paid = remove(guildId, userId, amount);
    if (!paid.success) return { success: false, balance: paid.balance };
    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const won = result === choice;
    if (won) return { success: true, won: true, result, balance: add(guildId, userId, amount * 2) };
    return { success: true, won: false, result, balance: paid.balance };
}

function leaderboard(guildId, limit = 10) {
    return Object.entries(getState(guildId).balances)
        .filter(([, amount]) => amount > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([userId, amount]) => ({ userId, amount }));
}

module.exports = { getBalance, add, remove, transfer, claimDaily, work, coinflip, leaderboard };