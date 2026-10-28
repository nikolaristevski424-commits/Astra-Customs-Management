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
 const current=config.getConfig(guildId).serviceStatus||{};
 // Replace the entire status dictionary with normalized keys. setNested()
 // preserves old differently-cased names and caused stale status displays.
 const cleaned=availability.canonicalizeStatuses(current);
 cleaned[service]=status;
 const updated=config.setConfig(guildId,{serviceStatus:cleaned});
 if(availability.status(updated,service)!==status)
   throw Error('Status verification failed; no status-panel update was attempted.');
 return updated;
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
 let after;
 try{after=set(interaction.guildId,type,value);}
 catch(error){return interaction.editReply('Could not save service status: '+error.message);}
 let result;
 try{result=await panel.refreshPanels(interaction.client,interaction.guildId,{discover:true});}
 catch(error){return interaction.editReply('✅ **'+type+'** saved as **'+availability.labels[value]+'**, but panel refresh failed: '+error.message);}
 const changed=result.filter(x=>x.updated).map(x=>x.type+' ('+(x.count||1)+' message'+((x.count||1)>1?'s':'')+')');
 const statusPanel=result.find(x=>x.type==='order-status');
 const statusUpdated=!!statusPanel?.updated;
 const details=statusUpdated
   ?'✅ **Visible status embed edited successfully.** '+changed.join(', ')+'.'
   :'⚠️ **Status saved, but the visible status panel was NOT updated.** Use \`/panel track-status\` with its message ID, followed by \`/panel refresh\`.';
 const warnings=result.filter(x=>x.error).map(x=>x.type+': '+x.error).join(' | ');
 const statusUrl=statusPanel?.messageIds?.[0]&&statusPanel?.channelId?
  'https://discord.com/channels/'+interaction.guildId+'/'+statusPanel.channelId+'/'+statusPanel.messageIds[0]:null;
 return interaction.editReply({content:'**'+type+'** → '+availability.icons[value]+' **'+availability.labels[value]+'** (saved and verified)\n'+details+
   (statusUrl?'\n[View updated order-status message]('+statusUrl+')':'')+
   (warnings?'\n⚠️ '+warnings.slice(0,700):'')});
}
module.exports={ALL,STATUSES,canManage,set,execute};
