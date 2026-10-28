const {SlashCommandBuilder}=require('discord.js');
const manager=require('../utils/serviceStatusManager');
const {icons:ICONS}=require('../utils/serviceAvailability');
const data=new SlashCommandBuilder().setName('service')
 .setDescription('Compatibility alias for /status; both update the same live panels.')
 .addStringOption(o=>o.setName('name').setDescription('Service name, e.g. Liveries').setRequired(true)
   .addChoices(...manager.ALL.map(v=>({name:v[0].toUpperCase()+v.slice(1),value:v}))))
 .addStringOption(o=>o.setName('status').setDescription('Availability').setRequired(true)
   .addChoices({name:'Open',value:'open'},{name:'Delayed',value:'delayed'},
     {name:'Closed',value:'closed'},{name:'Premium / Boosters Only',value:'premium'}));
module.exports={ICONS,data,execute:interaction=>manager.execute(interaction,{optionName:'name'})};
