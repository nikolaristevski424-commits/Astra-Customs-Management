const { withFooter } = require('./footerBranding');
const {makeCard,ORDER_STATES,safe}=require('./visualSystem');
const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } = require('discord.js');
const orders=require('./orders');
const tickets=require('./tickets');
const perms=require('./permissions');
const STAGES=['Not Paid','Paid','In Progress','Completed','Delivered'];
const BUTTONS=[['paid','Paid',ButtonStyle.Success],['working','Start Work',ButtonStyle.Primary],['completed','Complete',ButtonStyle.Primary],['delivered','Delivered',ButtonStyle.Success],['cancelled','Cancel',ButtonStyle.Danger]];
const TARGETS={paid:'Paid',working:'In Progress',completed:'Completed',delivered:'Delivered',cancelled:'Cancelled'};
const COLORS={'Not Paid':0x718096,'Paid':0x2aa876,'In Progress':0x4174d9,Completed:0x9b59b6,Delivered:0x2aa876,Cancelled:0xd9534f,Void:0xd9534f};
// Designers can move between work stages in any order, including correcting
// a previous selection. Payment confirmation stays a management decision.
function canTransition(from,to){
 if(from===to || from==='Void')return false;
 if(!Object.values(TARGETS).includes(to))return false;
 // Cancelled orders must be reopened by management using /order update.
 if(from==='Cancelled')return false;
 return true;
}
function controls(order){
 const btns=BUTTONS.map(([code,label,style])=>
   new ButtonBuilder().setCustomId('order_stage_'+order.id+'_'+code).setLabel(label).setStyle(style)
    .setDisabled(!canTransition(order.status,TARGETS[code])));
 const rows=[new ActionRowBuilder().addComponents(btns)];
 if(order.ticketChannelId)rows.push(new ActionRowBuilder().addComponents(
   new ButtonBuilder().setCustomId('ticket_claim_'+order.ticketChannelId).setLabel(order.designerId?'Designer Assigned':'Claim Order').setStyle(ButtonStyle.Secondary).setDisabled(!!order.designerId),
   new ButtonBuilder().setCustomId('ticket_close_'+order.ticketChannelId).setLabel('Request Close').setStyle(ButtonStyle.Secondary),
   new ButtonBuilder().setCustomId('ticket_close_instant_'+order.ticketChannelId).setLabel('Staff: Close Instantly').setStyle(ButtonStyle.Danger)
 ));
 return rows;
}
function embed(cfg,order,ticket){
 const progress=STAGES.map(s=>s===order.status?'🔵':'▫️').join('  ');
 const e=new EmbedBuilder().setColor(COLORS[order.status]||0x718096)
  .setTitle('Astra Customs | Order #'+order.id)
  .setDescription('**'+String(order.product||'Commission').slice(0,100)+'**\n'+progress+'\n**Current status: '+order.status+'**')
  .addFields(
   {name:'Order ID',value:'`#'+order.id+'` — use this with `/payment create order_id:'+order.id+'`',inline:false},
   {name:'Customer',value:order.customerId?'<@'+order.customerId+'>':'Unknown',inline:true},
   {name:'Designer',value:order.designerId?'<@'+order.designerId+'>':'Unassigned',inline:true},
   {name:'Quantity',value:String(order.quantity||1),inline:true},
   {name:'Estimated / quoted price',value:order.quoteRequired?'Awaiting custom quote':('R$'+(order.price??0)),inline:true},
   {name:'Deadline',value:String(ticket?.deadline||order.deadline||'Not specified').slice(0,1024),inline:true},
   {name:'Updated',value:order.statusUpdatedAt?'<t:'+Math.floor(order.statusUpdatedAt/1000)+':R>':'Just created',inline:true});
 if(order.statusUpdatedBy)e.addFields({name:'Updated by',value:'<@'+order.statusUpdatedBy+'>',inline:true});
 if(order.statusNote)e.addFields({name:'Most recent update',value:String(order.statusNote).slice(0,800)});
 e.setFooter({text:'Astra Customs • Order progress updates automatically'}).setTimestamp(order.statusUpdatedAt||order.createdAt||Date.now());
 return e;
}
function panel(cfg,order,ticket){
 const current=STAGES.indexOf(order.status);
 const progress=STAGES.map((name,i)=>{
   const marker=current<0?'○':i<current?'✓':i===current?'●':'○';
   return marker+' '+name;
 }).join('  ›  ');
 const state=ORDER_STATES[order.status]||ORDER_STATES['Not Paid'];
 const customer=order.customerId?'<@'+order.customerId+'>':'Unknown';
 const designer=order.designerId?'<@'+order.designerId+'>':'Awaiting assignment';
 const deadline=safe(ticket?.deadline||order.deadline||'Not scheduled',150);
 const price=order.quoteRequired?'Awaiting designer quote':'R$'+(order.price??0);
 const updated=order.statusUpdatedAt?'<t:'+Math.floor(order.statusUpdatedAt/1000)+':R>':'New order';
 const details=[
   '**01  /  ORDER DETAILS**\n'+
   '**Customer**  '+customer+'   •   **Designer**  '+designer+'\n'+
   '**Quantity**  '+(order.quantity||1)+'   •   **Price**  '+price+'\n'+
   '**Deadline**  '+deadline,
   '**02  /  PROGRESS TRACKER**\n'+progress+
   '\n**Last updated**  '+updated+
   (order.statusUpdatedBy?'  by <@'+order.statusUpdatedBy+'>':'')
 ];
 if(order.statusNote)details.push('**LATEST UPDATE**\n'+safe(order.statusNote,600));
 return makeCard(cfg,{
   title:'Order #'+order.id,
   subtitle:'CUSTOM COMMISSION  ·  '+state.label.toUpperCase(),
   intro:'**'+safe(order.product||'Custom commission',140)+'**\n'+
     '**Current status**  '+state.icon+' '+safe(order.status,80),
   details,accentColor:state.color,rows:controls(order),
   note:'**ORDER ID**  `#'+order.id+'`  ·  Link payment using `/payment create order_id:'+order.id+'`\n'+
        '**Terms**  https://astra-customs-terms.vercel.app/\n'+
        'This card updates as your commission progresses.'
 });
}
async function refresh(client,guildId,cfg,order){
 if(!order)return;
 const ticket=order.ticketChannelId?tickets.get(guildId,order.ticketChannelId):null;
 if(order.ticketChannelId){
   try{
     const channel=await client.channels.fetch(order.ticketChannelId);
     if(order.requestMessageId){
       const msg=await channel.messages.fetch(order.requestMessageId);
       const isV2=msg.flags?.has?.(MessageFlags.IsComponentsV2) ||
           msg.components?.some?.(c=>(c.toJSON?.()||c).type===17);
       await msg.edit(isV2
          ? panel(cfg,order,ticket)
          : withFooter({embeds:[embed(cfg,order,ticket)],components:controls(order),allowedMentions:{parse:[]}}));
     }
   }catch(err){console.warn('[orderProgress] Ticket panel refresh failed #'+order.id+': '+err.message)}
 }
 if(order.channelId && order.messageId){
   try{const channel=await client.channels.fetch(order.channelId);
       const msg=await channel.messages.fetch(order.messageId);
       const orderCmd=require('../commands/order');
       await msg.edit(withFooter({embeds:[orderCmd.orderEmbed(cfg,order)],
            components:[new ActionRowBuilder().addComponents(orderCmd.orderButtons(order))]}));
   }catch(err){console.warn('[orderProgress] Ledger refresh failed #'+order.id+': '+err.message)}
 }
}
async function setStatus(client,guildId,cfg,order,next,{actorId=null,note='',auto=false}={}){
 if(!order)throw new Error('Order no longer exists');
 if(!canTransition(order.status,next))throw new Error('Invalid order transition: '+order.status+' → '+next);
 const now=Date.now();
 const history=[...(order.statusHistory||[]),{from:order.status,to:next,at:now,by:actorId,automated:auto,note:String(note||'').slice(0,400)}].slice(-60);
 const updated=orders.updateOrder(guildId,order.id,{status:next,statusUpdatedAt:now,statusHistory:history,statusNote:String(note||'').slice(0,400),statusUpdatedBy:actorId||null});
 if(updated.ticketChannelId && (next==='Paid'||next==='Completed'||next==='Delivered'||next==='Cancelled')){
   const channel=await client.channels.fetch(updated.ticketChannelId).catch(()=>null);
   if(channel?.send)await channel.send({content:'**Order #'+updated.id+'** is now **'+next+'**.'+
      (note?'\n'+String(note).slice(0,350):'')+
      (updated.customerId?'\n<@'+updated.customerId+'>':''),allowedMentions:{users:updated.customerId?[updated.customerId]:[]}}).catch(e=>console.warn('[orderProgress] Status notification failed',e.message));
 }
 await refresh(client,guildId,cfg,updated);
 return updated;
}
function authorized(member,cfg,next,order=null){
 if(perms.isManager(member,cfg))return true;
 // Confirming payment or cancelling cannot be done by designers.
 if(['Paid','Cancelled'].includes(next))return false;
 if(order?.designerId && member?.id===order.designerId)return true;
 return perms.isStaff(member,cfg)||perms.isTicketStaff(member,cfg);
}
module.exports={STAGES,TARGETS,canTransition,controls,embed,panel,refresh,setStatus,authorized};
