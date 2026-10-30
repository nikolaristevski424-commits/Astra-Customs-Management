const {SlashCommandBuilder,MessageFlags} = require('discord.js');
const config=require('../utils/config');
const perms=require('../utils/permissions');
const tickets=require('../utils/tickets');
const monitor=require('../services/purchaseMonitor');
const {isOwner}=require('../utils/ownership');
const credentials=require('../utils/credentialChecks');

function uptime(ms){
 const seconds=Math.floor(ms/1000);
 return Math.floor(seconds/86400)+'d '+Math.floor(seconds%86400/3600)+'h '+Math.floor(seconds%3600/60)+'m';
}
module.exports={
 data:new SlashCommandBuilder().setName('health')
   .setDescription('Check Astra Customs bot health and ticket/payment configuration (staff only)')
   .addBooleanOption(o=>o.setName('test_credentials')
     .setDescription('Management only: safely test Roblox, Bloxlink and RoGoid credentials')),
 async execute(interaction){
   const cfg=config.getConfig(interaction.guildId);
   if(!perms.isTicketStaff(interaction.member,cfg) && !perms.isManager(interaction.member,cfg) && !isOwner(interaction))
     return interaction.reply({content:'Only staff can view operational diagnostics.',flags:MessageFlags.Ephemeral});
   const live=interaction.options?.getBoolean?.('test_credentials')===true;
   if(live && !perms.isManager(interaction.member,cfg) && !isOwner(interaction))
     return interaction.reply({content:'Only Astra Customs management can run live credential checks.',flags:MessageFlags.Ephemeral});
   if(live){
     const wait=credentials.acquireCheck(interaction.guildId);
     if(wait)return interaction.reply({content:'Credential tests were run recently. Try again in '+wait+' seconds. Ordinary /health remains available.',flags:MessageFlags.Ephemeral});
     await interaction.deferReply({flags:MessageFlags.Ephemeral});
   }
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
     '**Roblox cookie:** '+(process.env.ROBLOX_COOKIE?.trim()?'Configured (not tested by default)':'❌ Missing'),
     '**Roblox Open Cloud key:** '+(process.env.ROBLOX_API_KEY?.trim()?'Configured (not tested here)':'Not set (optional)'),
     '**Bloxlink verification:** '+(process.env.BLOXLINK_API_KEY?.trim()?'API key configured (not tested by default)':'❌ No API key'),
     '**RoGoid verification:** '+(process.env.ROGOID_API_KEY?.trim()?
        'API key configured (not tested by default)':'❌ No API key configured'),
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
   if(live){
     const results=await credentials.runAll(interaction.guildId,interaction.user.id);
     const icons={working:'✅',unlinked:'ℹ️',missing:'❌',rejected:'❌',denied:'❌',rate_limited:'⚠️',unavailable:'⚠️'};
     lines.push('','**Read-only connection tests (this request)**');
     for(const [label,r] of [['Roblox cookie',results.roblox],['Bloxlink',results.bloxlink],['RoGoid',results.rogoid]]){
       lines.push((icons[r.state]||'⚠️')+' **'+label+':** '+r.detail);
     }
     lines.push('A successful check confirms the selected endpoint, not purchase processing, payouts, or every API permission.');
   }else{
     lines.push('**Want to check keys?** Management can run \u0060/health test_credentials:true\u0060.');
   }
   lines.push('Use \u0060/purchases diagnose\u0060 for detailed purchase monitoring.');
   const payload={content:lines.join('\n'),allowedMentions:{parse:[]}};
   if(live)return interaction.editReply(payload);
   return interaction.reply({...payload,flags:MessageFlags.Ephemeral});
 }
};
