const {SlashCommandBuilder,EmbedBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,MessageFlags}=require('discord.js');
const config=require('../utils/config');
const perms=require('../utils/permissions');
const {isExecutive}=require('../utils/env');
const {isOwner}=require('../utils/ownership');
const polls=require('../utils/deadchatPolls');
const {withFooter}=require('../utils/footerBranding');

function canManage(interaction){
  const cfg=config.getConfig(interaction.guildId);
  return perms.isStaff(interaction.member,cfg)||perms.isManager(interaction.member,cfg)||
    isExecutive(interaction.member)||isOwner(interaction);
}
function render(guildId,poll){
  const values=polls.counts(poll),total=values.reduce((a,b)=>a+b,0);
  const kind=poll.kind||'deadchat';
  const prefix=kind==='wyr'?'Would You Rather':kind==='poll'?'Community Poll':'Dead Chat Poll';
  const title=poll.status==='open'?prefix:prefix+' · Final Results';
  const rows=poll.choices.map((choice,i)=>{
    const count=values[i],percent=total?Math.round(100*count/total):0;
    const blocks=Math.round(percent/10);
    const bar='▰'.repeat(blocks)+'▱'.repeat(10-blocks);
    return '**'+(i+1)+'. '+choice+'**\n'+bar+' **'+percent+'%** · '+count+' vote'+(count===1?'':'s');
  });
  const embed=new EmbedBuilder().setColor(poll.status==='open'?0x4677db:0x72809e)
    .setTitle('Astra Customs | '+title)
    .setDescription('**'+poll.question+'**\n\n'+rows.join('\n\n')+
      '\n\n**Total votes:** '+total+
      '\n'+(poll.status==='open'?'Select an answer below. You can change your vote.':'**Voting closed.**'))
    .setFooter({text:prefix+' #'+poll.id+' • '+(poll.status==='open'?'Live votes':'Final results')})
    .setTimestamp(poll.createdAt);
  const buttons=poll.choices.map((choice,i)=>new ButtonBuilder()
    .setCustomId('community_vote_'+poll.id+'_'+i)
    .setLabel((kind==='wyr'?(i===0?'A':'B')+': ':'')+choice.slice(0,kind==='wyr'?68:75))
    .setStyle(i===0?ButtonStyle.Primary:i===1?ButtonStyle.Success:ButtonStyle.Secondary)
    .setDisabled(poll.status!=='open'));
  return withFooter({embeds:[embed],components:[new ActionRowBuilder().addComponents(buttons)],allowedMentions:{parse:[]}});
}
const data=new SlashCommandBuilder().setName('deadchat').setDescription('Run a chat-revival poll with live vote counts')
  .addSubcommand(sub=>sub.setName('start').setDescription('Start a live dead-chat poll (staff)')
    .addStringOption(o=>o.setName('question').setDescription('Optional poll question').setMaxLength(200))
    .addStringOption(o=>o.setName('option1').setDescription('First answer').setMaxLength(75))
    .addStringOption(o=>o.setName('option2').setDescription('Second answer').setMaxLength(75))
    .addStringOption(o=>o.setName('option3').setDescription('Third answer').setMaxLength(75))
    .addStringOption(o=>o.setName('option4').setDescription('Fourth answer').setMaxLength(75)))
  .addSubcommand(sub=>sub.setName('results').setDescription('Show the latest dead-chat poll vote totals'))
  .addSubcommand(sub=>sub.setName('end').setDescription('Close the latest dead-chat poll (staff)'));

