const {SlashCommandBuilder,MessageFlags,ChannelType}=require('discord.js');
const config=require('../utils/config');
const perms=require('../utils/permissions');
const packages=require('../utils/packages');
const bundles=require('../utils/bundles');
const {permissions}=require('../utils/catalogThreads');
module.exports={
 data:new SlashCommandBuilder().setName('review').setDescription('Review queue and channel diagnostics')
 .addSubcommand(s=>s.setName('queue').setDescription('List pending packages and bundles'))
 .addSubcommand(s=>s.setName('diagnose').setDescription('Diagnose bot review-thread permissions')),
 async execute(interaction){
  const cfg=config.getConfig(interaction.guildId);
  if(!perms.isStaff(interaction.member,cfg)&&!perms.isManager(interaction.member,cfg))
    return interaction.reply({content:'Only staff can access the review dashboard.',flags:64});
  const sub=interaction.options.getSubcommand();
  if(sub==='queue'){
    const pendingPackages=packages.list(interaction.guildId,'pending');
    const pendingBundles=bundles.list?.(interaction.guildId,'Pending') || [];
    const p=pendingPackages.slice(-12).map(x=>'`#'+x.id+'` '+String(x.name).slice(0,70)+' — R$'+x.price);
    const b=pendingBundles.slice(-12).map(x=>'`#'+x.id+'` '+String(x.bundleType).slice(0,70));
    return interaction.reply({flags:64,content:'**Astra Customs | Review Queue**\\n**Packages ('+pendingPackages.length+')**\\n'+
      (p.join('\\n')||'None')+'\\n\\n**Bundles ('+pendingBundles.length+')**\\n'+
      (b.join('\\n')||'None')+'\\n\\nUse the review message buttons to approve or deny.'});
  }
  const id=cfg.packageBundleChannelId||cfg.packageReviewChannelId;
  if(!id)return interaction.reply({flags:64,content:'Set PACKAGE_BUNDLE_CHANNEL_ID or PACKAGE_REVIEW_CHANNEL_ID to a text or forum channel.'});
  const channel=await interaction.client.channels.fetch(id).catch(()=>null);
  if(!channel)return interaction.reply({flags:64,content:'Review channel <#'+id+'> is missing or inaccessible to the bot.'});
  const p=permissions(channel,interaction.client.user.id);
  const type=[ChannelType.GuildForum,ChannelType.GuildMedia].includes(channel.type)?'Forum/Media':
    channel.type===ChannelType.GuildText?'Text':'Other';
  const fallback=(channel.type===ChannelType.GuildText&&p.canSend)
    ?'A review message can be posted directly if thread creation fails.':'No direct-message fallback in this channel.';
  return interaction.reply({flags:64,content:'**Astra Customs | Review Channel Check**\\nChannel: <#'+id+'> ('+type+')\\n'+
    'Thread creation: '+(p.canThread?'✅ Permitted':'⚠️ Check permissions')+'\\n'+
    'Effective bot permissions missing: '+(p.missing.join(', ')||'None')+'\\n'+fallback+
    '\\nForum posts require **Send Messages**; text threads require **Create Public Threads** and **Send Messages in Threads**.'});
 }
};
