const test=require('node:test');
const assert=require('node:assert/strict');
const partnership=require('../commands/partnership');
const env=require('../utils/env');
const partner=require('../utils/partnerPosts');

test('partnership supports full required advertisement and five representatives',()=>{
  const options=partnership.data.toJSON().options;
  const advertisement=options.find(o=>o.name==='advertisement');
  assert.equal(advertisement.required,true);
  assert.equal(advertisement.max_length,3000);
  assert.equal(options.filter(o=>o.name.startsWith('rep')).length,5);
  assert.equal(options.find(o=>o.name==='invite').required,true);
});
test('published partnership preserves advertiser text and management/rep mentions',async()=>{
 const original=partner.send;
 const captured=[];
 partner.send=async(i,payload)=>{captured.push(payload);return{message:{channelId:'1497069090081210418',
   url:'https://discord.com/channels/g/c/m'}}};
 try{
  let response;
  const values={server:'Liberty State RP',invite:'discord.gg/LibertyRP',
   advertisement:'## Liberty State Roleplay\\n- Active departments\\n- Custom liveries\\nJoin our realistic community!',
   details:'Monthly community events'};
  const interaction={
   guildId:'1488378242846036070',guild:{ownerId:'1255248600850497568'},
   user:{id:'1255248600850497568'},
   member:{id:'1255248600850497568',roles:{cache:new Map()},
     permissions:{has:()=>true}},
   options:{getString:(name)=>values[name]??null,
     getUser:(name)=>name==='rep1'?{id:'1453383083913904234'}:null},
   reply:async x=>{response=x;},deferReply:async()=>{},
   editReply:async x=>{response=x;}
  };
  await partnership.execute(interaction);
  assert.equal(captured.length,1);
  assert.match(captured[0].description,/Server Advertisement/);
  assert.ok(captured[0].description.includes(values.advertisement));
  assert.equal(captured[0].invite,'https://discord.gg/LibertyRP');
  assert.deepEqual(captured[0].mentionUsers,['1255248600850497568','1453383083913904234']);
  assert.equal(captured[0].fields.find(f=>f.name==='Partnership notes').value,values.details);
  assert.match(response,/Partnership published/);
 }finally{partner.send=original;}
});
test('application acceptance role env entries support multiple IDs',()=>{
  const oldStaff=process.env.STAFF_APPLICATION_ACCEPT_ROLE_ID;
  const oldDesign=process.env.DESIGNER_APPLICATION_ACCEPT_ROLE_ID;
  try{
    process.env.STAFF_APPLICATION_ACCEPT_ROLE_ID='1497415910472945687,1497415634915561603';
    process.env.DESIGNER_APPLICATION_ACCEPT_ROLE_ID='1497420258900709426,1497420088456777859';
    const overrides=env.getEnvConfigOverrides();
    assert.deepEqual(overrides.staffApplicationAcceptRoleId,
      ['1497415910472945687','1497415634915561603']);
    assert.deepEqual(overrides.designerApplicationAcceptRoleId,
      ['1497420258900709426','1497420088456777859']);
  }finally{
    if(oldStaff===undefined)delete process.env.STAFF_APPLICATION_ACCEPT_ROLE_ID;
    else process.env.STAFF_APPLICATION_ACCEPT_ROLE_ID=oldStaff;
    if(oldDesign===undefined)delete process.env.DESIGNER_APPLICATION_ACCEPT_ROLE_ID;
    else process.env.DESIGNER_APPLICATION_ACCEPT_ROLE_ID=oldDesign;
  }
});
