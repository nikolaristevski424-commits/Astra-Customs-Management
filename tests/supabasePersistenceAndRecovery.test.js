const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const cloud=require('../utils/cloudStore');
const tickets=require('../utils/tickets');
const recovery=require('../utils/ticketRecovery');
const {ChannelType}=require('discord.js');
const activity=require('../utils/activity');
const expiry=require('../services/activityCheckExpiry');
const config=require('../utils/config');
const hr=require('../utils/hr');
const loa=require('../utils/loa');
const GUILD='1488378242846036070';
const USER='123456789012345678';
const CH='1999999999999999991';
test('Supabase endpoint refuses publishable key and non-Supabase endpoints',()=>{
 const prev={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SECRET_KEY};
 try{
  process.env.SUPABASE_URL='https://tmfkwhcqsyowahcmodrk.supabase.co';
  process.env.SUPABASE_SECRET_KEY='sb_publishable_not-server-secret';
  assert.throws(()=>cloud.settings(),/secret|publishable/i);
  process.env.SUPABASE_URL='https://evil.example';
  process.env.SUPABASE_SECRET_KEY='sb_secret_test';
  assert.throws(()=>cloud.settings(),/Supabase project/);
 }finally{
  if(prev.url===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=prev.url;
  if(prev.key===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=prev.key;
 }
});
test('cloud bootstraps local history once, then syncs updated records and clears pending writes',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'astra-cloud-test-'));
 const prev={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SECRET_KEY,fetch:global.fetch};
 const remote=new Map(),calls=[];
 try{
  process.env.SUPABASE_URL='https://tmfkwhcqsyowahcmodrk.supabase.co';
  process.env.SUPABASE_SECRET_KEY='sb_secret_testing-only';
  fs.writeFileSync(path.join(dir,'tickets.json'),JSON.stringify({[GUILD]:{[CH]:{userId:USER,type:'support'}}}));
  global.fetch=async(uri,opts)=>{
   calls.push({uri:String(uri),method:opts.method,key:opts.headers.apikey});
   assert.equal(opts.headers.apikey,'sb_secret_testing-only');
   if(opts.method==='GET')return{ok:true,json:async()=>[...remote].map(([store_name,payload])=>({store_name,payload}))};
   for(const item of JSON.parse(opts.body))remote.set(item.store_name,item.payload);
   return{ok:true};
  };
  const initial=await cloud.bootstrap(dir);
  assert.equal(initial.uploaded,1);
  assert.ok(remote.has('tickets'));
  const token=cloud.stage(dir,'tickets');
  const next={ [GUILD]:{[CH]:{userId:USER,type:'support',claimedBy:'1888888888888888888'}}};
  fs.writeFileSync(path.join(dir,'tickets.json'),JSON.stringify(next));
  cloud.enqueue('tickets',next,dir,token);
  await cloud.flush();
  assert.deepEqual(remote.get('tickets'),next);
  assert.equal(fs.existsSync(path.join(dir,'tickets.pending')),false);
  assert.ok(calls.some(c=>c.method==='GET'));
  assert.ok(cloud.status().healthy);
 }finally{
  if(prev.url===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=prev.url;
  if(prev.key===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=prev.key;
  global.fetch=prev.fetch;
  fs.rmSync(dir,{recursive:true,force:true});
 }
});
test('ticket channel metadata is safe to parse and rejects malformed entries',()=>{
 const text=recovery.topicFor({type:'report',userId:USER});
 assert.deepEqual(recovery.parseTopic(text),{type:'report',userId:USER,orderId:null});
 assert.equal(recovery.parseTopic('Not a ticket'),null);
 assert.throws(()=>recovery.topicFor({type:'other',userId:USER}));
});
test('trusted ticket channel topic restores only an officially routed category',async()=>{
 const gid=GUILD,id=CH;
 tickets.remove(gid,id);
 const ch={id,guildId:gid,type:ChannelType.GuildText,parentId:'1565467577415639182',
  topic:recovery.topicFor({type:'management',userId:USER}),createdTimestamp:Date.now()};
 const client={user:{id:'111111111111111111'},channels:{fetch:async()=>ch}};
 const ticket=await recovery.recoverTicket(gid,id,client,{ticketCategoryId:'112222222222222222'},ch);
 assert.equal(ticket.type,'management');assert.equal(ticket.userId,USER);
 assert.equal(ticket.transcriptChannelId,'1531632265812119552');
 tickets.remove(gid,id);
 ch.parentId='112222222222222223';
 assert.equal(await recovery.recoverTicket(gid,id,client,{ticketCategoryId:'112222222222222222'},ch),null);
});
test('activity-check LOA role exempts a nonrespondent from automatic infraction',async()=>{
 const id='loa-activity-'+Date.now();
 const record=activity.create(id,{roleId:'1888888888888888888',targetIds:[USER]});
 const guild={members:{fetch:async()=>({roles:{cache:new Map([['1507411048167112724',{id:'1507411048167112724'}]])}})}};
 const channel={isTextBased:()=>true,isDMBased:()=>false,id:'1999999999999999992'};
 const client={user:{id:'1999999999999999993'},channels:{fetch:async()=>channel}};
 await expiry.processCheck(client,id,guild,{infractionsChannelId:channel.id,loaRoleId:'1507411048167112724'},record);
 assert.equal(hr.listInfractions(id).length,0);
 assert.ok(activity.find(id,record.id).loaExemptUserIds.includes(USER));
 assert.equal(activity.find(id,record.id).status,'completed');
});
test('deleted designer role automatically maps to replacement role',()=>{
 const cfg=config.defaultConfig();
 assert.ok(cfg.designerApplicationAcceptRoleId.includes('1566227474688381088'));
 assert.equal(cfg.loaRoleId,'1507411048167112724');
});
