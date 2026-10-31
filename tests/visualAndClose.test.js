const test=require('node:test');
const assert=require('node:assert/strict');
const {MessageFlags}=require('discord.js');
const {makeCard,COLORS}=require('../utils/visualSystem');
const ticketCards=require('../utils/ticketCards');
const orderProgress=require('../utils/orderProgress');
const availability=require('../commands/availability');
const help=require('../commands/help');
const close=require('../commands/close');
const closeRequest=require('../commands/close-request');
const {withFooter}=require('../utils/footerBranding');
const {EmbedBuilder}=require('discord.js');

const cfg={brandName:'Astra Customs',accentColor:'#6178dc'};
const GUILD='1488378242846036070',CUSTOMER='1255248600850497568';
function serialize(payload){return JSON.stringify(payload.components?.map(c=>c.toJSON?.()||c)||[]);}
function checkV2(payload){
 assert.ok(Number(payload.flags)&MessageFlags.IsComponentsV2);
 assert.ok(serialize(payload).includes('Astra Customs'));
 assert.equal(payload.embeds,undefined);
}
test('premium shared V2 card uses coherent brand, state accent and safe mentions',()=>{
 const payload=makeCard(cfg,{title:'Design Request',subtitle:'PROCESSING',
   intro:'Commission ready',details:['**01 / REF**\nDone'],note:'Open in Tickets',
   accentColor:COLORS.teal});
 checkV2(payload);
 assert.match(serialize(payload),/Design Request/);
 assert.deepEqual(payload.allowedMentions,{parse:[]});
 assert.equal(JSON.parse(serialize(payload))[0].accent_color,COLORS.teal);
});
test('support, management, report, and legacy orders all send consistent styled V2 cards with unchanged actions',()=>{
 for(const type of ['support','management','report']){
   const data=ticketCards.ticket(cfg,{
      type,channelId:'1999999999999999991',userId:CUSTOMER,
      reason:'Please assist with design order #12',
      reportedUser:type==='report'?'<@133333333333333333>':null,
      evidence:type==='report'?'https://example.org/proof':null
   });
   checkV2(data);
   assert.ok(serialize(data).includes('ticket_claim_1999999999999999991'));
   assert.ok(serialize(data).includes('ticket_close_instant_1999999999999999991'));
   assert.match(serialize(data),/01  \/  REQUEST/);
 }
 const order=ticketCards.legacyOrder(cfg,{
    channelId:'1999999999999999991',orderId:12,userId:CUSTOMER,
    product:'Police Livery',budget:'150',style:'Blue',
    deadline:'Tomorrow',details:'Clean design'
 });
 checkV2(order);
 assert.ok(serialize(order).includes('/payment create order_id:12'));
});
test('progress card shows readable stages, tracked order ID and unchanged staff button IDs',()=>{
 const order={id:17,status:'In Progress',product:'Police Livery',
   customerId:CUSTOMER,designerId:'1453383083913904234',ticketChannelId:'1999999999999999991',
   price:130,quoteRequired:false,quantity:1};
 const payload=orderProgress.panel(cfg,order,{deadline:'Tomorrow'});
 checkV2(payload);
 assert.match(serialize(payload),/PROGRESS TRACKER/);
 assert.ok(serialize(payload).includes('/payment create order_id:17'));
 assert.ok(serialize(payload).includes('order_stage_17_completed'));
 assert.ok(serialize(payload).includes('ticket_claim_1999999999999999991'));
});
test('read-only availability and help are ephemeral components V2 rather than classic embeds',async()=>{
 let availabilityPayload,helpPayload;
 await availability.execute({guildId:GUILD,reply:async p=>{availabilityPayload=p;}});
 await help.execute({guildId:GUILD,reply:async p=>{helpPayload=p;}});
 for(const p of [availabilityPayload,helpPayload]){
    checkV2(p);assert.ok(Number(p.flags)&MessageFlags.Ephemeral);
 }
 assert.match(serialize(availabilityPayload),/SERVICE DIRECTORY/);
 assert.match(serialize(availabilityPayload),/STATUS GUIDE/);
 assert.ok(serialize(helpPayload).includes('/close-request'));
 assert.ok(serialize(helpPayload).includes('/close'));
 assert.ok(!serialize(helpPayload).includes('/closee'));
});
test('legacy notification themes preserve existing colors, content and decision marker',()=>{
 const info=withFooter({embeds:[new EmbedBuilder().setTitle('General update')
   .setDescription('Delivered successfully')]},cfg);
 const rendered=info.embeds[0].toJSON();
 assert.equal(rendered.author.name,'Astra Customs');
 assert.equal(rendered.color,COLORS.primary);
 assert.equal(rendered.description,'Delivered successfully');
 const err=withFooter({embeds:[new EmbedBuilder().setTitle('Payout Denied')]},cfg);
 assert.equal(err.embeds[0].toJSON().color,COLORS.red);
 const ok=withFooter({embeds:[new EmbedBuilder().setTitle('Payout Paid')]},cfg);
 assert.equal(ok.embeds[0].toJSON().color,COLORS.teal);
 const original=new EmbedBuilder().setTitle('Application Accepted')
   .setColor(0x123456).setFooter({text:'Decision: Accepted • Moderator'});
 const preserved=withFooter({embeds:[original]},cfg).embeds[0].toJSON();
 assert.equal(preserved.color,0x123456);
 assert.match(preserved.footer.text,/^Decision: Accepted/);
});
test('/close and /close-request are distinct correctly registered commands',()=>{
 const direct=close.data.toJSON(),delayed=closeRequest.data.toJSON();
 assert.equal(direct.name,'close');
 assert.equal(direct.options?.length||0,0);
 assert.equal(delayed.name,'close-request');
 assert.equal(delayed.options?.length||0,0);
 assert.equal(typeof close.execute,'function');
 assert.equal(typeof close.canClose,'function');
 assert.equal(typeof closeRequest.execute,'function');
});
