const {ActionRowBuilder,ButtonBuilder,ButtonStyle}=require('discord.js');
const {makeCard,COLORS,safe}=require('./visualSystem');

const TERMS='https://astra-customs-terms.vercel.app/';
const SHOP='https://www.roblox.com/games/102262993580557/Astra-Customs-Shop';
function buttons(channelId,{order=false}={}){
 return new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('ticket_claim_'+channelId)
   .setLabel(order?'Claim Order':'Claim Ticket').setEmoji('🙋').setStyle(ButtonStyle.Primary),
  new ButtonBuilder().setCustomId('ticket_close_'+channelId)
   .setLabel('Request Close').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId('ticket_close_instant_'+channelId)
   .setLabel('Staff: Close').setEmoji('🛡️').setStyle(ButtonStyle.Danger)
 );
}
function ticket(cfg,{type,channelId,userId,reason,reportedUser,evidence,claimedBy=null}){
 const names={support:'Support Ticket',management:'Management Ticket',report:'Report a User Ticket'};
 const teams={support:'Support Team',management:'Management Team',report:'Report Review Team'};
 const colors={support:COLORS.blue,management:COLORS.purple,report:COLORS.amber};
 const details=['**01  /  REQUEST**\n'+safe(reason,1500)];
 if(type==='report'&&reportedUser)details.push('**REPORTED MEMBER**\n'+safe(reportedUser,180));
 if(evidence)details.push('**REFERENCES / EVIDENCE**\n'+safe(evidence,1000));
 return makeCard(cfg,{
   title:names[type]||names.support,
   subtitle:'PRIVATE SUPPORT  ·  '+(claimedBy?'ASSIGNED':'AWAITING REVIEW'),
   intro:'**Opened by** <@'+userId+'>   •   **Assigned to** '+(claimedBy?'<@'+claimedBy+'>':teams[type]||teams.support),
   details,
   note:'**NEXT STEP**  Describe any additional details below. Our reviewers will respond in this channel.\n'+
        '**Privacy**  This ticket is restricted to its opener and authorized reviewers.\n'+
        '**Terms**  '+TERMS+'  ·  Never share passwords or verification codes.',
   rows:[buttons(channelId)],
   accentColor:colors[type]||COLORS.blue
 });
}
function legacyOrder(cfg,{channelId,orderId,userId,product,style,deadline,budget,references,details}){
 const sections=[
   '**01  /  COMMISSION BRIEF**\n'+
   '**Product**  '+safe(product||'Custom commission',170)+'\n'+
   '**Style**  '+safe(style,180)+'\n'+
   '**Deadline**  '+safe(deadline,140)+'\n'+
   '**Budget**  '+safe(budget,120)
 ];
 if(details)sections.push('**DESIGN NOTES**\n'+safe(details,1500));
 if(references)sections.push('**REFERENCE MATERIAL**\n'+safe(references,900));
 return makeCard(cfg,{
   title:'Order #'+orderId,
   subtitle:'COMMISSION REQUEST  ·  AWAITING QUOTE / PAYMENT',
   intro:'**Customer**  <@'+userId+'>   •   **Order ID**  `#'+orderId+'`',
   details:sections,
   note:'**PAYMENT LINKING**  Use `/payment create order_id:'+orderId+'` for this order.\n'+
        '**Terms**  '+TERMS+'\n**Roblox shop**  '+SHOP,
   rows:[buttons(channelId,{order:true})],accentColor:COLORS.primary
 });
}
module.exports={ticket,legacyOrder,buttons,TERMS,SHOP};
