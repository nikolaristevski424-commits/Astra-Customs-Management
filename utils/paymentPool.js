// Instead of registering payment game passes one-by-one through Discord,
// the shop lists them once in .env (PAYMENT_GAMEPASS_IDS=id1,id2,...).
// /payment request then auto-picks whichever one isn't currently
// reserved, sets its price, and hands back the link — no manual "which
// slot do I use" step. A reservation auto-expires after a while so a
// forgotten/abandoned order doesn't permanently lock a slot out of the
// pool.

const store = require('./store');
const { parseIdList } = require('./env');

const STORE = 'paymentPool';
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function getPoolIds() {
    return parseIdList(process.env.PAYMENT_GAMEPASS_IDS);
}

function getState(guildId) {
    return store.get(STORE, guildId, {});
}

function isExpired(record, ttlMs) {
    return !record || !record.reservedAt || Date.now() - record.reservedAt > ttlMs;
}

/** Reserve and return the first free (or expired-reservation) gamepass ID from the pool. Null if none available. */
function pickAvailable(guildId, note, ttlMs = DEFAULT_TTL_MS, metadata = {}) {
    const poolIds = getPoolIds();
    if (!poolIds.length) return null;

    let picked = null;
    store.update(STORE, guildId, {}, (state) => {
        for (const id of poolIds) {
            if (isExpired(state[id], ttlMs)) {
                state[id] = { reservedAt: Date.now(), note: note || null, ...metadata };
                picked = id;
                break;
            }
        }
        return state;
    });
    return picked;
}

function findReservation(guildId, gamePassId, ttlMs = DEFAULT_TTL_MS) {
    const record = getState(guildId)[gamePassId];
    return isExpired(record, ttlMs) ? null : { gamePassId, ...record };
}

function release(guildId, gamePassId) {
    let released = false;
    store.update(STORE, guildId, {}, (state) => {
        if (state[gamePassId]) {
            delete state[gamePassId];
            released = true;
        }
        return state;
    });
    return released;
}

/** Status of every configured pool slot, for /payment pool. */
function listStatus(guildId, ttlMs = DEFAULT_TTL_MS) {
    const poolIds = getPoolIds();
    const state = getState(guildId);
    return poolIds.map((id) => {
        const record = state[id];
        const reserved = !isExpired(record, ttlMs);
        return { gamePassId: id, reserved, reservedAt: reserved ? record.reservedAt : null, note: reserved ? record.note : null };
    });
}

module.exports = { getPoolIds, pickAvailable, findReservation, release, listStatus, DEFAULT_TTL_MS };
