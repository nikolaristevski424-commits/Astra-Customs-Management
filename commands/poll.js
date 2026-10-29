const {SlashCommandBuilder,MessageFlags}=require('discord.js');
const config=require('../utils/config');
const perms=require('../utils/permissions');
const {isExecutive}=require('../utils/env');
const {isOwner}=require('../utils/ownership');
const polls=require('../utils/deadchatPolls');
const deadchat=require('./deadchat');

function canManage(interaction){
 const cfg=config.getConfig(interaction.guildId);
 return perms.isStaff(interaction.member,cfg)||perms.isManager(interaction.member,cfg)||
   isExecutive(interaction.member)||isOwner(interaction);
}
const data=new SlashCommandBuilder().setName('poll').setDescription('Community polls with live percentages')
 .addSubcommand(s=>s.setName('create').setDescription('Publish a poll with up to five choices (staff)')
   .addStringOption(o=>o.setName('question').setDescription('Poll question').setRequired(true).setMaxLength(250))
   .addStringOption(o=>o.setName('option1').setDescription('First answer').setRequired(true).setMaxLength(75))
   .addStringOption(o=>o.setName('option2').setDescription('Second answer').setRequired(true).setMaxLength(75))
   .addStringOption(o=>o.setName('option3').setDescription('Optional third answer').setMaxLength(75))
   .addStringOption(o=>o.setName('option4').setDescription('Optional fourth answer').setMaxLength(75))
   .addStringOption(o=>o.setName('option5').setDescription('Optional fifth answer').setMaxLength(75)))
 .addSubcommand(s=>s.setName('results').setDescription('See vote totals for the latest poll in this channel'))
 .addSubcommand(s=>s.setName('end').setDescription('Close the latest poll in this channel (staff)'));
async function execute(interaction){
 const type=interaction.options.getSubcommand();
 if(type==='create'){
   if(!canManage(interaction))
     return interaction.reply({content:'Only staff can create public community polls.',flags:MessageFlags.Ephemeral});
   const choices=[1,2,3,4,5].map(i=>interaction.options.getString('option'+i))
     .filter(Boolean).map(x=>x.trim());
   if(choices.some(x=>!x) || new Set(choices.map(x=>x.toLowerCase())).size!==choices.length)
     return interaction.reply({content:'Every answer must be different and non-empty.',flags:MessageFlags.Ephemeral});
   const question=interaction.options.getString('question',true).trim();
   if(!question)return interaction.reply({content:'The question cannot be empty.',flags:MessageFlags.Ephemeral});
   await interaction.deferReply({flags:MessageFlags.Ephemeral});
   const poll=polls.create(interaction.guildId,{
     channelId:interaction.channelId,creatorId:interaction.user.id,
     question,choices,kind:'poll'
   });
   try {
     const message=await interaction.channel.send(deadchat.render(interaction.guildId,poll));
     polls.attach(interaction.guildId,poll.id,message.id);
     return interaction.editReply('✅ Poll created! Votes update automatically: '+message.url);
   }catch(error){
     polls.close(interaction.guildId,poll.id,interaction.user.id);
     console.error('[poll] Failed to publish:',error);
     return interaction.editReply('Could not publish poll: '+error.message.slice(0,160));
   }
 }
 const poll=polls.latest(interaction.guildId,interaction.channelId,'poll');
 if(!poll)return interaction.reply({content:'No community poll found in this channel.',flags:MessageFlags.Ephemeral});
 if(type==='results'){
   const votes=polls.counts(poll),total=votes.reduce((a,b)=>a+b,0);
   return interaction.reply({content:'**'+poll.question+'**\n'+votes.map((count,i)=>
     '**'+poll.choices[i]+'** — '+count+' vote'+(count===1?'':'s')+' ('+
     (total?Math.round(100*count/total):0)+'%)').join('\n')+
     '\n**Total voters: '+total+'**',flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
 }
 if(type==='end'){
   if(!canManage(interaction))
     return interaction.reply({content:'Only staff can close polls.',flags:MessageFlags.Ephemeral});
   await interaction.deferReply({flags:MessageFlags.Ephemeral});
   const result=polls.close(interaction.guildId,poll.id,interaction.user.id);
   let error=null;
   try {await deadchat.updatePublic(interaction.client,interaction.guildId,result.poll);}
   catch(e){error=e.message;}
   return interaction.editReply('Poll closed. '+(error?'Could not refresh the visible results: '+error:
     'Final vote counts are displayed.'));
 }
}
module.exports={data,execute,canManage};
