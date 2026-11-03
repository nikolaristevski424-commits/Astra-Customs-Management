const {ChannelType}=require('discord.js');
const tickets=require('./tickets');
const special=require('./specialTickets');
const orders=require('./orderCategories');
const serverScope=require('./serverScope');
const USER_ID=/^\d{16,22}$/;

function topicFor({type,userId,orderId=null}){
    if(!['support','management','report','order'].includes(type) || !USER_ID.test(String(userId)))
        throw Error('Invalid ticket metadata');
    return 'ASTRA-TICKET:v1|type='+type+'|opener='+userId+
        (orderId!=null?'|order='+String(orderId).replace(/[^0-9]/g,'').slice(0,18):'');
}
function parseTopic(topic){
    const match=String(topic||'').match(/^ASTRA-TICKET:v1\|type=(support|management|report|order)\|opener=(\d{16,22})(?:\|order=(\d{1,18}))?$/);
    return match?{type:match[1],userId:match[2],orderId:match[3]||null}:null;
}
function allowedParent(channel,cfg,type){
    const parent=String(channel?.parentId||channel?.parent?.id||'');
    if(!parent)return false;
    if(type==='management'||type==='report')return parent===special.CATEGORY_ID;
    if(type==='support')return parent===String(cfg.ticketCategoryId||'');
    return [...Object.values(orders.CATEGORY_BY_SERVICE),cfg.orderCategoryId]
        .some(id=>id && String(id)===parent);
}
function raw(value){return typeof value?.toJSON==='function'?value.toJSON():value;}
function botCard(messages,channelId,botId){
    const collection=typeof messages?.values==='function'?[...messages.values()]:Array.isArray(messages)?messages:[];
    for(const message of collection){
        if(String(message.author?.id||'')!==String(botId||''))continue;
        const components=(message.components||[]).map(raw);
        const text=JSON.stringify({content:message.content,embeds:(message.embeds||[]).map(raw),components});
        // An opening card must have an actual control bound to this channel.
        if(!text.includes('ticket_claim_'+channelId) &&
           !text.includes('ticket_close_instant_'+channelId))continue;
        let type=null;
        if(/Report a User Ticket/i.test(text))type='report';
        else if(/Management Ticket/i.test(text))type='management';
        else if(/Support Ticket/i.test(text))type='support';
        else if(/Order #\d+/i.test(text))type='order';
        if(!type)continue;
        const match=text.match(/(?:Opened by|Customer)[^<>]{0,150}<@!?(\d{16,22})>/i);
        if(!match)continue;
        const orderId=type==='order'
           ?(text.match(/order_id:(\d+)/)?.[1]||text.match(/Order #(\d+)/i)?.[1]||null):null;
        return{type,userId:match[1],orderId};
    }
    return null;
}
async function recoverTicket(guildId,channelId,client,cfg={},channelHint=null){
    const saved=tickets.get(guildId,channelId);
    if(saved)return saved;
    if(!serverScope.isAstraGuild(guildId) || !USER_ID.test(String(channelId)))return null;
    let channel=channelHint;
    if(!channel || String(channel.id)!==String(channelId))
        channel=await client?.channels?.fetch?.(channelId).catch(()=>null);
    if(!channel || String(channel.id)!==String(channelId) ||
       String(channel.guildId||channel.guild?.id)!==String(guildId) ||
       channel.type!==ChannelType.GuildText)return null;
    let meta=parseTopic(channel.topic);
    if(!meta){
        // Support pre-existing tickets created before channel metadata existed.
        // Accept only a genuine bot-authored opening card, never just a
        // channel name or user-generated ticket-looking message.
        try{
            const messages=await channel.messages.fetch({limit:100});
            meta=botCard(messages,channelId,client?.user?.id);
        }catch(error){
            console.warn('[ticketRecovery] Could not inspect old ticket '+channelId+': '+error.message);
            return null;
        }
    }
    if(!meta || !allowedParent(channel,cfg,meta.type))return null;
    const roles=meta.type==='management'||meta.type==='report'
        ?special.TYPES[meta.type].roleIds
        :meta.type==='support'?['1497415634915561603']
        :[...new Set([...(cfg.ticketStaffRoleIds||[]),...(cfg.staffRoleIds||[])])];
    const restored=tickets.create(guildId,channelId,{
        type:meta.type,userId:meta.userId,orderId:meta.orderId||undefined,
        createdAt:channel.createdTimestamp||Date.now(),
        recoveredAt:Date.now(),reason:'Recovered from verified Discord ticket channel',
        staffRoleIds:roles,
        ...(special.TYPES[meta.type]?{transcriptChannelId:special.TYPES[meta.type].transcriptChannelId}:{})
    });
    console.warn('[ticketRecovery] Recovered ticket '+channelId+' ('+meta.type+') from Discord channel metadata or original bot card.');
    return restored;
}
module.exports={topicFor,parseTopic,allowedParent,botCard,recoverTicket};
