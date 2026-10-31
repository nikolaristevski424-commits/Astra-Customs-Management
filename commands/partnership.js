const {SlashCommandBuilder,MessageFlags} = require('discord.js');
const config=require('../utils/config');
const perms=require('../utils/permissions');
const {isExecutive}=require('../utils/env');
const partner=require('../utils/partnerPosts');
const {isOwner}=require('../utils/ownership');
const partnerLedger=require('../utils/partnerLedger');
const data=new SlashCommandBuilder().setName('partnership')
  .setDescription('Announce a partner server and notify its representatives')
  .addStringOption(o=>o.setName('server').setDescription('Name of the partner server').setRequired(true).setMaxLength(100))
  .addStringOption(o=>o.setName('invite').setDescription('Invite: discord.gg/example or a full Discord invite URL').setRequired(true).setMaxLength(200))
  .addStringOption(o=>o.setName('advertisement').setDescription('Full partner server advertisement (Discord formatting supported)').setRequired(true).setMaxLength(3000))
  .addUserOption(o=>o.setName('rep1').setDescription('First partner representative').setRequired(true))
  .addUserOption(o=>o.setName('rep2').setDescription('Second representative (optional)'))
  .addUserOption(o=>o.setName('rep3').setDescription('Third representative (optional)'))
  .addUserOption(o=>o.setName('rep4').setDescription('Fourth representative (optional)'))
  .addUserOption(o=>o.setName('rep5').setDescription('Fifth representative (optional)'))
  .addStringOption(o=>o.setName('details').setDescription('Optional partnership notes for management').setMaxLength(700));
module.exports={
 data,
 async execute(interaction){
   const cfg=config.getConfig(interaction.guildId);
   const teamRoles=Array.isArray(cfg.partnershipApplicationAcceptRoleId)?cfg.partnershipApplicationAcceptRoleId:
     cfg.partnershipApplicationAcceptRoleId?[cfg.partnershipApplicationAcceptRoleId]:[];
   const onTeam=teamRoles.some(roleId=>interaction.member?.roles?.cache?.has(roleId));
   if(!perms.isManager(interaction.member,cfg) && !isExecutive(interaction.member) && !isOwner(interaction) && !onTeam)
     return interaction.reply({content:'Partnership announcements require the Partnership Team or management.',flags:MessageFlags.Ephemeral});
   const invite=interaction.options.getString('invite',true);
   const inviteUrl=partner.normalizeInvite(invite);
   if(!inviteUrl)return interaction.reply({content:'Invalid invite. Use \`discord.gg/yourserver\` or \`https://discord.gg/yourserver\`.',flags:MessageFlags.Ephemeral});
   const reps=[1,2,3,4,5].map(n=>interaction.options.getUser('rep'+n)).filter(Boolean);
   const representativeIds=[...new Set(reps.map(u=>u.id))];
   if(representativeIds.includes(interaction.user.id))return interaction.reply({content:'The partnership manager is already pinged automatically. Select the other server representatives instead.',flags:MessageFlags.Ephemeral});
   await interaction.deferReply({flags:MessageFlags.Ephemeral});
   const server=interaction.options.getString('server',true);
   const advertisement=interaction.options.getString('advertisement',true).trim();
   if(!advertisement)return interaction.editReply('The partner advertisement cannot be blank.');
   const details=interaction.options.getString('details')?.trim();
   const result=await partner.send(interaction,{
     title:'Astra Customs | New Partnership',
     description:'**'+server+'**\n\n**Server Advertisement**\n'+advertisement+'\n\n*Official Astra Customs partnership.*',
     fields:[{name:'Partner server',value:server,inline:true},
       {name:'Astra management',value:'<@'+interaction.user.id+'>',inline:true},
       {name:'Partner representatives',value:representativeIds.map(id=>'<@'+id+'>').join(', ')},
       ...(details?[{name:'Partnership notes',value:details}]:[])],
     invite:inviteUrl,mentionUsers:[interaction.user.id,...representativeIds],
     ping:{content:'',parse:[],roles:[]},footer:'partnership'
   });
   if(result.error)return interaction.editReply(result.error);
   let tracking;
   try{
     tracking=partnerLedger.record(interaction.guildId,{
       userId:interaction.user.id,server,invite:inviteUrl,
       messageId:result.message.id||null,messageUrl:result.message.url,
       representativeIds
     });
   }catch(error){
     console.error('[partnership] Announcement published but tracking failed:',error);
     return interaction.editReply('✅ Partnership published: '+result.message.url+
       '\n⚠️ Tracking could not be saved; notify management so it can be reviewed.');
   }
   if(!tracking.created&&!tracking.reactivated){
     // Avoid leaving an untracked duplicate announcement in the active
     // partnership channel. The old tracked post remains authoritative.
     await result.message.delete?.().catch(error=>
       console.warn('[partnership] Could not delete duplicate announcement:',error.message));
     return interaction.editReply('This partner invite was already recorded as an active partnership. No duplicate listing or extra R$20 commission was created.');
   }
   const totals=partnerLedger.stats(interaction.guildId,interaction.user.id);
   return interaction.editReply('✅ Partnership published to <#'+result.message.channelId+'>: '+result.message.url+
      '\nRepresentatives notified: '+representativeIds.length+'.\n'+
      (tracking.created?'**Recorded partnerships:** '+totals.count+' · **Accumulated commission:** R$'+totals.robuxEarned:
        'This previously terminated partnership has been re-established. No additional R$20 was counted for an already recorded invite.')+
      '\nCommissions are tracked for management verification; Roblox payouts are not sent automatically.');
 }
};