async function updatePublic(client,guildId,poll) {
  const channel=await client.channels.fetch(poll.channelId).catch(()=>null);
  if(!channel?.messages?.fetch||!poll.messageId)return false;
  const message=await channel.messages.fetch(poll.messageId).catch(()=>null);
  if(!message)return false;
  await message.edit(render(guildId,poll));
  return true;
}
async function execute(interaction){
  const sub=interaction.options.getSubcommand();
  const gid=interaction.guildId;
  if(sub==='start'){
    if(!canManage(interaction))return interaction.reply({content:'Only staff can start dead-chat polls.',flags:MessageFlags.Ephemeral});
    const choices=[1,2,3,4].map(i=>interaction.options.getString('option'+i)).filter(Boolean).map(x=>x.trim());
    if(!choices.length)choices.push('Chat together','Game night','Community event');
    if(choices.length<2||new Set(choices.map(x=>x.toLowerCase())).size!==choices.length)
      return interaction.reply({content:'Provide at least two different options.',flags:MessageFlags.Ephemeral});
    const existing=polls.latest(gid,interaction.channelId);
    if(existing?.status==='open')return interaction.reply({content:'An active poll already exists in this channel. Use `/deadchat end` first.',flags:MessageFlags.Ephemeral});
    const question=(interaction.options.getString('question')||'What should we do to get this chat active?').trim();
    if(!question)return interaction.reply({content:'Enter a question.',flags:MessageFlags.Ephemeral});
    await interaction.deferReply({flags:MessageFlags.Ephemeral});
    const poll=polls.create(gid,{channelId:interaction.channelId,creatorId:interaction.user.id,question,choices});
    try{
      const post=await interaction.channel.send(render(gid,poll));
      polls.attach(gid,poll.id,post.id);
      return interaction.editReply('✅ Poll #'+poll.id+' published: '+post.url+'\nVotes and percentages update automatically.');
    }catch(error){
      polls.close(gid,poll.id,interaction.user.id);
      return interaction.editReply('Could not post poll. Check Send Messages and Embed Links permissions. '+error.message.slice(0,160));
    }
  }
  const poll=polls.latest(gid,interaction.channelId);
  if(!poll)return interaction.reply({content:'There is no dead-chat poll in this channel.',flags:MessageFlags.Ephemeral});
  if(sub==='results'){
    const total=polls.counts(poll).reduce((a,b)=>a+b,0);
    const results=polls.counts(poll).map((v,i)=>poll.choices[i]+': **'+v+'** ('+(total?Math.round(100*v/total):0)+'%)').join('\n');
    return interaction.reply({content:'**Poll #'+poll.id+' Results**\n'+results+'\n**Total voters:** '+total,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
  }
  if(sub==='end'){
    if(!canManage(interaction))return interaction.reply({content:'Only staff can close polls.',flags:MessageFlags.Ephemeral});
    await interaction.deferReply({flags:MessageFlags.Ephemeral});
    const result=polls.close(gid,poll.id,interaction.user.id);
    try{await updatePublic(interaction.client,gid,result.poll);}
    catch(error){return interaction.editReply('Poll closed, but the visible message could not update: '+error.message);}
    return interaction.editReply(result.alreadyClosed?'Poll already closed.':'Poll closed. Final results are displayed.');
  }
}
async function handleVote(interaction) {
  const match=interaction.customId.match(/^(?:community_vote|deadchat_vote)_(\d+)_(\d+)$/);
  if(!match)return interaction.reply({content:'Invalid poll option.',flags:MessageFlags.Ephemeral});
  const poll=polls.find(interaction.guildId,match[1]);
  if(!poll||poll.messageId!==interaction.message.id||poll.channelId!==interaction.channelId)
    return interaction.reply({content:'This is not an active registered poll.',flags:MessageFlags.Ephemeral});
  if(poll.status!=='open')return interaction.reply({content:'Voting has ended.',flags:MessageFlags.Ephemeral});
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  const result=polls.vote(interaction.guildId,poll.id,interaction.user.id,Number(match[2]));
  if(result.error)return interaction.editReply(result.error);
  let refreshWarning='';
  try{await interaction.message.edit(render(interaction.guildId,result.poll));}
  catch(error){
    console.error('[communityPolls] Could not refresh poll counts:',error.message);
    refreshWarning=' Your vote was saved, but the public counts could not refresh. Staff should check the bot permissions.';
  }
  return interaction.editReply((result.changed?
    'Your vote for **'+result.poll.choices[Number(match[2])]+'** was counted!':
    'Your vote is already recorded for that option.')+refreshWarning);
}
module.exports={data,execute,render,handleVote,canManage,updatePublic};
