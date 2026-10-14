const store = require('./store');

const STORE = 'activityChecks';
const CHECK_DURATION_MS = 24 * 60 * 60 * 1000;

function state(guildId) {
    return store.get(STORE, guildId, { counter: 1, checks: {} });
}

function create(guildId, data) {
    let record;
    store.update(STORE, guildId, state(guildId), (current) => {
        const id = current.counter++;
        record = { id, voterIds: [], processedUserIds: [], status: 'active', createdAt: Date.now(), ...data };
        current.checks[id] = record;
        return current;
    });
    return record;
}

function find(guildId, id) {
    return state(guildId).checks[String(id)] || null;
}

function addVote(guildId, id, userId) {
    let result = null;
    store.update(STORE, guildId, state(guildId), (current) => {
        const record = current.checks[String(id)];
        if (!record || record.status === 'completed' || Date.now() >= (record.deadlineAt || record.createdAt + CHECK_DURATION_MS)) return current;
        if (!record.voterIds.includes(userId)) record.voterIds.push(userId);
        result = record;
        return current;
    });
    return result;
}

function attachMessage(guildId, id, messageId, channelId, postedAt = Date.now()) {
    store.update(STORE, guildId, state(guildId), (current) => {
        const record = current.checks[String(id)];
        if (record) Object.assign(record, {
            messageId,
            channelId,
            createdAt: postedAt,
            deadlineAt: postedAt + CHECK_DURATION_MS,
        });
        return current;
    });
}

function listDue(guildId, now = Date.now()) {
    return Object.values(state(guildId).checks)
        .filter((record) => record.status !== 'completed' && now >= (record.deadlineAt || record.createdAt + CHECK_DURATION_MS));
}

function markUserProcessed(guildId, id, userId) {
    store.update(STORE, guildId, state(guildId), (current) => {
        const record = current.checks[String(id)];
        if (record) {
            record.processedUserIds ||= [];
            if (!record.processedUserIds.includes(userId)) record.processedUserIds.push(userId);
        }
        return current;
    });
}

function complete(guildId, id, completedAt = Date.now()) {
    store.update(STORE, guildId, state(guildId), (current) => {
        const record = current.checks[String(id)];
        if (record) Object.assign(record, { status: 'completed', completedAt });
        return current;
    });
}

function cancel(guildId, id, cancelledAt = Date.now()) {
    store.update(STORE, guildId, state(guildId), (current) => {
        const record = current.checks[String(id)];
        if (record) Object.assign(record, { status: 'completed', cancelledAt });
        return current;
    });
}

module.exports = { create, find, addVote, attachMessage, listDue, markUserProcessed, complete, cancel, CHECK_DURATION_MS };