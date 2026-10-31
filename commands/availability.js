const {SlashCommandBuilder}=require('discord.js');
const config=require('../utils/config');
const availability=require('../utils/serviceAvailability');
const catalog=require('../utils/catalog');
const {makeCard,COLORS}=require('../utils/visualSystem');

const data=new SlashCommandBuilder().setName('availability')
 .setDescription('Check current Astra Customs service availability');

function buildAvailabilityCard(cfg,guildId){
 const entries=Object.entries(catalog.TYPES);
 const open=entries.filter(([id])=>availability.status(cfg,id)==='open').length;
 const services=entries.map(([id,group])=>{
   const state=availability.status(cfg,id);
   return (availability.icons[state]||'•')+' **'+group.label+'**  ·  '+
      (availability.labels[state]||state);
 });
 const statuses=[
    availability.icons.open+' **Open**  — Orders accepted',
    availability.icons.delayed+' **Delayed**  — Longer turnaround',
    availability.icons.closed+' **Closed**  — Not accepting orders',
    availability.icons.premium+' **Premium**  — Restricted availability'
 ].join('\n');
 const record=cfg.orderStatusPanel;
 const link=record?.channelId&&record?.messageId
   ? 'https://discord.com/channels/'+guildId+'/'+record.channelId+'/'+record.messageId:null;
 return makeCard(cfg,{
   title:'Service Availability',
   subtitle:'LIVE STATUS  ·  '+open+' OF '+entries.length+' SERVICES OPEN',
   intro:'See which services are currently accepting commissions. Each row uses Astra Customs’ original status badges.',
   details:['**SERVICE DIRECTORY**\n'+services.join('\n'),
     '**STATUS GUIDE**\n'+statuses],
   note:(link?'**Live panel**  [Open Order Status]('+link+')\n':'')+
      '**Updates**  Availability is managed through `/status`.\n'+
      '**Support**  Open a ticket from the dedicated Tickets panel.',
   accentColor:COLORS.primary,ephemeral:true
 });
}
module.exports={data,buildAvailabilityCard,
 async execute(interaction){
   const cfg=config.getConfig(interaction.guildId);
   return interaction.reply(buildAvailabilityCard(cfg,interaction.guildId));
 }
};
