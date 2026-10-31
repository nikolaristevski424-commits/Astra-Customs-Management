const test=require('node:test');
const assert=require('node:assert/strict');
const ledger=require('../utils/partnerLedger');
const lifecycle=require('../services/partnershipLifecycle');
const event=require('../events/guildMemberRemove');
const {Events}=require('discord.js');

const GUILD='1488378242846036070';
const CHANNEL='1497069090081210418';
const USER='1255248600850497568';
const REP='1888888888888888888';
const REP_OTHER='1777777777777777777';
let seq=0;
function fresh({representatives=[REP],invite=null}={}){
 const n=String(++seq+Date.now()%1000000).padStart(17,'0');
 const messageId=n;
 const inviteUrl=invite||'https://discord.gg/lifecycle-'+n;
 const entry=ledger.record(GUILD,{
    userId:USER,server:'Partner '+n,invite:inviteUrl,
    messageId,messageUrl:'https://discord.com/channels/'+GUILD+'/'+CHANNEL+'/'+messageId,
    representativeIds:representatives
 });
 assert.equal(entry.created,true);
 return entry.entry;
}
function clientFor(messageId,{author='bot',deleteFails=false}={}){
 const calls={fetch:[],delete:[]};
 const msg={author:{id:author},delete:async()=>{calls.delete.push(messageId);if(deleteFails)throw{code:50013}}};
 const client={
   user:{id:'bot'},
   channels:{fetch:async channelId=>{
      calls.fetch.push(channelId);
      return{id:channelId,guildId:GUILD,messages:{fetch:async id=>{
          assert.equal(id,messageId);
          return msg;
      }}};
   }},
   guilds:{cache:new Map([[GUILD,{id:GUILD,members:{fetch:async()=>({id:REP})}}]])}
 };
 return{client,calls};
}
test('tracked rep departure automatically terminates partnership and deletes its original bot announcement',async()=>{
 const entry=fresh();
 const {client,calls}=clientFor(entry.messageId);
 assert.equal(event.name,Events.GuildMemberRemove);
 await event.execute({id:REP,guild:{id:GUILD},client});
 const updated=ledger.list(GUILD).find(x=>x.id===entry.id);
 assert.equal(updated.status,'terminated');
 assert.equal(updated.terminatedBy,REP);
 assert.ok(updated.deletedAt);
 assert.deepEqual(calls.delete,[entry.messageId]);
 assert.equal(ledger.active(GUILD).some(x=>x.id===entry.id),false);
 const stats=ledger.stats(GUILD,USER);
 assert.ok(stats.terminatedCount>=1);
 assert.ok(stats.robuxEarned>=20,'Historical Robux commission must not be erased by termination');
});
test('other representatives and staff departures do not terminate unrelated partnerships',async()=>{
 const entry=fresh({representatives:[REP_OTHER]});
 const {client}=clientFor(entry.messageId);
 await event.execute({id:REP,guild:{id:GUILD},client});
 assert.equal(ledger.list(GUILD).find(x=>x.id===entry.id).status,'active');
 await event.execute({id:REP_OTHER,guild:{id:'123456789012345678'},client});
 assert.equal(ledger.list(GUILD).find(x=>x.id===entry.id).status,'active');
});
test('a representative on any tracked active partnership triggers termination of that partnership',async()=>{
 const entry=fresh({representatives:[REP,REP_OTHER]});
 const {client}=clientFor(entry.messageId);
 await event.execute({id:REP_OTHER,guild:{id:GUILD},client});
 assert.equal(ledger.list(GUILD).find(x=>x.id===entry.id).status,'terminated');
});
test('failed Discord message deletion records error and is retryable without losing the historical record',async()=>{
 const entry=fresh();
 const failing=clientFor(entry.messageId,{deleteFails:true});
 await lifecycle.terminateRepresentative(failing.client,GUILD,REP);
 let updated=ledger.list(GUILD).find(x=>x.id===entry.id);
 assert.equal(updated.status,'terminated');
 assert.ok(updated.deleteError);
 assert.equal(updated.deletedAt,undefined);
 // Retry with a working client that returns the tracked original message.
 const fixed=clientFor(entry.messageId);
 const result=await lifecycle.retryTerminatedAnnouncements(fixed.client,GUILD);
 assert.ok(result.fixed>=1);
 updated=ledger.list(GUILD).find(x=>x.id===entry.id);
 assert.ok(updated.deletedAt);
 assert.equal(updated.deleteError,null);
});
test('never delete a message not authored by the Astra bot',async()=>{
 const entry=fresh();
 const {client,calls}=clientFor(entry.messageId,{author:'some-other-user'});
 await lifecycle.terminateRepresentative(client,GUILD,REP);
 assert.equal(calls.delete.length,0);
 assert.equal(ledger.list(GUILD).find(x=>x.id===entry.id).status,'terminated');
 assert.match(ledger.list(GUILD).find(x=>x.id===entry.id).deleteError,/different bot/);
});
test('restarting bot reconciles reps that left while offline but ignores network errors',async()=>{
 const one=fresh({representatives:[REP]});
 const two=fresh({representatives:[REP_OTHER]});
 const deleted=new Set();
 const client={
  user:{id:'bot'},
  guilds:{cache:new Map([[GUILD,{id:GUILD,members:{fetch:async()=>{}}}]])},
  channels:{fetch:async id=>({
    guildId:GUILD,messages:{fetch:async messageId=>({
      author:{id:'bot'},delete:async()=>deleted.add(messageId)
    })}
  })}
 };
 const result=await lifecycle.reconcileOnReady(client,{
   fetchMember:async (_guild,user)=>{
      if(user===REP)throw{code:10007};
      if(user===REP_OTHER)throw{code:'ETIMEDOUT'};
   }
 });
 assert.ok(result.terminated>=1);
 assert.equal(ledger.list(GUILD).find(x=>x.id===one.id).status,'terminated');
 assert.equal(ledger.list(GUILD).find(x=>x.id===two.id).status,'active');
 assert.ok(deleted.has(one.messageId));
});
test('re-establishing a terminated invite reuses the ledger record instead of double-crediting R$20',()=>{
 const first=fresh();
 ledger.terminateRepresentative(GUILD,REP);
 const newer=ledger.record(GUILD,{
   userId:USER,server:first.server,invite:first.invite,
   messageId:'1999999999999999997',
   messageUrl:'https://discord.com/channels/'+GUILD+'/'+CHANNEL+'/1999999999999999997',
   representativeIds:[REP_OTHER]
 });
 assert.equal(newer.created,false);
 assert.equal(newer.reactivated,true);
 assert.equal(newer.entry.status,'active');
 assert.equal(ledger.list(GUILD).filter(x=>x.invite===first.invite).length,1);
 assert.equal(newer.entry.reward,20);
});
