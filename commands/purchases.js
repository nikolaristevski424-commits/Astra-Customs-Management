const {SlashCommandBuilder,MessageFlags,EmbedBuilder}=require('discord.js');
const config=require('../utils/config');
const perms=require('../utils/permissions');
const {isOwner}=require('../utils/ownership');
const monitor=require('../services/purchaseMonitor');
const receipts=require('../utils/purchaseReceipts');
const {withFooter}=require('../utils/footerBranding');

const flag=MessageFlags.Ephemeral;
const stamp=value=>value?'<t:'+Math.floor(value/1000)+':R>':'Never';
async function channelStatus(client,guildId,channelId){
  if(!channelId)return {ok:false,message:'No purchase log channel configured'};
  const channel=await client.channels.fetch(channelId).catch(()=>null);
  if(!channel?.send)return {ok:false,message:'Channel missing or inaccessible: <#'+channelId+'>'};
  if(channel.guildId && channel.guildId!==guildId)
    return {ok:false,message:'Channel belongs to another server'};
  const permissions=channel.permissionsFor?.(client.user.id);
  if(permissions && (!permissions.has('SendMessages')||!permissions.has('EmbedLinks')))
    return {ok:false,message:'Bot needs Send Messages and Embed Links in <#'+channelId+'>'};
  return {ok:true,channel,message:'Ready: <#'+channelId+'>'};
}
const data=new SlashCommandBuilder().setName('purchases').setDescription('Astra Customs Roblox sales and delivery monitoring')
 .addSubcommand(s=>s.setName('status').setDescription('Inspect Roblox polling and recent payment alerts'))
 .addSubcommand(s=>s.setName('diagnose').setDescription('Check Roblox configuration and alert-channel permissions'))
 .addSubcommand(s=>s.setName('test-log').setDescription('Send a clearly labeled test notification (management only)'))
 .addSubcommand(s=>s.setName('retry').setDescription('Schedule a retry after a Roblox outage (management only)'));
async function execute(interaction){
 const cfg=config.getConfig(interaction.guildId),sub=interaction.options.getSubcommand();
 if(!perms.isStaff(interaction.member,cfg)&&!perms.isManager(interaction.member,cfg)&&!isOwner(interaction))
   return interaction.reply({content:'Staff access required.',flags:flag});
 const manager=perms.isManager(interaction.member,cfg)||isOwner(interaction);
 const groupId=cfg.robloxGroupId?String(cfg.robloxGroupId):null;
 const channelId=monitor.purchaseLogChannel(interaction.guildId,cfg);
 if(sub==='retry'){
   if(!manager)return interaction.reply({content:'Management only.',flags:flag});
   if(!groupId)return interaction.reply({content:'Set ROBLOX_GROUP_ID first.',flags:flag});
   const result=monitor.retryNow(groupId);
   return interaction.reply({flags:flag,content:result.scheduled?
     'Retry scheduled. Requests still respect the 2-minute global spacing and Roblox backoff.':
     'Roblox rate limiting is active. The retry window must finish first.'});
 }
 if(sub==='test-log'){
   if(!manager)return interaction.reply({content:'Management only.',flags:flag});
   await interaction.deferReply({flags:flag});
   const checked=await channelStatus(interaction.client,interaction.guildId,channelId);
   if(!checked.ok)return interaction.editReply('❌ '+checked.message);
   const record=new EmbedBuilder().setColor(0x4b7fcb)
     .setTitle('Astra Customs | PURCHASE ALERT TEST')
     .setDescription('**TEST MESSAGE — NOT A REAL ROBLOX PURCHASE**\nThis confirms the bot can post to the purchase-log channel. It does not confirm Roblox transaction access.')
     .addFields(
       {name:'Tested by',value:'<@'+interaction.user.id+'>',inline:true},
       {name:'Group configured',value:groupId||'Missing',inline:true},
       {name:'Roblox API',value:'Not contacted by this test.',inline:false})
     .setTimestamp();
   try{
     const message=await checked.channel.send(withFooter({embeds:[record],allowedMentions:{parse:[]}},cfg));
     return interaction.editReply('✅ Test notification posted successfully: '+message.url);
   }catch(error){
     return interaction.editReply('❌ Discord refused the test notification: '+error.message.slice(0,220));
   }
 }
 const st=groupId?monitor.getGroupState(groupId):null;
 const records=receipts.list(interaction.guildId);
 const review=records.filter(x=>x.reviewRequired);
 const checked=await channelStatus(interaction.client,interaction.guildId,channelId);
 const monitoringReady=!!(groupId && process.env.ROBLOX_COOKIE?.trim());
 if(sub==='diagnose'){
   return interaction.reply({flags:flag,content:[
     '**Astra Customs | Purchase Tracking Diagnostics**',
     'Roblox group: '+(groupId||'❌ ROBLOX_GROUP_ID missing'),
     'Roblox credentials: '+(process.env.ROBLOX_COOKIE?.trim()?'✅ ROBLOX_COOKIE set (validity not verified)':'❌ ROBLOX_COOKIE missing'),
     'Discord destination: '+(checked.ok?'✅ ':'❌ ')+checked.message,
     cfg.purchaseLogChannelId && cfg.purchaseLogChannelId!==channelId?'⚠️ Env purchase channel differs from the Astra Customs channel. Using <#'+channelId+'>.':'',
     'Last successful Roblox fetch: '+stamp(st?.lastSuccessAt),
     'Last Roblox error: '+(st?.lastError||'None recorded'),
     'Last Discord alert error: '+(st?.lastAlertError||'None recorded'),
     'Last actual alert: '+stamp(st?.lastAlertAt),
     'Recent transaction records read: '+(st?.lastTransactionCount??'Unknown'),
     '',
     'If \`/purchases test-log\` works but sales never arrive, verify that the cookie-owning account can see **Group → Revenue → Sales** and that the purchased asset is **group-owned**.',
     'Roblox group sale reporting may be delayed; this is not an instant webhook.',
   ].filter(Boolean).join('\n'),allowedMentions:{parse:[]}});
 }
 if(!groupId)return interaction.reply({flags:flag,content:'❌ Set ROBLOX_GROUP_ID before purchase monitoring can run.'});
 const next=monitor.nextEligiblePollAt(st);
 return interaction.reply({flags:flag,content:[
   '**Astra Customs | Purchase Monitor**',
   '**Monitoring:** '+(monitoringReady?'Credentials configured (API access not yet verified)':'⚠️ Missing group or cookie'),
   '**Roblox group:** \`'+groupId+'\`',
   '**Discord notifications:** '+checked.message,
   '**Last successful API check:** '+stamp(st.lastSuccessAt),
   '**Next eligible API check:** '+(next>Date.now()?stamp(next):'Ready'),
   '**Last actual purchase alert:** '+stamp(st.lastAlertAt),
   '**Last Roblox error:** '+(st.lastError||'None recorded'),
   '**Last Discord send error:** '+(st.lastAlertError||'None recorded'),
   '**Consecutive API failures:** '+st.consecutiveFailures,
   '**Transactions returned on last check:** '+st.lastTransactionCount,
   '**Receipts recorded:** '+records.length,
   '**Requires manual review:** '+review.length,
   review.length?'Recent review transaction IDs: '+review.slice(-5).map(r=>'\`'+String(r.transactionId).slice(0,32)+'\`').join(', '):'',
   'Use \`/purchases diagnose\` for a full troubleshooting report.',
 ].filter(Boolean).join('\n'),allowedMentions:{parse:[]}});
}
module.exports={data,execute,channelStatus};
