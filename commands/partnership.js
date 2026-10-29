const {SlashCommandBuilder,MessageFlags} = require('discord.js');
const config=require('../utils/config');
const perms=require('../utils/permissions');
const {isExecutive}=require('../utils/env');
const partner=require('../utils/partnerPosts');
const {isOwner}=require('../utils/ownership');
const data=new SlashCommandBuilder().setName('partnership')
  .setDescription('Announce a partner server and notify its representatives')
  .addStringOption(o=>o.setName('server').setDescription('Name of the partner server').setRequired(true).setMaxLength(100))
  .addStringOption(o=>o.setName('invite').setDescription('Invite: discord.gg/example or a full Discord invite URL').setRequired(true).setMaxLength(200))
  .addUserOption(o=>o.setName('rep1').setDescription('First partner representative').setRequired(true))
  .addUserOption(o=>o.setName('rep2').setDescription('Second representative (optional)'))
  .addUserOption(o=>o.setName('rep3').setDescription('Third representative (optional)'))
  .addUserOption(o=>o.setName('rep4').setDescription('Fourth representative (optional)'))
  .addUserOption(o=>o.setName('rep5').setDescription('Fifth representative (optional)'))
  .addStringOption(o=>o.setName('details').setDescription('What the partnership includes').setMaxLength(700));
module.exports={
 data,
 async execute(interaction){
   const cfg=config.getConfig(interaction.guildId);
   if(!perms.isManager(interaction.member,cfg) && !isExecutive(interaction.member) && !isOwner(interaction))
     return interaction.reply({content:'Partnership announcements require management.',flags:MessageFlags.Ephemeral});
   const invite=interaction.options.getString('invite',true);
   const inviteUrl=partner.normalizeInvite(invite);
   if(!inviteUrl)return interaction.reply({content:'Invalid invite. Use \`discord.gg/yourserver\` or \`https://discord.gg/yourserver\`.',flags:MessageFlags.Ephemeral});
   const reps=[1,2,3,4,5].map(n=>interaction.options.getUser('rep'+n)).filter(Boolean);
   const representativeIds=[...new Set(reps.map(u=>u.id))];
   if(representativeIds.includes(interaction.user.id))return interaction.reply({content:'The partnership manager is already pinged automatically. Select the other server representatives instead.',flags:MessageFlags.Ephemeral});
   await interaction.deferReply({flags:MessageFlags.Ephemeral});
   const server=interaction.options.getString('server',true);
   const details=interaction.options.getString('details')||'We are pleased to announce a new community partnership.';
   const result=await partner.send(interaction,{
     title:'Astra Customs | New Partnership',
     description:'We are partnering with **'+server+'**!\n\n'+details,
     fields:[{name:'Partner server',value:server,inline:true},
       {name:'Astra management',value:'<@'+interaction.user.id+'>',inline:true},
       {name:'Partner representatives',value:representativeIds.map(id=>'<@'+id+'>').join(', ')}],
     invite:inviteUrl,mentionUsers:[interaction.user.id,...representativeIds],
     ping:{content:'',parse:[],roles:[]},footer:'partnership'
   });
   return interaction.editReply(result.error||'✅ Partnership published to <#'+result.message.channelId+'>: '+result.message.url+
     '\nRepresentatives notified: '+representativeIds.length+'.');
 }
};
