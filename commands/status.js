const {SlashCommandBuilder}=require('discord.js');
const manager=require('../utils/serviceStatusManager');
const data=new SlashCommandBuilder().setName('status')
 .setDescription('Set a service status and immediately update the live order panels.')
 .addStringOption(o=>o.setName('service').setDescription('Service to update').setRequired(true)
   .addChoices(...manager.ALL.map(v=>({name:v[0].toUpperCase()+v.slice(1),value:v}))))
 .addStringOption(o=>o.setName('status').setDescription('New availability').setRequired(true)
   .addChoices({name:'Open',value:'open'},{name:'Delayed',value:'delayed'},
     {name:'Closed',value:'closed'},{name:'Premium / Boosters Only',value:'premium'}));
module.exports={data,execute:interaction=>manager.execute(interaction)};
