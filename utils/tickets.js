const store = require('./store');

const STORE = 'tickets';

function get(guildId, channelId) {
    const all = store.get(STORE, guildId, {});
    return all[channelId];
}

function findOpenForUser(guildId, userId, type = null) {
    const all = store.get(STORE, guildId, {});
    return Object.values(all).find((ticket) => ticket.userId === userId && !ticket.closedAt && (!type || ticket.type === type));
}

// Orders are separate from the support/management/report ticket allowance.
const MAX_OPEN_TICKETS=3;
function openForUser(guildId,userId,{includeOrders=false}={}){
    return list(guildId).filter(ticket=>ticket.userId===userId && !ticket.closedAt &&
      (includeOrders || ticket.type!=='order'));
}
function ticketLimit(guildId,userId){
    const open=openForUser(guildId,userId);
    return{count:open.length,max:MAX_OPEN_TICKETS,remaining:Math.max(0,MAX_OPEN_TICKETS-open.length),
      allowed:open.length<MAX_OPEN_TICKETS,open};
}

function list(guildId) {
    return Object.values(store.get(STORE, guildId, {}));
}

function create(guildId, channelId, data) {
    return store.update(STORE, guildId, {}, (all) => {
        all[channelId] = { channelId, createdAt: Date.now(), ...data };
        return all;
    })[channelId];
}

function update(guildId, channelId, patch) {
    return store.update(STORE, guildId, {}, (all) => {
        if (all[channelId]) Object.assign(all[channelId], patch);
        return all;
    })[channelId];
}

function remove(guildId, channelId) {
    store.update(STORE, guildId, {}, (all) => {
        delete all[channelId];
        return all;
    });
}

module.exports = { get, list, findOpenForUser, openForUser, ticketLimit, MAX_OPEN_TICKETS, create, update, remove };
