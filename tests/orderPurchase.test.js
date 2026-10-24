const test=require('node:test');
const assert=require('node:assert/strict');
const axios=require('axios');
const config=require('../utils/config');
const monitor=require('../services/purchaseMonitor');
const receipts=require('../utils/purchaseReceipts');
const orders=require('../utils/orders');
const progress=require('../utils/orderProgress');
const catalog=require('../utils/catalog');
function tx(id,created){return {id,created:new Date(created).toISOString(),agent:{id:12345,name:'SampleBuyer'},details:{id:6789,name:'Test item'},currency:{amount:100}};}
test('order status progression is ordered and cannot be repeated',()=>{
 assert.equal(progress.canTransition('Not Paid','Paid'),true);
 assert.equal(progress.canTransition('Not Paid','Delivered'),false);
 assert.equal(progress.canTransition('Completed','Delivered'),true);
 assert.equal(progress.canTransition('Delivered','Paid'),false);
});
test('catalog prices remain deterministic',()=>{
 assert.equal(catalog.estimate(catalog.byId('pd-livery'),2),260);
 assert.equal(catalog.byId('custom-bot').price,null);
 assert.equal(catalog.byId('ems-uniform').price,145);
});
test('group transaction processing retains checkpoint and never repeats a recorded transaction',async()=>{
 const id=String(Date.now())+'-test',guild='test-'+id,logs=[];
 const client={channels:{fetch:async()=>({send:async(payload)=>{logs.push(payload);return{id:'log-'+logs.length}}})},users:{fetch:async()=>null}};
 const cfg={purchaseLogChannelId:'testlogs',autoCreditPercent:0,discordServerIdForBloxlink:null};
 const baseline=tx('existing',Date.now()-60000);
 const fresh=tx('fresh',Date.now());
 await monitor.processGroup(client,id,[{guildId:guild,cfg}],[baseline]);
 assert.equal(logs.length,0);
 await monitor.processGroup(client,id,[{guildId:guild,cfg}],[fresh,baseline]);
 assert.equal(logs.length,1);
 await monitor.processGroup(client,id,[{guildId:guild,cfg}],[fresh,baseline]);
 assert.equal(logs.length,1);
 assert.equal(receipts.list(guild).filter(r=>r.transactionId==='fresh').length,1);
});
test('Roblox HTTP 500 uses one smaller-page fallback',async()=>{
 const original=axios.get;let calls=0;
 axios.get=async (_url,opts)=>{
   calls++;if(calls===1){const e=new Error('Server error');e.response={status:500,headers:{}};throw e;}
   assert.equal(opts.params.limit,25);
   return {data:{data:[tx('retry',Date.now())]}};
 };
 try {const entries=await monitor.fetchRecentTransactions('testGroup','fake');assert.equal(entries.length,1);assert.equal(calls,2);}
 finally {axios.get=original;}
});
test('backoff respects retry-after header and limits retries',()=>{
 assert.equal(monitor.retryDelay({response:{status:429,headers:{'retry-after':'120'}}},1),120000);
 assert.ok(monitor.retryDelay({response:{status:500,headers:{}}},3)>=60000);
});
test('order state persists when a valid transition is applied',async()=>{
 const gid='order-progress-'+Date.now();
 const o=orders.createOrder(gid,{customerId:'test',product:'Logo',quantity:1,price:100});
 const cfg={};
 const updated=await progress.setStatus({channels:{fetch:async()=>null}},gid,cfg,o,'Paid',{actorId:'reviewer'});
 assert.equal(updated.status,'Paid');
 assert.equal(orders.findOrder(gid,o.id).statusHistory.length,1);
});
