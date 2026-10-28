const config=require('./config');
const availability=require('./serviceAvailability');
const perms=require('./permissions');
const {isExecutive}=require('./env');
const panel=require('../commands/panel');
const ALL=Object.freeze(['discord','liveries','graphics','uniforms','bots','logos','embeds','websites','els']);
const STATUSES=Object.freeze(['open','delayed','closed','premium']);
function canManage(member,cfg){return perms.isManager(member,cfg)||isExecutive(member);}
function set(guildId,service,status){
 if(!ALL.includes(service)||!STATUSES.includes(status))throw Error('Invalid service or status.');
 return config.setNested(guildId,'serviceStatus',{[service]:status});
}
async function execute(interaction,{optionName='service'}={}){
 const cfg=config.getConfig(interaction.guildId);
 if(!canManage(interaction.member,cfg))
   return interaction.reply({content:'Only managers or configured executives can change service availability.',flags:64});
 const type=availability.normalize(interaction.options.getString(optionName,true));
 if(!type)return interaction.reply({content:'Unknown service. Available: '+ALL.join(', '),flags:64});
 const value=interaction.options.getString('status',true);
 if(!STATUSES.includes(value))return interaction.reply({content:'Invalid service status.',flags:64});
 await interaction.deferReply({flags:64});
 set(interaction.guildId,type,value);
 const result=await panel.refreshPanels(interaction.client,interaction.guildId,{discover:true});
 const changed=result.filter(x=>x.updated).map(x=>x.type);
 const details=changed.length?'Updated live panel'+(changed.length>1?'s':'')+': '+changed.join(' and ')+'.':
  'Saved status, but no existing panel could be edited. Use \`/panel order-status\` to publish/register one.';
 const warnings=result.filter(x=>x.error).map(x=>x.type+': '+x.error).join(' | ');
 return interaction.editReply({content:'**'+type+'** → '+availability.icons[value]+' **'+availability.labels[value]+'**\n'+details+
   (warnings?'\n⚠️ '+warnings.slice(0,800):'')});
}
module.exports={ALL,STATUSES,canManage,set,execute};
