const {SlashCommandBuilder,MessageFlags}=require('discord.js');
const prompts=require('../utils/wouldyourather');
const polls=require('../utils/deadchatPolls');
const deadchat=require('./deadchat');

function pick(category){
  const gaming=/roblox|game|racing|esport|minecraft|avatar|arcade|developer|program|coding|scripting/i;
  const erlc=/er:lc|roleplay|police|sheriff|firefighter|ems|livery|vehicle|department/i;
  const pool=prompts.filter((pair,i)=>{
    if(category==='roblox')return gaming.test(pair.join(' '));
    if(category==='erlc')return erlc.test(pair.join(' '));
    if(category==='general')return !gaming.test(pair.join(' '))&&!erlc.test(pair.join(' '));
    return true;
  });
  const selected=pool.length?pool:prompts;
  return selected[Math.floor(Math.random()*selected.length)];
}

module.exports={
  data:new SlashCommandBuilder().setName('wouldyourather')
   .setDescription('Start a Would You Rather poll with live votes and results')
   .addStringOption(o=>o.setName('category').setDescription('Type of question').addChoices(
      {name:'Anything',value:'all'},{name:'Roblox & Games',value:'roblox'},
      {name:'ER:LC & Roleplay',value:'erlc'},{name:'General',value:'general'})),
  pick,
  async execute(interaction){
    const category=interaction.options.getString('category')||'all';
    const [a,b]=pick(category);
    await interaction.deferReply({flags:MessageFlags.Ephemeral});
    const poll=polls.create(interaction.guildId,{
      channelId:interaction.channelId,creatorId:interaction.user.id,
      question:'Would you rather…',choices:[a,b],kind:'wyr'
    });
    try {
      const message=await interaction.channel.send(deadchat.render(interaction.guildId,poll));
      polls.attach(interaction.guildId,poll.id,message.id);
      return interaction.editReply('**Would You Rather** poll posted! Vote using the buttons: '+message.url);
    }catch(error){
      polls.close(interaction.guildId,poll.id,interaction.user.id);
      console.error('[wouldyourather] Unable to post poll:',error);
      return interaction.editReply('Could not post the poll. Check Send Messages and Embed Links permissions. '+error.message.slice(0,170));
    }
  }
};
