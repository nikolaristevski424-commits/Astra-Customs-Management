const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Collection}=require('discord.js');
const orders=require('../utils/orders');
const tickets=require('../utils/tickets');
const progress=require('../utils/orderProgress');
const payment=require('../commands/payment');
const interaction=require('../events/interactionCreate');

const GUILD='1488378242846036070';
test('new order opening embeds display the real short order ID used by payment linking',()=>{
 const id='order-id-test-'+Date.now();
 const o=orders.createOrder(id,{customerId:'1255248600850497568',product:'Police Livery',
  quoteRequired:false,price:130,quantity:1,status:'Not Paid'});
 const embed=progress.embed({brandName:'Astra Customs'},o).toJSON();
 const f=embed.fields.find(x=>x.name==='Order ID');
 assert.ok(f);
 assert.match(f.value,new RegExp('#'+o.id+'\\b'));
 assert.match(f.value,/\/payment request order_id:/);
 assert.equal(orders.findOrder(id,o.id).id,o.id);
 const request=payment.data.toJSON().options.find(x=>x.name==='request');
 assert.ok(request.options.find(x=>x.name==='order_id'));
});
test('legacy order path stores the same real ledger ID on ticket and initial embed',async()=>{
 const guildId=GUILD,orderUser='122222222222222222';
 let message;
 let reply;
 const channelId='1999999999999999991',user={id:orderUser,username:'OrderMember'};
 const guild={id:guildId,roles:{everyone:{id:guildId},cache:new Collection()},
   channels:{create:async()=>({
      id:channelId,
      send:async payload=>{message=payload;return{id:'1888888888888888888'}}
   })}};
 const oldCount=orders.listOrders(guildId).length;
 const i={guildId,guild,user,customId:'order_open_modal',
   fields:{getTextInputValue:n=>({product:'Police Livery',style:'Modern',deadline:'Tomorrow',
    budget:'150',references:'None',details:'Clean decals'})[n]||''},
   deferReply:async()=>{},editReply:async p=>{reply=p},
   isChatInputCommand:()=>false,isAutocomplete:()=>false,isButton:()=>false,
   isStringSelectMenu:()=>false,isModalSubmit:()=>true,
   client:{commands:new Map()},isRepliable:()=>true};
 const oldEnv=process.env.ORDER_CATEGORY_ID;
 process.env.ORDER_CATEGORY_ID='1544665711245262881';
 try{
   await interaction.execute(i);
   const created=orders.listOrders(guildId).slice(oldCount);
   assert.equal(created.length,1,'One real order record expected');
   const order=created[0];
   const ticket=tickets.get(guildId,channelId);
   assert.equal(ticket.orderId,order.id);
   assert.equal(order.ticketChannelId,channelId);
   assert.ok(JSON.stringify(message.embeds).includes('Order ID'));
   assert.ok(JSON.stringify(message.embeds).includes('#'+order.id));
   assert.ok(String(reply).includes('#'+order.id));
 }finally{
   if(oldEnv===undefined)delete process.env.ORDER_CATEGORY_ID;
   else process.env.ORDER_CATEGORY_ID=oldEnv;
   tickets.remove(guildId,channelId);
 }
});
