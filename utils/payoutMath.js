// Payouts use the gross item price, Roblox's 30% marketplace deduction,
// then the highest designer role's configured share of the after-tax Robux.
// Values are floored at each stage to avoid paying partial Robux.
const ROBLOX_TAX_PERCENT = 30;
const MAX_TOTAL_PRICE = 100_000_000;

function memberRoleIds(member) {
    const roles = member?.roles?.cache;
    if (roles && typeof roles.keys === 'function') return new Set(roles.keys());
    if (roles && typeof roles.map === 'function') return new Set(roles.map(role=>role.id));
    if (Array.isArray(member?.roles)) return new Set(member.roles);
    return new Set();
}

function selectCommission(member, cfg) {
    const active = memberRoleIds(member);
    const rates = cfg?.commissionRates || {};
    let selected = null;
    for (const [roleId, rawRate] of Object.entries(rates)) {
        const rate = Number(rawRate);
        if (!active.has(roleId) || !Number.isFinite(rate) || rate <= 0 || rate > 100) continue;
        if (!selected || rate > selected.rate) selected = {roleId,rate};
    }
    return selected;
}

function calculatePayout(totalPrice, rate) {
    if (!Number.isSafeInteger(totalPrice) || totalPrice < 1 || totalPrice > MAX_TOTAL_PRICE)
        throw new RangeError('Total price must be a positive whole Robux amount (maximum '+MAX_TOTAL_PRICE+').');
    if (!Number.isSafeInteger(rate) || rate <= 0 || rate > 100)
        throw new RangeError('The designer commission rate must be between 1% and 100%.');
    const tax = Math.ceil(totalPrice * ROBLOX_TAX_PERCENT / 100);
    const afterTax = totalPrice - tax;
    const amount = Math.floor(afterTax * rate / 100);
    return {totalPrice,robloxTaxPercent:ROBLOX_TAX_PERCENT,robloxTax:tax,afterTax,commissionPercent:rate,amount};
}

module.exports = {ROBLOX_TAX_PERCENT,MAX_TOTAL_PRICE,memberRoleIds,selectCommission,calculatePayout};
