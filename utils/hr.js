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
        if (data.sourceActivityCheckId) {
            created = all.find((infraction) =>
                infraction.sourceActivityCheckId === data.sourceActivityCheckId && infraction.userId === data.userId
            );
            if (created) return all;
        }
        const id = generateId(all.map((i) => i.infractionId));
        created = {
            infractionId: id,
            createdAt: Date.now(),
            voided: false,
            anonymous: false,
            ...data,
        };
        all.push(created);
        return all;
    });
    return created;
}

function voidInfraction(guildId, infractionId, voidedBy) {
    let updated = null;
    store.update(INFRACTIONS, guildId, [], (all) => {
        const record = all.find((infraction) => infraction.infractionId === infractionId);
        if (record && !record.voided) {
            Object.assign(record, { voided: true, voidedAt: Date.now(), voidedBy });
            updated = record;
        }
        return all;
    });
    return updated;
}

function updateInfraction(guildId, infractionId, patch) {
    let updated = null;
    store.update(INFRACTIONS, guildId, [], (all) => {
        const record = all.find((infraction) => infraction.infractionId === infractionId);
        if (record) {
            Object.assign(record, patch);
            updated = record;
        }
        return all;
    });
    return updated;
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

function updatePromotion(guildId, promotionId, patch) {
    let updated = null;
    store.update(PROMOTIONS, guildId, [], (all) => {
        const record = all.find((promotion) => promotion.promotionId === promotionId);
        if (record) {
            Object.assign(record, patch);
            updated = record;
        }
        return all;
    });
    return updated;
}

function voidPromotion(guildId, promotionId, voidedBy, voidReason) {
    const record = listPromotions(guildId).find((promotion) => promotion.promotionId === promotionId);
    if (!record || record.voided) return null;
    return updatePromotion(guildId, promotionId, {
        voided: true,
        voidedAt: Date.now(),
        voidedBy,
        voidReason,
    });
}

module.exports = {
    listInfractions,
    listPromotions,
    issueInfraction,
    voidInfraction,
    updateInfraction,
    issuePromotion,
    updatePromotion,
    voidPromotion,
};
