const test=require('node:test');
const assert=require('node:assert/strict');
const {Collection}=require('discord.js');
const ledger=require('../utils/partnerLedger');
const command=require('../commands/partnership');
const stats=require('../commands/partnership-stats');
const posts=require('../utils/partnerPosts');
const config=require('../utils/config');
const hr=require('../utils/hr');
const infract=require('../commands/infract');

test('one published partnership earns R$20 and duplicate invites do not earn more',()=>{
  const id='ledger-'+Date.now();
  const input={userId:'1255248600850497568',server:'Test RP',invite:'https://discord.gg/example',
    messageId:'111111111111111111',messageUrl:'https://discord.com/channels/a/b/c'};
  assert.equal(ledger.record(id,input).created,true);
  assert.equal(ledger.record(id,{...input,messageId:'222222222222222222'}).created,false);
  assert.equal(ledger.stats(id,input.userId).count,1);
  assert.equal(ledger.stats(id,input.userId).robuxEarned,20);
  const next=ledger.record(id,{...input,invite:'https://discord.gg/another',messageId:'333333333333333333'});
  assert.equal(next.created,true);
  assert.equal(ledger.stats(id,input.userId).robuxEarned,40);
});
test('partnership members may publish using their team role, with durable commission tracking',async()=>{
  const id='team-partnership-'+Date.now();
  const teamRole='1560000000000000000';
  config.setConfig(id,{partnershipApplicationAcceptRoleId:[teamRole]});
  const original=posts.send;let sequence=0;
  posts.send=async()=>{sequence++;return{message:{id:String(1000000000000000000n+BigInt(sequence)),
    channelId:'1497069090081210418',url:'https://discord.com/channels/g/c/'+sequence}}};
  try{
    let response='';
    const interaction={
      guildId:id,guild:{ownerId:'123456789012345677'},
      member:{id:'1255248600850497568',roles:{cache:new Collection([[teamRole,{id:teamRole}]])},
        permissions:{has:()=>false}},
      user:{id:'1255248600850497568'},
      options:{
        getString:name=>({server:'Community RP',invite:'discord.gg/partner123',
          advertisement:'Our RP community is looking for partners.'})[name]||null,
        getUser:name=>name==='rep1'?{id:'123456789012345679'}:null,
      },
      deferReply:async()=>{},editReply:async r=>{response=r},
      reply:async r=>{response=r}
    };
    await command.execute(interaction);
    assert.match(response,/R\$20/);
    assert.equal(ledger.stats(id,interaction.user.id).count,1);
    await command.execute(interaction);
    assert.equal(ledger.stats(id,interaction.user.id).count,1);
    assert.match(response,/already recorded/);
  }finally{posts.send=original}
});
test('private stats commands expose member totals and management leaderboard',()=>{
  const opts=stats.data.toJSON().options.map(o=>o.name);
  assert.deepEqual(opts,['mine','user','leaderboard']);
});
test('Demotion is a selectable HR infraction and is stored without a forced role change',()=>{
  const options=infract.data.toJSON().options;
  const issue=options.find(o=>o.name==='issue');
  const punish=issue.options.find(o=>o.name==='punishment');
  assert.ok(punish.choices.some(c=>c.value==='Demotion'));
  const id='demotion-'+Date.now();
  const record=hr.issueInfraction(id,{userId:'123456789012345678',issuedBy:'1255248600850497568',
    punishment:'Demotion',reason:'Failure to meet team standards'});
  assert.equal(record.punishment,'Demotion');
  assert.equal(record.escalations.length,0);
  assert.equal(hr.listInfractions(id)[0].punishment,'Demotion');
});
