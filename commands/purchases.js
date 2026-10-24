const {SlashCommandBuilder,MessageFlags}=require('discord.js');
const config=require('../utils/config'),perms=require('../utils/permissions');
const monitor=require('../services/purchaseMonitor');
const receipts=require('../utils/purchaseReceipts');
module.exports={
  data:new SlashCommandBuilder().setName('purchases').setDescription('Review Astra Customs Roblox sale monitoring')
    .addSubcommand(s=>s.setName('status').setDescription('Show monitor health and verification queue'))
    .addSubcommand(s=>s.setName('retry').setDescription('Retry polling after an outage (manager only)')),
  async execute(interaction){
    const cfg=config.getConfig(interaction.guildId);
    if(!perms.isStaff(interaction.member,cfg)&&!perms.isManager(interaction.member,cfg))
      return interaction.reply({content:'Staff access required.',flags:MessageFlags.Ephemeral});
    if(!cfg.robloxGroupId)return interaction.reply({content:'Set ROBLOX_GROUP_ID in the bot environment.',flags:MessageFlags.Ephemeral});
    const groupId=String(cfg.robloxGroupId),sub=interaction.options.getSubcommand();
    if(sub==='retry'){
      if(!perms.isManager(interaction.member,cfg))return interaction.reply({content:'Managers only.',flags:MessageFlags.Ephemeral});
      monitor.retryNow(groupId);
      return interaction.reply({content:'Roblox monitoring retry scheduled on the next polling cycle. A server-side HTTP 500 may still recur.',flags:MessageFlags.Ephemeral});
    }
    const st=monitor.getGroupState(groupId);
    const records=receipts.list(interaction.guildId);
    const needsReview=records.filter(r=>r.reviewRequired);
    const last=st.lastSuccessAt?'<t:'+Math.floor(st.lastSuccessAt/1000)+':R>':'Never';
    const retry=st.nextRequestAt>Date.now()?'<t:'+Math.floor(st.nextRequestAt/1000)+':R>':'Ready';
    return interaction.reply({flags:MessageFlags.Ephemeral,content:[
      '**Astra Customs | Purchase Monitor**',
      'Roblox Group: \`'+groupId+'\`',
      'Last successful check: '+last,
      'Next eligible poll: '+retry,
      'Consecutive failures: '+st.consecutiveFailures,
      'Last error: '+(st.lastError||'None'),
      'Recorded receipts: '+records.length,
      'Needs staff verification: '+needsReview.length,
      needsReview.length?'Review transaction IDs: '+needsReview.slice(-8).map(r=>'\`'+r.transactionId+'\`').join(', '):'',
      '',
      'Do not deliver items or release payment slots before confirming the buyer.',
    ].filter(Boolean).join('\n')});
  }
};
