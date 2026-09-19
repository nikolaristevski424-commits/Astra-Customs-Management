// The "job queue": supervisors post work items with /order add (type,
// quantity, notes, which designer role it's for, up to 5 reference
// images). Quantity becomes that many independently-claimable instances
// — e.g. quantity 5 means 5 designers can each claim one instance of
// the same job. Designers browse open instances with /order list and
// click Request; a supervisor then accepts/denies in a review channel.
//
// This is a distinct system from /order log|status|view|history|reset,
// which is a sales/payment ledger (see utils/orders.js).

const store = require('./store');
const config = require('./config');

const STORE = 'jobs';

function defaultState(guildId) {
    return { counter: config.getConfig(guildId).orderCounterStart || 1000, jobs: [] };
}

function getState(guildId) {
    return store.get(STORE, guildId, defaultState(guildId));
}

function createJob(guildId, { type, quantity, notes, designerRoleId, addedBy, images = [], channelId }) {
    let created;
    store.update(STORE, guildId, defaultState(guildId), (state) => {
        const orderNumber = state.counter;
        state.counter += 1;
        created = {
            orderNumber,
            type,
            notes,
            designerRoleId,
            addedBy,
            images,
            channelId,
            createdAt: Date.now(),
            instances: Array.from({ length: quantity }, (_, i) => ({
                instance: i + 1,
                status: 'open', // open -> pending -> claimed
                requesterId: null,
                designerId: null,
            })),
        };
        state.jobs.push(created);
        return state;
    });
    return created;
}

function findJob(guildId, orderNumber) {
    return getState(guildId).jobs.find((j) => j.orderNumber === Number(orderNumber));
}

function findInstance(guildId, orderNumber, instance) {
    const job = findJob(guildId, orderNumber);
    if (!job) return null;
    const found = job.instances.find((i) => i.instance === Number(instance));
    return found ? { job, instance: found } : null;
}

function updateInstance(guildId, orderNumber, instance, patch) {
    let updated = null;
    store.update(STORE, guildId, defaultState(guildId), (state) => {
        const job = state.jobs.find((j) => j.orderNumber === Number(orderNumber));
        const inst = job?.instances.find((i) => i.instance === Number(instance));
        if (inst) {
            Object.assign(inst, patch);
            updated = inst;
        }
        return state;
    });
    return updated;
}

function deleteInstance(guildId, orderNumber, instance) {
    let removed = null;
    store.update(STORE, guildId, defaultState(guildId), (state) => {
        const job = state.jobs.find((j) => j.orderNumber === Number(orderNumber));
        if (!job) return state;
        const idx = job.instances.findIndex((i) => i.instance === Number(instance));
        if (idx !== -1) removed = job.instances.splice(idx, 1)[0];
        return state;
    });
    return removed;
}

/** Every open instance across every job, each flattened with its parent job's details. */
function listOpenInstances(guildId) {
    const state = getState(guildId);
    const results = [];
    for (const job of state.jobs) {
        for (const instance of job.instances) {
            if (instance.status === 'open') {
                results.push({ ...job, images: job.images, instance: instance.instance, status: instance.status, requesterId: instance.requesterId, designerId: instance.designerId, orderNumber: job.orderNumber });
            }
        }
    }
    return results;
}

module.exports = { createJob, findJob, findInstance, updateInstance, deleteInstance, listOpenInstances, getState };
