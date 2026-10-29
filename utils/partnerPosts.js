const {EmbedBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,MessageFlags} = require('discord.js');
const {withFooter}=require('./footerBranding');
const PARTNER_CHANNEL_ID='1497069090081210418';
const pingChoices=[
 {name:'No public ping',value:'none'}, {name:'Selected role',value:'role'},
 {name:'@here',value:'here'}, {name:'@everyone',value:'everyone'}
];
// Accept both discord.gg/example and https://discord.gg/example.
// Only canonical Discord invite hosts are permitted; never turn arbitrary URLs
// into trusted invite buttons.
function normalizeInvite(input){
  let value=String(input||'').trim();
  if(!value)return null;
  if(!/^https?:\/\//i.test(value)){
    if(!/^(?:www\.)?(?:discord\.gg|discord\.com)\//i.test(value))return null;
    value='https://'+value;
  }
  try{
    const u=new URL(value);
    const host=u.hostname.toLowerCase();
    if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash)return null;
    let inviteCode=null;
    if(host==='discord.gg'||host==='www.discord.gg'){
      const match=u.pathname.match(/^\/([a-z0-9_-]+)\/?$/i);
      inviteCode=match?.[1];
    }else if(host==='discord.com'||host==='www.discord.com'){
      const match=u.pathname.match(/^\/invite\/([a-z0-9_-]+)\/?$/i);
      inviteCode=match?.[1];
    }
    return inviteCode?'https://discord.gg/'+inviteCode:null;
  }catch{return null;}
}
function isInvite(value){return normalizeInvite(value)!==null;}
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
 let channel=null;
 try{channel=await interaction.guild.channels.fetch(id);}catch(error){
   console.warn('[partnerPosts] Channel lookup failed:',id,error.message);
 }
 if(!channel?.send || !channel.isTextBased?.() || channel.isDMBased?.())
   return {error:'Could not post: channel <#'+id+'> is missing or is not a text channel. Check PARTNERSHIP_CHANNEL_ID / PAID_AD_CHANNEL_ID.'};
 const inviteUrl=normalizeInvite(invite);
 if(!inviteUrl)return {error:'Invalid Discord invitation. Use discord.gg/example or https://discord.gg/example.'};
 const unique=[...new Set(mentionUsers)].filter(x=>/^\d{17,22}$/.test(x));
 const pingText=[ping.content,...unique.map(id=>'<@'+id+'>')].filter(Boolean).join(' ');
 const embed=new EmbedBuilder().setColor(0x4e8cdb).setTitle(title)
  .setDescription(description).addFields(fields).setFooter({text:'Astra Customs • '+(footer==='paid'?'Sponsored Advertisement':'Partnership')}).setTimestamp();
 const row=new ActionRowBuilder().addComponents(
  new ButtonBuilder().setLabel('Join Server').setStyle(ButtonStyle.Link) .setURL(inviteUrl));
 const payload=withFooter({content:pingText,embeds:[embed],components:[row],
  allowedMentions:{parse:ping.parse||[],users:unique,roles:ping.roles||[]}});
 // A Discord channel can appear in cache but still deny Send Messages / Embed Links.
 const permissions=channel.permissionsFor?.(interaction.client?.user?.id);
 if(permissions && (!permissions.has('SendMessages')||!permissions.has('EmbedLinks')))
   return {error:'Bot cannot post in <#'+id+'>. Grant Send Messages and Embed Links there.'};
 try {
   const message=await channel.send(payload);
   return {message};
 }catch(error){
   console.error('[partnerPosts] Could not publish:',error);
   return {error:'Discord rejected the message: '+error.message};
 }
}
module.exports={PARTNER_CHANNEL_ID,pingChoices,isInvite,normalizeInvite,pingOptions,send};
