const store = require('./store');

const BALANCES = 'credits';
const LOG = 'creditLog';

function getBalance(guildId, userId) {
    const balances = store.get(BALANCES, guildId, {});
    return balances[userId] || 0;
}

function logEntry(guildId, entry) {
    store.update(LOG, guildId, [], (all) => {
        all.push({ at: Date.now(), ...entry });
        // Keep the log from growing forever — recent history is what actually gets read.
        if (all.length > 500) all.splice(0, all.length - 500);
        return all;
    });
}

function addCredit(guildId, userId, amount, { reason, by } = {}) {
    const newBalance = store.update(BALANCES, guildId, {}, (balances) => {
        balances[userId] = (balances[userId] || 0) + amount;
        return balances;
    })[userId];
    logEntry(guildId, { userId, amount, type: 'add', reason: reason || null, by: by || null });
    return newBalance;
}

function removeCredit(guildId, userId, amount, { reason, by } = {}) {
    const newBalance = store.update(BALANCES, guildId, {}, (balances) => {
        balances[userId] = Math.max((balances[userId] || 0) - amount, 0);
        return balances;
    })[userId];
    logEntry(guildId, { userId, amount, type: 'remove', reason: reason || null, by: by || null });
    return newBalance;
}

function getHistory(guildId, userId, limit = 10) {
    const all = store.get(LOG, guildId, []);
    return all
        .filter((e) => e.userId === userId)
        .slice(-limit)
        .reverse();
}

/** Top N balances for /credit leaderboard, highest first. */
function getLeaderboard(guildId, limit = 10) {
    const balances = store.get(BALANCES, guildId, {});
    return Object.entries(balances)
        .filter(([, amount]) => amount > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([userId, amount]) => ({ userId, amount }));
}

module.exports = { getBalance, addCredit, removeCredit, getHistory, getLeaderboard };
