const {SlashCommandBuilder,MessageFlags} = require('discord.js');
const config=require('../utils/config');
const perms=require('../utils/permissions');
const tickets=require('../utils/tickets');
const monitor=require('../services/purchaseMonitor');
const {isOwner}=require('../utils/ownership');

function uptime(ms){
 const seconds=Math.floor(ms/1000);
 return Math.floor(seconds/86400)+'d '+Math.floor(seconds%86400/3600)+'h '+Math.floor(seconds%3600/60)+'m';
}
module.exports={
 data:new SlashCommandBuilder().setName('health')
   .setDescription('Check Astra Customs bot health and ticket/payment configuration (staff only)'),
 async execute(interaction){
   const cfg=config.getConfig(interaction.guildId);
   if(!perms.isTicketStaff(interaction.member,cfg) && !perms.isManager(interaction.member,cfg) && !isOwner(interaction))
     return interaction.reply({content:'Only staff can view operational diagnostics.',flags:MessageFlags.Ephemeral});
   const ping=Math.round(interaction.client.ws.ping);
   const open=tickets.list(interaction.guildId).filter(t=>!t.closedAt);
   const missing=[
      !cfg.ticketCategoryId && 'TICKET_CATEGORY_ID',
      !cfg.orderCategoryId && 'ORDER_CATEGORY_ID',
      !cfg.transcriptChannelId && 'TRANSCRIPT_CHANNEL_ID',
   ].filter(Boolean);
   const st=cfg.robloxGroupId ? monitor.getGroupState(String(cfg.robloxGroupId)) : null;
   const purchaseChannel=monitor.purchaseLogChannel(interaction.guildId,cfg);
   const status=st?.lastSuccessAt?'<t:'+Math.floor(st.lastSuccessAt/1000)+':R>':'Not yet';
   const next=st?monitor.nextEligiblePollAt(st):null;
   const lines=[
     '**Astra Customs | Bot Health**',
     '🟢 Discord gateway connected',
     '**Gateway latency:** '+(ping>=0?ping+' ms':'Unknown'),
     '**Uptime:** '+uptime(interaction.client.uptime||0),
     '**Commands loaded:** '+(interaction.client.commands?.size||0),
     '**Open tickets:** '+open.filter(t=>t.type!=='order').length+
         ' · **Open orders:** '+open.filter(t=>t.type==='order').length,
     '**Max open tickets per user:** '+tickets.MAX_OPEN_TICKETS+' (orders excluded)',
     '**Configuration:** '+(missing.length?'Review '+missing.join(', '):'Ticket, order and transcript channels configured'),
     '**Roblox group:** '+(cfg.robloxGroupId||'❌ Not configured'),
     '**Roblox credentials:** '+(process.env.ROBLOX_COOKIE?.trim()?'Set (not verified)':'❌ ROBLOX_COOKIE missing'),
     '**Bloxlink verification:** '+(process.env.BLOXLINK_API_KEY?.trim()?'API key configured':'No API key'),
     '**RoGoid verification:** '+(!process.env.ROGOID_API_KEY?.trim()?'No API key':
        !process.env.ROGOID_ROBLOX_TO_DISCORD_URL?.trim()?'API key configured; lookup URL missing':
        'API key and lookup URL configured (not live-tested)'),
     '**Purchase notifications:** '+(purchaseChannel?'<#'+purchaseChannel+'>':'❌ Channel missing'),
   ];
   if(st){
     lines.push('**Last Roblox check:** '+status,
       '**Next eligible check:** '+(next>Date.now()?'<t:'+Math.floor(next/1000)+':R>':'Ready'),
       '**Consecutive transaction errors:** '+st.consecutiveFailures,
       '**Last Roblox error:** '+(st.lastError||'None'),
       '**Last Discord alert error:** '+(st.lastAlertError||'None'),
       '**Last posted purchase:** '+(st.lastAlertAt?'<t:'+Math.floor(st.lastAlertAt/1000)+':R>':'Never'));
   }
   lines.push('Use \`/purchases diagnose\` for the detailed purchase tracking report.');
   return interaction.reply({content:lines.join('\n'),flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
 }
};
