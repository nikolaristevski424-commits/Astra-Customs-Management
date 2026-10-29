const test=require('node:test');
const assert=require('node:assert/strict');
const monitor=require('../services/purchaseMonitor');
const receipts=require('../utils/purchaseReceipts');
const purchases=require('../commands/purchases');

const makeTx=(id,time,item='9876',buyer='11111')=>({
  id,created:new Date(time).toISOString(),agent:{id:buyer,name:'Buyer'},details:{id:item,name:'Sample gamepass'},
  currency:{amount:90}
});
const context=(guildId,missing=false)=> {
  const posts=[];
  return {
    posts,
    client:{user:{id:'222222222222222222'},channels:{fetch:async id=>
      missing?null:{id,guildId,send:async payload=>{posts.push(payload);return{id:'message-'+posts.length}}}}},
    cfg:{purchaseLogChannelId:'log-'+guildId,autoCreditPercent:0,discordServerIdForBloxlink:null}
  };
};
test('Astra guild purchase alerts use the correct channel, independent of missing env',()=>{
  assert.equal(monitor.purchaseLogChannel(monitor.ASTRA_GUILD_ID,{}), '1550931224195768471');
  assert.equal(monitor.purchaseLogChannel('other-guild',{purchaseLogChannelId:'custom-channel'}),'custom-channel');
  assert.equal(monitor.purchaseLogChannel('other-guild',{}),null);
});
test('Roblox id zero does not collapse different group transactions into one sale',()=>{
  const now=Date.now();
  const a=makeTx(0,now,'1000','111');
  const b=makeTx(0,now+1000,'1000','222');
  const c=makeTx(0,now+1000,'1001','222');
  assert.notEqual(monitor.transactionKey(a),monitor.transactionKey(b));
  assert.notEqual(monitor.transactionKey(b),monitor.transactionKey(c));
  assert.equal(monitor.transactionKey(a),monitor.transactionKey({...a,created:new Date(Math.floor(now/1000)*1000).toISOString()}));
  assert.equal(monitor.transactionKey(makeTx(27,now)), 'id:27');
});
test('new monitor startup recovers recent sales for alerting, never replays credit',async()=>{
  const id='zero-new-'+Date.now(),guild='client-'+id,{client,cfg,posts}=context('client-'+id),now=Date.now();
  const a=makeTx(0,now-15000,'1001','222'),b=makeTx(0,now-9000,'1002','333');
  await monitor.processGroup(client,id,[{guildId:guild,cfg}],[a,b]);
  assert.equal(posts.length,2);
  assert.ok(posts.every(p=>JSON.stringify(p).includes('Roblox Purchase Detected')));
  assert.equal(receipts.list(guild).length,2);
  assert.ok(receipts.list(guild).every(r=>r.reviewRequired && r.complete && r.logged && !r.credited));
  await monitor.processGroup(client,id,[{guildId:guild,cfg}],[a,b]);
  assert.equal(posts.length,2);
});
test('monitor migration repairs receipts missing notifications but avoids duplicate messages',async()=>{
  const group='migrate-'+Date.now(),guild='guild-'+group,{client,cfg,posts}=context('guild-'+group);
  const old=makeTx(0,Date.now()-1500,'444','999');
  const newTx=makeTx(0,Date.now()-1000,'555','888');
  // Pre-existing broken installation: marked receipts "complete" and
  // checkpointed the transactions without ever sending Discord messages.
  await monitor.processGroup(client,group,[{guildId:guild,cfg}],[makeTx(3,Date.now()-3*60*60*1000)]);
  receipts.update(guild,group+':'+monitor.transactionKey(old),{complete:true,logged:false});
  await monitor.processGroup(client,group,[{guildId:guild,cfg}],[old,newTx]);
  assert.equal(posts.length,2);
  await monitor.processGroup(client,group,[{guildId:guild,cfg}],[old,newTx]);
  assert.equal(posts.length,2);
});
test('failed Discord alert is not falsely marked logged; a later retry succeeds',async()=>{
  const group='retry-discord-'+Date.now(),guild='guild-'+group,{cfg}=context('guild-'+group);
  const tx=makeTx(0,Date.now(),'345','555');
  const failed={channels:{fetch:async()=>({send:async()=>{throw Error('Missing Permissions')}})},user:{id:'222222222222222222'}};
  await assert.rejects(monitor.processGroup(failed,group,[{guildId:guild,cfg}],[tx]),/Missing Permissions/);
  const receiptKey=group+':'+monitor.transactionKey(tx);
  assert.equal(receipts.get(guild,receiptKey).logged,undefined);
  const {client,posts}=context('guild-'+group);
  await monitor.processGroup(client,group,[{guildId:guild,cfg}],[tx]);
  assert.equal(posts.length,1);
  assert.equal(receipts.get(guild,receiptKey).logged,true);
});
test('incomplete Roblox sale is logged for staff review rather than silently discarded',async()=>{
  const group='partial-'+Date.now(),guild='guild-'+group,{client,cfg,posts}=context('guild-'+group);
  const tx={id:0,created:new Date().toISOString(),agent:{id:333,name:'Person'},details:{name:'Unknown asset'},currency:{amount:55}};
  await monitor.processGroup(client,group,[{guildId:guild,cfg}],[tx]);
  assert.equal(posts.length,1);
  assert.equal(receipts.list(guild)[0].reviewRequired,true);
});
test('purchase diagnostics expose test-log and diagnose subcommands',()=>{
 const opts=purchases.data.toJSON().options.map(x=>x.name);
 assert.ok(opts.includes('test-log'));
 assert.ok(opts.includes('diagnose'));
 assert.ok(opts.includes('status'));
});
