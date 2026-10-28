const test=require('node:test');
const assert=require('node:assert/strict');
const {EmbedBuilder,MessageFlags,ContainerBuilder,TextDisplayBuilder}=require('discord.js');
const {isOwner}=require('../utils/ownership');
const partner=require('../utils/partnerPosts');
const {withFooter,footerUrl}=require('../utils/footerBranding');
const closee=require('../commands/closee');
const paid=require('../commands/paid');
const partnership=require('../commands/partnership');

function mockMember(id,roleId,{admin=false}={}){
 const cache=new Map(roleId?[[roleId,{id:roleId}]]:[]);
 cache.some=callback=>[...cache.values()].some(callback);
 return {id,roles:{cache},permissions:{has:()=>admin}};
}
function mockOwner(userId,roleId){
 const member=mockMember(userId,roleId);

 return {user:{id:userId},member,guild:{ownerId:'999999999999999999'}};
}
test('ownership role ID 1538963559986372719 authorizes paid ad',()=>{
 const original=process.env.OWNERSHIP_ROLE_IDS;
 delete process.env.OWNERSHIP_ROLE_IDS;
 try{
  const proper=mockOwner('123456789012345678','1538963559986372719');
  assert.equal(isOwner(proper),true);
  const impostor=mockOwner('123456789012345678','1538963559986372720');
  impostor.member.permissions.has=()=>true;
  assert.equal(isOwner(impostor),false);
  assert.equal(isOwner({...impostor,guild:{ownerId:impostor.user.id}}),true);
 }finally{
  if(original===undefined)delete process.env.OWNERSHIP_ROLE_IDS;
  else process.env.OWNERSHIP_ROLE_IDS=original;
 }
});
test('paid ad is a subcommand, partnership allows five representatives',()=>{
 const ad=paid.data.toJSON(),part=partnership.data.toJSON();
 assert.equal(ad.name,'paid');
 assert.equal(ad.options[0].name,'ad');
 assert.equal(part.name,'partnership');
 assert.equal(part.options.filter(o=>o.name.startsWith('rep')).length,5);
});
test('invite validation rejects malicious non-Discord links',()=>{
 assert.equal(partner.isInvite('https://discord.gg/pap89wQJpk'),true);
 assert.equal(partner.isInvite('https://discord.com/invite/pap89wQJpk'),true);
 assert.equal(partner.isInvite('https://discord.gg.evil.com/invite/abc'),false);
 assert.equal(partner.isInvite('https://evil.example/discord.gg/abc'),false);
});
test('paid-ad ping controls require explicit mention permission',()=>{
 const make=(value,role,allowed)=>({options:{getString:(key)=>value,getRole:()=>role},member:{permissions:{has:()=>allowed}}});
 assert.equal(partner.pingOptions(make('everyone',null,false)).error!==undefined,true);
 assert.equal(partner.pingOptions(make('here',null,true)).content,'@here');
 assert.equal(partner.pingOptions(make('role',null,true)).error!==undefined,true);
 assert.equal(partner.pingOptions(make('role',{id:'123456789012345678',mentionable:true},false)).roles[0],'123456789012345678');
});
test('closee is staff-only and rejects an ordinary customer',()=>{
 const {canClose}=closee;
 const cfg={ticketStaffRoleIds:['123456789012345679'],managerRoleIds:['123456789012345680']};
 const regular=mockMember('123456789012345678');
 assert.equal(canClose(regular,cfg),false);
 const staff=mockMember('123456789012345678','123456789012345679');
 assert.equal(canClose(staff,cfg),true);
});
test('brand footer defaults to new 2026 asset and replaces old embed footer',()=>{
 assert.ok(footerUrl().endsWith('/astra-footer-2026.webp'));
 const e=new EmbedBuilder().setTitle('Astra');
 const old=new EmbedBuilder().setImage('https://raw.githubusercontent.com/nikolaristevski424-commits/Astra-Customs-Management/main/assets/banners/footer-banner.png');
 const result=withFooter({embeds:[e,old]});
 assert.equal(result.embeds.length,2);
 assert.equal(result.embeds[1].toJSON().image.url,footerUrl());
});

test('partnership and sponsored ad send to the configured channel with appropriate mentions',async()=>{
 const captured=[],channelId=partner.PARTNER_CHANNEL_ID;
 const originalAd=process.env.PAID_AD_CHANNEL_ID, originalPartnership=process.env.PARTNERSHIP_CHANNEL_ID;
 delete process.env.PAID_AD_CHANNEL_ID;
 delete process.env.PARTNERSHIP_CHANNEL_ID;
 try{
   const interaction={guild:{channels:{fetch:async(id)=>{
     assert.equal(id,channelId);
     return {send:async(p)=>{captured.push(p);return {id:'message-1',channelId,url:'https://discord.com/channels/guild/channel/message-1'};},isTextBased:()=>true,isDMBased:()=>false};
   }}}};
   const result=await partner.send(interaction,{title:'Partnership',description:'New partner',invite:'https://discord.gg/example',
      mentionUsers:['123456789012345678','987654321098765432'],ping:{content:'',parse:[],roles:[]},footer:'partnership'});
   assert.equal(result.message.channelId,channelId);
   assert.match(captured[0].content,/<@123456789012345678>/);
   assert.match(captured[0].content,/<@987654321098765432>/);
   assert.equal(captured[0].allowedMentions.parse.length,0);
   assert.equal(captured[0].components[0].components[0].data.url,'https://discord.gg/example');
 }finally{
   if(originalAd===undefined)delete process.env.PAID_AD_CHANNEL_ID;
   else process.env.PAID_AD_CHANNEL_ID=originalAd;
   if(originalPartnership===undefined)delete process.env.PARTNERSHIP_CHANNEL_ID;
   else process.env.PARTNERSHIP_CHANNEL_ID=originalPartnership;
 }
});
