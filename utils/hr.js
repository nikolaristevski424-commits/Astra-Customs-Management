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

const ESCALATION_RULES=Object.freeze({
 Notice:{count:2,next:'Warning'},Warning:{count:2,next:'Strike'},Strike:{count:3,next:'Suspension'},
 Suspension:{count:2,next:'Termination'},Termination:{count:2,next:'Staff Blacklist'}
});
const FIVE_DAYS=5*24*60*60*1000;
function issueInfraction(guildId,data){
 let created;
 store.update(INFRACTIONS,guildId,[],all=>{
   if(data.sourceActivityCheckId){
     created=all.find(i=>i.sourceActivityCheckId===data.sourceActivityCheckId && i.userId===data.userId);
     if(created)return all;
   }
   const add=(patch)=>{
      const infractionId=generateId(all.map(i=>i.infractionId));
      const record={infractionId,createdAt:Date.now(),voided:false,anonymous:false,...patch};
      if(record.punishment==='Suspension')record.suspensionExpiresAt=record.createdAt+FIVE_DAYS;
      all.push(record);
      return record;
   };
   created=add(data);
   const cascades=[];let last=created;
   while(ESCALATION_RULES[last.punishment]){
      const rule=ESCALATION_RULES[last.punishment];
      const num=all.filter(i=>!i.voided && i.userId===data.userId && i.punishment===last.punishment).length;
      if(num%rule.count!==0)break;
      last=add({userId:data.userId,issuedBy:data.issuedBy,anonymous:!!data.anonymous,
          punishment:rule.next,automatic:true,sourceInfractionId:last.infractionId,
          reason:'Automatic escalation after '+rule.count+' active '+last.punishment.toLowerCase()+' infractions.'});
      cascades.push({...last});
   }
   created.escalations=cascades;
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
