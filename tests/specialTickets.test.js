const test=require('node:test');
const assert=require('node:assert/strict');
const {ChannelType}=require('discord.js');
const special=require('../utils/specialTickets');
const tickets=require('../utils/tickets');
const config=require('../utils/config');
const {closeTicket}=require('../utils/ticketClosing');

const GUILD_ID='1488378242846036070',USER_ID='123456789012345678';
const roleIds=special.TYPES.report.roleIds;
let seq=1000000000000000000n;
function env(type){
  const id=String(++seq),posts=[],transcripts=[];
  const guild={
    id:GUILD_ID,roles:{
      everyone:{id:GUILD_ID},
      cache:new Map(roleIds.map(r=>[r,{id:r}]))
    },
    channels:{
      fetch:async target=>target===special.CATEGORY_ID?{id:target,type:ChannelType.GuildCategory,guildId:GUILD_ID}:null,
      create:async options=>{
        guild.lastCreated=options;
        return{id,send:async message=>{posts.push(message);return{id:'message-'+posts.length}},name:options.name};
      }
    }
  };
  const replies=[];
  const interaction={
    guild,guildId:GUILD_ID,user:{id:USER_ID,username:'Reporter'},
    fields:{getTextInputValue:key=>({reason:'Harassment in staff chat',reported_user:'ReportedMember',evidence:'https://discord.com/channels/x/y/z'})[key]||''},
    deferReply:async()=>{},editReply:async text=>{replies.push(text);},
    reply:async text=>{replies.push(text)}
  };
  const channel={
    id,name:type+'-reporter',guildId:GUILD_ID,
    isTextBased:()=>true,isDMBased:()=>false,
    messages:{fetch:async()=>({size:0})},
    delete:async()=>{channel.deleted=true}
  };
  const archive={
    id:special.TYPES[type].transcriptChannelId,guildId:GUILD_ID,
    isTextBased:()=>true,isDMBased:()=>false,
    send:async payload=>{transcripts.push(payload);return{id:'archived'}}
  };
  const client={
    channels:{fetch:async target=>target===id?channel:target===archive.id?archive:null},
    users:{fetch:async()=>({send:async()=>{}})}
  };
  return{id,posts,transcripts,guild,interaction,channel,archive,client,replies};
}

test('management and report ticket configurations route to the exact category and archive channels',()=>{
  assert.equal(special.CATEGORY_ID,'1565467577415639182');
  assert.equal(special.TYPES.management.transcriptChannelId,'1531632265812119552');
  assert.equal(special.TYPES.report.transcriptChannelId,'1531632326834913322');
  assert.deepEqual(roleIds,['1538963485667500144','1565167658377158777','1565198911662985336']);
  const modal=special.form('report').toJSON();
  assert.equal(modal.components.length,3);
  assert.match(JSON.stringify(modal),/reported_user/);
});
test('report ticket restricts access, pings only specified report roles, and persists type',async()=>{
  const e=env('report');
  await special.open(e.interaction,'report');
  assert.equal(e.guild.lastCreated.parent,special.CATEGORY_ID);
  const overwrites=e.guild.lastCreated.permissionOverwrites;
  assert.ok(overwrites.some(x=>x.id===GUILD_ID&&x.deny));
  assert.ok(overwrites.some(x=>x.id===USER_ID&&x.allow));
  assert.ok(overwrites.some(x=>x.id===special.FOUNDER_ID&&x.allow));
  assert.deepEqual(overwrites.filter(x=>roleIds.includes(x.id)).map(x=>x.id),roleIds);
  assert.equal(e.posts.length,2);
  assert.deepEqual(e.posts[0].allowedMentions.roles,roleIds);
  assert.equal(tickets.get(GUILD_ID,e.id).type,'report');
  assert.equal(tickets.get(GUILD_ID,e.id).reportedUser,'ReportedMember');
});
test('management ticket does not ping reporting roles and retains separate transcript route',async()=>{
  const e=env('management');
  await special.open(e.interaction,'management');
  assert.equal(e.posts.length,2);
  assert.deepEqual(e.posts[0].allowedMentions.roles,[]);
  assert.equal(tickets.get(GUILD_ID,e.id).type,'management');
  assert.equal(tickets.get(GUILD_ID,e.id).transcriptChannelId,'1531632265812119552');
});
test('closing a report ticket sends transcript to report-only channel, not generic transcript channel',async()=>{
  const e=env('report');
  await special.open(e.interaction,'report');
  const success=await closeTicket(e.client,GUILD_ID,{transcriptChannelId:'1111111111111111111'},e.id,'moderator');
  assert.equal(success,true);
  assert.equal(e.transcripts.length,1);
  assert.match(e.transcripts[0].content,/Report a User/);
  assert.equal(e.channel.deleted,true);
  assert.ok(tickets.get(GUILD_ID,e.id).closedAt);
});
test('failed confidential transcript upload prevents ticket deletion',async()=>{
  const e=env('management');
  await special.open(e.interaction,'management');
  e.archive.send=async()=>{throw new Error('Missing permissions');};
  const success=await closeTicket(e.client,GUILD_ID,{transcriptChannelId:'1111111111111111111'},e.id,'moderator');
  assert.equal(success,false);
  assert.equal(e.channel.deleted,undefined);
  assert.equal(tickets.get(GUILD_ID,e.id).closedAt,undefined);
  assert.equal(tickets.get(GUILD_ID,e.id).closingAt,null);
});
