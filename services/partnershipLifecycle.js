const ledger=require('../utils/partnerLedger');
const {PARTNER_CHANNEL_ID}=require('../utils/partnerPosts');
const serverScope=require('../utils/serverScope');

function recordedChannel(entry){
    try{
        const url=new URL(entry.messageUrl);
        const match=url.pathname.match(/^\/channels\/(\d{17,22})\/(\d{17,22})\/(\d{17,22})\/?$/);
        if(url.hostname==='discord.com' && match)
            return{guildId:match[1],channelId:match[2],messageId:match[3]};
    }catch{}
    return null;
}

/** Delete ONLY the tracked bot-authored announcement in the partnership channel. */
async function deleteAnnouncement(client,guildId,entry,{channelFetcher=null}={}){
    const location=recordedChannel(entry);
    const channelId=location?.channelId || process.env.PARTNERSHIP_CHANNEL_ID || PARTNER_CHANNEL_ID;
    const messageId=entry.messageId||location?.messageId;
    const expected=process.env.PARTNERSHIP_CHANNEL_ID || PARTNER_CHANNEL_ID;
    if((location && location.guildId!==String(guildId))||
       channelId!==expected || !/^\d{17,22}$/.test(String(messageId||'')))
        return{deleted:false,error:'Recorded announcement does not match the official partnership channel'};
    try{
        const channel=await (channelFetcher||client.channels.fetch.bind(client.channels))(channelId);
        if(!channel?.messages?.fetch || !channel?.guildId || channel.guildId!==String(guildId))
            return{deleted:false,error:'Partnership announcement channel is unavailable'};
        const message=await channel.messages.fetch(messageId).catch(error=>{
            if(error?.code===10008)return null;
            throw error;
        });
        if(!message)return{deleted:true}; // Already removed.
        if(message.author?.id!==client.user?.id)
            return{deleted:false,error:'The tracked message belongs to a different bot'};
        await message.delete();
        return{deleted:true};
    }catch(error){
        if(error?.code===10008)return{deleted:true};
        console.warn('[partnerships] Failed to remove announcement #'+entry.id+
           ' after representative departure:',error?.code||'Discord error');
        return{deleted:false,error:'Discord message removal failed (code '+(error?.code||'unknown')+')'};
    }
}
async function terminateRepresentative(client,guildId,memberId,options={}){
    if(!serverScope.isAstraGuild(guildId))return{terminated:[],deleted:0,failed:0};
    const terminated=ledger.terminateRepresentative(guildId,memberId);
    let deleted=0,failed=0;
    for(const entry of terminated){
        const result=await deleteAnnouncement(client,guildId,entry,options);
        ledger.markDeletion(guildId,entry.id,result);
        if(result.deleted)deleted++;else failed++;
    }
    if(terminated.length)
       console.log('[partnerships] Representative '+memberId+' left guild '+guildId+
          ': '+terminated.length+' partnership(s) terminated, '+deleted+
          ' announcements removed, '+failed+' needing cleanup.');
    return{terminated,deleted,failed};
}

/** Startup reconciliation catches representative departures while the bot was offline. */
async function reconcileOnReady(client,{fetchMember=null}={}){
    const guildId=process.env.GUILD_ID;
    if(!guildId || !serverScope.isAstraGuild(guildId))return{checked:0,terminated:0};
    const guild=client.guilds.cache.get(guildId);
    if(!guild)return{checked:0,terminated:0};
    const memberIds=[...new Set(ledger.active(guildId).flatMap(e=>e.representativeIds||[]))];
    let terminated=0;
    for(const memberId of memberIds){
        try{
            if(fetchMember)await fetchMember(guild,memberId);
            else await guild.members.fetch({user:memberId,force:true});
        }catch(error){
            // Only the explicit Discord Unknown Member response means departed.
            // Never terminate during a network outage or permission failure.
            if(error?.code!==10007)continue;
            const r=await terminateRepresentative(client,guildId,memberId);
            terminated+=r.terminated.length;
        }
    }
    return{checked:memberIds.length,terminated};
}
module.exports={recordedChannel,deleteAnnouncement,terminateRepresentative,reconcileOnReady};
