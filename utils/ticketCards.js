const {ContainerBuilder,TextDisplayBuilder,SeparatorBuilder,ActionRowBuilder,
 ButtonBuilder,ButtonStyle,MessageFlags}=require('discord.js');
const {withFooter}=require('./footerBranding');
const {parseColor}=require('./embeds');

const TERMS='https://astra-customs-terms.vercel.app/';
const SHOP='https://www.roblox.com/games/102262993580557/Astra-Customs-Shop';
function safe(value,max=1300){
 return String(value??'Not specified').replace(/@everyone|@here/gi,'[mention removed]').slice(0,max);
}
function block(container,text){
 container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
}
function buttons(channelId,{order=false}={}){
 return new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('ticket_claim_'+channelId).setLabel(order?'Claim Order':'Claim Ticket').setStyle(ButtonStyle.Primary),
  new ButtonBuilder().setCustomId('ticket_close_'+channelId).setLabel('Request Close').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId('ticket_close_instant_'+channelId).setLabel('Staff: Close').setStyle(ButtonStyle.Danger)
 );
}
function payload(cfg,container){
 return withFooter({flags:MessageFlags.IsComponentsV2,components:[container],
   allowedMentions:{parse:[]}},cfg);
}
function ticket(cfg,{type,channelId,userId,reason,reportedUser,evidence}){
 const names={support:'Support',management:'Management',report:'Report a User'};
 const labels={support:'Support team',management:'Management team',report:'Report review team'};
 const color={support:0x3b82f6,management:0x715fe5,report:0xe68b42};
 const title=names[type]||'Support';
 const c=new ContainerBuilder().setAccentColor(color[type]||parseColor(cfg.accentColor));
 block(c,'# '+safe(cfg.brandName||'Astra Customs',60)+' | '+title+' Ticket\n'+
   '**Status:** Open   •   **Opened by:** <@'+userId+'>');
 c.addSeparatorComponents(new SeparatorBuilder());
 block(c,'### Request details\n'+safe(reason,1500));
 if(type==='report' && reportedUser)
   block(c,'**Reported member:** '+safe(reportedUser,100));
 if(evidence)block(c,'**Evidence / links:**\n'+safe(evidence,1000));
 c.addSeparatorComponents(new SeparatorBuilder());
 block(c,'**Who will respond:** '+labels[type]+'\n'+
   '**Privacy:** This ticket is visible only to its opener and authorized reviewers.\n'+
   '**Terms:** '+TERMS+'\nNever share passwords, verification codes, or account cookies.');
 c.addActionRowComponents(buttons(channelId));
 return payload(cfg,c);
}
function legacyOrder(cfg,{channelId,orderId,userId,product,style,deadline,budget,references,details}){
 const c=new ContainerBuilder().setAccentColor(0x4975d9);
 block(c,'# '+safe(cfg.brandName||'Astra Customs',60)+' | Order #'+orderId+'\n'+
   '**Status:** Not Paid   •   **Customer:** <@'+userId+'>');
 c.addSeparatorComponents(new SeparatorBuilder());
 block(c,'### '+safe(product||'Custom commission',140)+'\n'+
   '**Style:** '+safe(style,180)+'\n**Deadline:** '+safe(deadline,150)+
   '\n**Budget:** '+safe(budget,120));
 if(details)block(c,'**Design brief**\n'+safe(details,1500));
 if(references)block(c,'**References**\n'+safe(references,950));
 c.addSeparatorComponents(new SeparatorBuilder());
 block(c,'**Order ID:** `#'+orderId+'`\n'+
   'Staff can link payment with `/payment create order_id:'+orderId+'`.\n'+
   '**Terms:** '+TERMS+'\n**Roblox shop:** '+SHOP);
 c.addActionRowComponents(buttons(channelId,{order:true}));
 return payload(cfg,c);
}
module.exports={ticket,legacyOrder,buttons,TERMS,SHOP};
