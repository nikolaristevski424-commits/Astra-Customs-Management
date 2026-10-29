const test=require('node:test');
const assert=require('node:assert/strict');
const {ChannelType}=require('discord.js');
const payout=require('../commands/payout');
const records=require('../utils/payoutRequests');
const cfg={payoutRequestsChannelId:'1560658675368984677',brandName:'Astra Customs'};
function create(guild){
 return records.create(guild,{requestedBy:'1255248600850497568',amount:150,
   robloxUsername:'AstraDesigner',reason:'Livery commission'});
}
test('forum payout channel posts a real review thread and persists its location',async()=>{
 const guild='payout-forum-'+Date.now(),r=create(guild);
 const payloads=[];
 const channel={id:cfg.payoutRequestsChannelId,guildId:guild,type:ChannelType.GuildForum,
   availableTags:[],defaultAutoArchiveDuration:1440,
   threads:{create:async p=>{payloads.push(p);return{id:'111111111111111111'}}}};
 const client={channels:{fetch:async ()=>channel}};
 const post=await payout.postPayout(client,guild,cfg,r);
 assert.equal(payloads.length,1);
 assert.ok(payloads[0].message.embeds.length>=1);
 assert.ok(payloads[0].message.components.length===1);
 assert.equal(payloads[0].message.components[0].components.length,3);
 assert.equal(post.kind,'forum');
 assert.equal(post.channelId,'111111111111111111');
 assert.equal(records.find(guild,r.id).publishedAt>0,true);
 assert.ok(records.find(guild,r.id).publicationUrl.includes('111111111111111111'));
});
test('regular text payout channel posts a message without creating a thread',async()=>{
 const guild='payout-text-'+Date.now(),r=create(guild);
 let sent=0;
 const channel={id:cfg.payoutRequestsChannelId,guildId:guild,type:ChannelType.GuildText,
   isTextBased:()=>true,isDMBased:()=>false,send:async message=>{
     sent++;assert.ok(message.embeds.length>=1);return{id:'222222222222222222',channelId:cfg.payoutRequestsChannelId,url:'https://discord.com/channels/x/y/z'};
   }};
 const post=await payout.postPayout({channels:{fetch:async()=>channel}},guild,cfg,r);
 assert.equal(sent,1);
 assert.equal(post.kind,'text');
 assert.equal(records.find(guild,r.id).publicationMessageId,'222222222222222222');
});
test('saved payout survives failed forum posting and can be retried with same ID',async()=>{
 const guild='payout-retry-'+Date.now(),r=create(guild);
 const channel={id:cfg.payoutRequestsChannelId,guildId:guild,type:ChannelType.GuildForum,
   threads:{create:async()=>{throw new Error('Missing Permissions')}}};
 await assert.rejects(payout.postPayout({channels:{fetch:async()=>channel}},guild,cfg,r),/Missing Permissions/);
 assert.equal(records.find(guild,r.id).status,'Pending');
 assert.equal(records.find(guild,r.id).publishedAt,undefined);
 channel.threads.create=async()=>({id:'333333333333333333'});
 const result=await payout.postPayout({channels:{fetch:async()=>channel}},guild,cfg,r);
 assert.equal(result.kind,'forum');
 assert.equal(records.find(guild,r.id).id,r.id);
});
test('payout channel diagnostics distinguish forums from text channels',async()=>{
 const guild='payout-diagnose-'+Date.now();
 const channel={id:cfg.payoutRequestsChannelId,guildId:guild,type:ChannelType.GuildForum,
    permissionsFor:()=>({has:()=>true})};
 const info=await payout.payoutChannelInfo({channels:{fetch:async()=>channel},user:{id:'bot'}},guild,cfg);
 assert.equal(info.kind,'forum');
 assert.deepEqual(info.missing,[]);
 assert.match(info.hint,/Forum posts/);
});
test('payout slash commands allow executives to republish and diagnose saved requests',()=>{
 const options=payout.data.toJSON().options.map(o=>o.name);
 assert.ok(options.includes('publish'));
 assert.ok(options.includes('diagnose'));
 assert.ok(options.includes('request'));
});
