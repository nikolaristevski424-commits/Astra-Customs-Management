const store = require('./store');

const STORE = 'discounts';

function getState(guildId) {
    return store.get(STORE, guildId, {});
}

function normalizeCode(code) {
    return code.trim().toUpperCase();
}

function parseExpiry(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const timestamp = Date.parse(`${value}T23:59:59.999Z`);
    return Number.isFinite(timestamp) ? timestamp : null;
}

function create(guildId, { code, type, amount, expiresAt, maxUses, createdBy }) {
    const key = normalizeCode(code);
    let result;
    store.update(STORE, guildId, {}, (state) => {
        if (state[key] && !state[key].disabled) {
            result = { success: false, reason: 'exists' };
            return state;
        }
        state[key] = { code: key, type, amount, expiresAt, maxUses, uses: 0, usedBy: [], createdBy, createdAt: Date.now(), disabled: false };
        result = { success: true, discount: state[key] };
        return state;
    });
    return result;
}

function isActive(discount) {
    return discount && !discount.disabled && discount.expiresAt > Date.now() && discount.uses < discount.maxUses;
}

function list(guildId) {
    return Object.values(getState(guildId)).filter(isActive).sort((a, b) => a.expiresAt - b.expiresAt);
}

function disable(guildId, code) {
    const key = normalizeCode(code);
    let found = false;
    store.update(STORE, guildId, {}, (state) => {
        if (!state[key]) return state;
        state[key].disabled = true;
        found = true;
        return state;
    });
    return found;
}

function preview(guildId, code, subtotal) {
    const discount = getState(guildId)[normalizeCode(code)];
    if (!discount || discount.disabled) return { success: false, reason: 'invalid' };
    if (discount.expiresAt <= Date.now()) return { success: false, reason: 'expired' };
    if (discount.uses >= discount.maxUses) return { success: false, reason: 'used_up' };
    const savings = discount.type === 'percent' ? Math.min(subtotal, Math.floor((subtotal * discount.amount) / 100)) : Math.min(subtotal, discount.amount);
    return { success: true, code: discount.code, savings, total: subtotal - savings, discount };
}

function redeem(guildId, code, userId, subtotal) {
    const key = normalizeCode(code);
    let result;
    store.update(STORE, guildId, {}, (state) => {
        const discount = state[key];
        if (!discount || discount.disabled) return (result = { success: false, reason: 'invalid' }), state;
        if (discount.expiresAt <= Date.now()) return (result = { success: false, reason: 'expired' }), state;
        if (discount.uses >= discount.maxUses) return (result = { success: false, reason: 'used_up' }), state;
        if (discount.usedBy.includes(userId)) return (result = { success: false, reason: 'already_used' }), state;

        const savings = discount.type === 'percent' ? Math.min(subtotal, Math.floor((subtotal * discount.amount) / 100)) : Math.min(subtotal, discount.amount);
        discount.uses += 1;
        discount.usedBy.push(userId);
        result = { success: true, code: discount.code, savings, total: subtotal - savings, discount };
        return state;
    });
    return result || { success: false, reason: 'invalid' };
}

module.exports = { normalizeCode, parseExpiry, create, list, disable, preview, redeem };