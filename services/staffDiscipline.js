const hr=require('../utils/hr');
const config=require('../utils/config');
const ROLES={Suspension:'STAFF_SUSPENDED_ROLE_ID',Termination:'STAFF_TERMINATED_ROLE_ID','Staff Blacklist':'STAFF_BLACKLIST_ROLE_ID'};
async function apply(client,guildId,record){
 if(!record || !ROLES[record.punishment])return;
 const guild=client.guilds.cache.get(guildId);
 if(!guild)return;
 const member=await guild.members.fetch(record.userId).catch(()=>null);
 if(!member)return;
 const roleId=process.env[ROLES[record.punishment]];
 if(roleId && guild.roles.cache.has(roleId)) {
   await member.roles.add(roleId,'HR action: '+record.punishment+' #'+record.infractionId).catch(e=>console.warn('[staffDiscipline] Cannot add '+record.punishment+' role:',e.message));
 }else{
   console.warn('[staffDiscipline] '+ROLES[record.punishment]+' not configured; recorded infraction only.');
 }
 if(record.punishment==='Termination'||record.punishment==='Staff Blacklist'){
   const cfg=config.getConfig(guildId);
   const staffRoleIds=[...new Set([...(cfg.staffRoleIds||[]),...(cfg.managerRoleIds||[]),...(cfg.hrRoleIds||[]),...(cfg.ticketStaffRoleIds||[])])].filter(id=>member.roles.cache.has(id));
   if(staffRoleIds.length) await member.roles.remove(staffRoleIds,'HR action: '+record.punishment+' #'+record.infractionId).catch(e=>console.warn('[staffDiscipline] Cannot revoke staff roles:',e.message));
 }
}
async function expire(client){
 for(const [guildId,guild] of client.guilds.cache){
   const roleId=process.env.STAFF_SUSPENDED_ROLE_ID;
   if(!roleId)continue;
   const records=hr.listInfractions(guildId);
   const expired=records.filter(i=>!i.voided && i.punishment==='Suspension' && !i.suspensionExpired && i.suspensionExpiresAt && Date.now()>=i.suspensionExpiresAt);
   for(const i of expired){
     const ongoing=records.some(r=>r.infractionId!==i.infractionId && !r.voided && r.userId===i.userId && r.punishment==='Suspension' && !r.suspensionExpired && r.suspensionExpiresAt>Date.now());
     if(!ongoing){
       const member=await guild.members.fetch(i.userId).catch(()=>null);
       if(member?.roles.cache.has(roleId)) {
         try{await member.roles.remove(roleId,'5-day HR suspension complete')}catch(error){console.warn('[staffDiscipline] Suspension expiry retry required:',error.message);continue}
       }
     }
     hr.updateInfraction(guildId,i.infractionId,{suspensionExpired:true,endedAt:Date.now()});
   }
 }
}
function start(client){
 expire(client).catch(console.error);
 const timer=setInterval(()=>expire(client).catch(console.error),300_000);
 timer.unref?.();
}
module.exports={apply,expire,start};
