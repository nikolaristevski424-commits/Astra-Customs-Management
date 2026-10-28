const {SlashCommandBuilder,MessageFlags,EmbedBuilder}=require('discord.js');
const config=require('../utils/config');
const availability=require('../utils/serviceAvailability');
const catalog=require('../utils/catalog');
const {withFooter}=require('../utils/footerBranding');
const data=new SlashCommandBuilder().setName('availability').setDescription('Check current Astra Customs service availability');
module.exports={
 data,
 async execute(interaction){
   const cfg=config.getConfig(interaction.guildId);
   const lines=Object.entries(catalog.TYPES).map(([key,group])=>{
     const status=availability.status(cfg,key);
     return '**'+group.label+'** '+(availability.icons[status]||'')+' **'+(availability.labels[status]||status)+'**';
   });
   const record=cfg.orderStatusPanel;
   const link=record?.channelId&&record?.messageId
     ?'https://discord.com/channels/'+interaction.guildId+'/'+record.channelId+'/'+record.messageId:null;
   const embed=new EmbedBuilder().setColor(0x4566bd).setTitle('Astra Customs | Service Availability')
      .setDescription('**Current ordering availability**\\n\\n'+lines.join('\\n')+
        (link?'\\n\\n[View the live order-status panel]('+link+')':'\\n\\nNeed help? Open a support ticket.'))
      .setFooter({text:'Availability can change as designers become available.'});
   return interaction.reply(withFooter({flags:MessageFlags.Ephemeral,embeds:[embed],allowedMentions:{parse:[]}},cfg));
 }
};
