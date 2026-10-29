const test=require('node:test');
const assert=require('node:assert/strict');
const config=require('../utils/config');
const questions=require('../utils/applicationQuestions');
const application=require('../commands/application');
const panel=require('../commands/panel');
const giveaway=require('../commands/giveaway');
const payout=require('../commands/payout');
const events=require('../events/interactionCreate');

test('four application types and all required questions fit Discord modal limits',()=>{
  const keys=['designer','staff','moderator','partnership'];
  for(const key of keys){
    const questionsFor=questions.questionsFor(key);
    assert.ok(questionsFor.length>=3 && questionsFor.length<=5);
    assert.ok(questionsFor.every(q=>q.label.length<=45&&q.max<=4000&&q.question.length>=10));
    assert.equal(new Set(questionsFor.map(q=>q.id)).size,questionsFor.length);
  }
  assert.equal(questions.questionsFor('moderator').length,5);
  assert.equal(questions.questionsFor('partnership').length,3);
  const choices=application.data.toJSON().options[0].options[0].choices.map(q=>q.value);
  assert.deepEqual(choices,keys);
});

test('status update edits existing application panel in place and disables closed roles',async()=>{
  const guildId='app-status-test-'+Date.now();
  let payload=null,sent=0,edited=0;
  config.setNested(guildId,'applicationPanel',{channelId:'1000000000000000001',messageId:'1000000000000000002'});
  const message={
    id:'1000000000000000002',url:'https://discord.com/channels/g/c/m',
    author:{id:'bot'},edit:async p=>{payload=p;edited++}
  };
  const interaction={
    guildId,member:{permissions:{has:()=>true}},user:{id:'owner'},
    client:{user:{id:'bot'},channels:{fetch:async()=>({
      isTextBased:()=>true,
      messages:{fetch:async()=>message},
      send:async()=>{sent++}
    })}},
    options:{getString:name=>name==='application'?'moderator':'closed'},
    reply:async()=>{}
  };
  await application.execute(interaction);
  assert.equal(edited,1);
  assert.equal(sent,0);
  assert.equal(config.getConfig(guildId).applicationStatus.moderator,'closed');
  const json=JSON.stringify(payload);
  assert.ok(json.includes('application_moderator_open'));
  assert.ok(json.includes('Closed'));
  const components=payload.components.map(c=>typeof c.toJSON==='function'?c.toJSON():c);
  assert.ok(JSON.stringify(components).includes('application_partnership_open'));
  const buttons=JSON.stringify(components);
  assert.match(buttons,/application_moderator_open/);
});

test('closed applications reject old panel buttons and already opened modals',async()=>{
  const gid='app-closed-'+Date.now();
  config.setNested(gid,'applicationStatus',{partnership:'closed',moderator:'closed'});
  for(const kind of ['button','modal']){
    let reply;
    const interaction={
      customId:kind==='button'?'application_moderator_open':'application_partnership_modal',
      guildId:gid,
      isChatInputCommand:()=>false,isAutocomplete:()=>false,
      isButton:()=>kind==='button',isStringSelectMenu:()=>false,
      isModalSubmit:()=>kind==='modal',
      reply:async value=>{reply=value},
      client:{commands:new Map()}
    };
    await events.execute(interaction);
    assert.match(reply.content,/closed/i);
  }
});
test('Moderator application launches exactly five response inputs',async()=>{
  const gid='app-open-'+Date.now();
  let shown;
  const interaction={
    customId:'application_moderator_open',guildId:gid,
    isChatInputCommand:()=>false,isAutocomplete:()=>false,
    isButton:()=>true,isStringSelectMenu:()=>false,isModalSubmit:()=>false,
    showModal:async modal=>{shown=modal.toJSON()},
    client:{commands:new Map()}
  };
  await events.execute(interaction);
  assert.equal(shown.components.length,5);
  assert.equal(shown.custom_id,'application_moderator_modal');
  assert.ok(shown.components.every(row=>row.components[0].required));
});
test('giveaway start permits optional destination channel',()=>{
  const data=giveaway.data.toJSON();
  const start=data.options.find(o=>o.name==='start');
  const channel=start.options.find(o=>o.name==='channel');
  assert.ok(channel);
  assert.equal(channel.required,false);
});
test('payout request asks for payment link and buyer Discord username',()=>{
  const request=payout.data.toJSON().options.find(o=>o.name==='request');
  assert.equal(request.options.find(o=>o.name==='payment_link').required,true);
  assert.equal(request.options.find(o=>o.name==='customer_discord').required,true);
  const embed=payout.buildEmbed({brandName:'Astra Customs',accentColor:'#4565A9'},{
    id:1,status:'Pending',requestedBy:'1255248600850497568',
    amount:150,robloxUsername:'Designer123',reason:'Design commission',
    customerDiscordUsername:'customer_example',paymentLink:'https://www.roblox.com/game-pass/123/Example',
    createdAt:Date.now()
  }).toJSON();
  const fields=Object.fromEntries(embed.fields.map(x=>[x.name,x.value]));
  assert.match(fields['Payment link used'],/roblox.com/);
  assert.equal(fields['Customer Discord username'],'customer_example');
});
