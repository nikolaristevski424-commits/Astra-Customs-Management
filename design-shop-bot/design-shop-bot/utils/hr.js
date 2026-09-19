const store = require('./store');
const { generateId } = require('./ids');

const INFRACTIONS = 'infractions';
const PROMOTIONS = 'promotions';

function listInfractions(guildId, userId) {
    const all = store.get(INFRACTIONS, guildId, []);
    return userId ? all.filter((i) => i.userId === userId) : all;
}

function listPromotions(guildId, userId) {
    const all = store.get(PROMOTIONS, guildId, []);
    return userId ? all.filter((p) => p.userId === userId) : all;
}

function issueInfraction(guildId, data) {
    let created;
    store.update(INFRACTIONS, guildId, [], (all) => {
        const id = generateId(all.map((i) => i.infractionId));
        created = { infractionId: id, createdAt: Date.now(), voided: false, ...data };
        all.push(created);
        return all;
    });
    return created;
}

function voidInfraction(guildId, infractionId) {
    let removed = null;
    store.update(INFRACTIONS, guildId, [], (all) => {
        const idx = all.findIndex((i) => i.infractionId === infractionId);
        if (idx !== -1) {
            removed = all[idx];
            all.splice(idx, 1);
        }
        return all;
    });
    return removed;
}

function issuePromotion(guildId, data) {
    let created;
    store.update(PROMOTIONS, guildId, [], (all) => {
        const id = generateId(all.map((p) => p.promotionId));
        created = { promotionId: id, createdAt: Date.now(), voided: false, ...data };
        all.push(created);
        return all;
    });
    return created;
}

function voidPromotion(guildId, promotionId) {
    let removed = null;
    store.update(PROMOTIONS, guildId, [], (all) => {
        const idx = all.findIndex((p) => p.promotionId === promotionId);
        if (idx !== -1) {
            removed = all[idx];
            all.splice(idx, 1);
        }
        return all;
    });
    return removed;
}

module.exports = {
    listInfractions,
    listPromotions,
    issueInfraction,
    voidInfraction,
    issuePromotion,
    voidPromotion,
};
