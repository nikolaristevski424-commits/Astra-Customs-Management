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
test('order work statuses are flexible while locked orders remain protected',()=>{
 assert.equal(progress.canTransition('Not Paid','Paid'),true);
 assert.equal(progress.canTransition('Not Paid','Delivered'),true);
 assert.equal(progress.canTransition('Completed','Delivered'),true);
 assert.equal(progress.canTransition('Delivered','Paid'),true);
 assert.equal(progress.canTransition('In Progress','In Progress'),false);
 assert.equal(progress.canTransition('Void','In Progress'),false);
 assert.equal(progress.canTransition('Cancelled','Delivered'),false);
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
 const baseline=tx('existing',Date.now()-3*60*60*1000);
 const fresh=tx('fresh',Date.now());
 await monitor.processGroup(client,id,[{guildId:guild,cfg}],[baseline]);
 assert.equal(logs.length,0);
 await monitor.processGroup(client,id,[{guildId:guild,cfg}],[fresh,baseline]);
 assert.equal(logs.length,1);
 await monitor.processGroup(client,id,[{guildId:guild,cfg}],[fresh,baseline]);
 assert.equal(logs.length,1);
 assert.equal(receipts.list(guild).filter(r=>r.transactionId==='id:fresh').length,1);
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

test('Roblox monitor checks every two minutes and respects persisted restart time',()=>{
 assert.equal(monitor.POLL_INTERVAL_MS,120000);
 assert.equal(monitor.PAGE_GAP_MS,3000);
 assert.equal(monitor.nextEligiblePollAt({lastPolledAt:100000,nextRequestAt:0},100000),220000);
 assert.equal(monitor.nextEligiblePollAt({lastPolledAt:100000,nextRequestAt:400000},150000),400000);
 assert.equal(monitor.nextEligiblePollAt({lastPolledAt:0,nextRequestAt:0},0),0);
});
test('backoff never schedules automatic retries more often than two minutes',()=>{
 for (const status of [500,502,503,429]) {
   assert.ok(monitor.retryDelay({response:{status,headers:{}}},1)>=monitor.POLL_INTERVAL_MS);
 }
});

test('manual purchase retry preserves Roblox HTTP 429 cooldown',()=>{
 const groupId='retry-test-'+Date.now();
 const store=require('../utils/store');
 const until=Date.now()+10*60_000;
 store.update('purchaseMonitor','global',{},state=>{
   state[groupId]={lastPolledAt:Date.now()-5*60_000,nextRequestAt:until,lastError:'HTTP 429: rate limited'};
   return state;
 });
 const result=monitor.retryNow(groupId);
 assert.equal(result.scheduled,false);
 assert.equal(monitor.getGroupState(groupId).nextRequestAt,until);
});

test('giveaway odds account for entries and multiple winners',()=>{
  const g=require('../utils/giveaways');
  assert.equal(g.oddsPercent(0,1),null);
  assert.equal(g.oddsPercent(1,1),100);
  assert.equal(g.oddsPercent(67,1).toFixed(2),'1.49');
  assert.equal(g.oddsPercent(10,3),30);
  assert.equal(g.oddsPercent(2,10),100);
});
test('sponsored giveaway winners are directed to the sponsor, not Astra Customs',()=>{
  const g=require('../commands/giveaway');
  const a=g.winnerAnnouncement({sponsor:'Example RP',sponsorInvite:'https://discord.gg/example',prize:'Logo'},['123']);
  assert.match(a,/Open a ticket in the sponsoring server/);
  assert.match(a,/https:\/\/discord.gg\/example/);
  assert.match(a,/Do not open a claim ticket in Astra Customs/);
  const own=g.winnerAnnouncement({sponsor:null,prize:'Logo'},['123']);
  assert.match(own,/Astra Customs support ticket/);
});
test('giveaway participants may leave before a drawing',()=>{
  const gs=require('../utils/giveaways'),id='giveaway-test-'+Date.now();
  const g=gs.create(id,{prize:'Banner',winnerCount:1,endsAt:Date.now()+60000,hostedBy:'test'});
  gs.addEntrant(id,g.id,'user1');
  gs.addEntrant(id,g.id,'user2');
  assert.equal(gs.find(id,g.id).entrantIds.length,2);
  gs.removeEntrant(id,g.id,'user1');
  assert.deepEqual(gs.find(id,g.id).entrantIds,['user2']);
});

test('only assigned designer or staff can modify work stages, payment remains manager-only',()=>{
 const progress=require('../utils/orderProgress');
 const cfg={staffRoleIds:[],ticketStaffRoleIds:[],managerRoleIds:[]};
 const make=(id)=>({id,permissions:{has:()=>false},roles:{cache:new Map()}});
 assert.equal(progress.authorized(make('designer1'),cfg,'In Progress',{designerId:'designer1'}),true);
 assert.equal(progress.authorized(make('designer2'),cfg,'In Progress',{designerId:'designer1'}),false);
 assert.equal(progress.authorized(make('designer1'),cfg,'Paid',{designerId:'designer1'}),false);
 assert.equal(progress.authorized(make('designer1'),cfg,'Cancelled',{designerId:'designer1'}),false);
});
