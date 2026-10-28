const {EmbedBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,MessageFlags} = require('discord.js');
const {withFooter}=require('./footerBranding');
const PARTNER_CHANNEL_ID='1497069090081210418';
const pingChoices=[
 {name:'No public ping',value:'none'}, {name:'Selected role',value:'role'},
 {name:'@here',value:'here'}, {name:'@everyone',value:'everyone'}
];
function isInvite(value) {
  try{
    const u=new URL(value);
    const hostname=u.hostname.toLowerCase();
    return u.protocol==='https:' && (hostname==='discord.gg'||
      hostname==='discord.com'||hostname==='www.discord.com') &&
      (hostname==='discord.gg'||u.pathname.startsWith('/invite/')) &&
      /^\/[a-zA-Z0-9_-]+\/?$/.test(hostname==='discord.gg'?u.pathname:u.pathname.replace(/^\/invite/,''));
  }catch{return false;}
}
function pingOptions(interaction){
 const type=interaction.options.getString('ping')||'none';
 const role=interaction.options.getRole('ping_role');
 if(type==='role' && !role)return {error:'Choose a ping_role when selecting the role ping.'};
 if(type!=='role' && role)return {error:'Select "Selected role" to use ping_role.'};
 if(type==='role' && role && !role.mentionable && !interaction.member.permissions.has('MentionEveryone'))
   return {error:'This role is not mentionable. Ask management to adjust its permissions.'};
 if(['everyone','here'].includes(type) && !interaction.member.permissions.has('MentionEveryone'))
   return {error:'You need permission to mention @everyone or @here.'};
 if(type==='role')return {content:'<@&'+role.id+'>',roles:[role.id]};
 if(type==='everyone'||type==='here')return {content:'@'+type,parse:['everyone']};
 return {content:'',roles:[],parse:[]};
}
async function send(interaction,{title,description,fields=[],invite,mentionUsers=[],ping,footer}) {
 const id=process.env[footer==='paid'?'PAID_AD_CHANNEL_ID':'PARTNERSHIP_CHANNEL_ID']||PARTNER_CHANNEL_ID;
 const channel=await interaction.guild.channels.fetch(id).catch(()=>null);
 if(!channel?.send || !channel.isTextBased?.() || channel.isDMBased?.())
   return {error:'Posting channel <#'+id+'> could not be found or cannot accept messages.'};
 const unique=[...new Set(mentionUsers)].filter(x=>/^\d{17,22}$/.test(x));
 const pingText=[ping.content,...unique.map(id=>'<@'+id+'>')].filter(Boolean).join(' ');
 const embed=new EmbedBuilder().setColor(0x4e8cdb).setTitle(title)
  .setDescription(description).addFields(fields).setFooter({text:'Astra Customs • '+(footer==='paid'?'Sponsored Advertisement':'Partnership')}).setTimestamp();
 const row=new ActionRowBuilder().addComponents(
  new ButtonBuilder().setLabel('Join Server').setStyle(ButtonStyle.Link).setURL(invite));
 const payload=withFooter({content:pingText,embeds:[embed],components:[row],
  allowedMentions:{parse:ping.parse||[],users:unique,roles:ping.roles||[]}});
 try {
   const message=await channel.send(payload);
   return {message};
 }catch(error){
   console.error('[partnerPosts] Could not publish:',error);
   return {error:'Discord rejected the message: '+error.message};
 }
}
module.exports={PARTNER_CHANNEL_ID,pingChoices,isInvite,pingOptions,send};
