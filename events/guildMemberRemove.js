const {Events}=require('discord.js');
const partnerships=require('../services/partnershipLifecycle');
const serverScope=require('../utils/serverScope');
module.exports={
 name:Events.GuildMemberRemove,
 async execute(member){
   if(!member?.guild?.id || !serverScope.isAstraGuild(member.guild.id))return;
   if(!member.id)return;
   try{
     await partnerships.terminateRepresentative(member.client,member.guild.id,member.id);
   }catch(error){
     console.error('[guildMemberRemove] Could not handle partner representative departure:',error);
   }
 }
};
