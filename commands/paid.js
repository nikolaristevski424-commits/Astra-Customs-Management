const {SlashCommandBuilder,MessageFlags} = require('discord.js');
const {isOwner}=require('../utils/ownership');
const partner=require('../utils/partnerPosts');
const data=new SlashCommandBuilder().setName('paid').setDescription('Ownership-only sponsored posts')
  .addSubcommand(sub=>sub.setName('ad').setDescription('Publish a paid advertisement')
    .addStringOption(o=>o.setName('server').setDescription('Advertiser / server name').setRequired(true).setMaxLength(100))
    .addStringOption(o=>o.setName('ad').setDescription('Advertisement text (up to 1500 characters)').setRequired(true).setMaxLength(1500))
    .addStringOption(o=>o.setName('invite').setDescription('Discord server invite URL').setRequired(true).setMaxLength(200))
    .addStringOption(o=>o.setName('ping').setDescription('Ping choice, like giveaways').addChoices(...partner.pingChoices))
    .addRoleOption(o=>o.setName('ping_role').setDescription('Only when ping is Selected role')));
module.exports={
 data,
 async execute(interaction){
   if(!isOwner(interaction))
     return interaction.reply({content:'Only Astra Customs ownership can publish paid advertisements.',flags:MessageFlags.Ephemeral});
   const invite=interaction.options.getString('invite',true);
   if(!partner.isInvite(invite))return interaction.reply({content:'A valid Discord invite link is required.',flags:MessageFlags.Ephemeral});
   const ping=partner.pingOptions(interaction);
   if(ping.error)return interaction.reply({content:ping.error,flags:MessageFlags.Ephemeral});
   await interaction.deferReply({flags:MessageFlags.Ephemeral});
   const server=interaction.options.getString('server',true);
   const message=interaction.options.getString('ad',true);
   const result=await partner.send(interaction,{
     title:'Astra Customs | Sponsored Advertisement',
     description:'**'+server+'**\n\n'+message+'\n\n*Paid promotion • Advertisement provided by the sponsor.*',
     fields:[{name:'Advertiser',value:server,inline:true},
       {name:'Posted by',value:'<@'+interaction.user.id+'>',inline:true}],
     invite,mentionUsers:[interaction.user.id],ping,footer:'paid'
   });
   return interaction.editReply(result.error||'Paid ad published in <#'+result.message.channelId+'>: '+result.message.url);
 }
};
