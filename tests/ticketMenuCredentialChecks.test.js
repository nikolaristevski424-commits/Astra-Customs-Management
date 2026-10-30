const test=require('node:test');
const assert=require('node:assert/strict');
const {MessageFlags}=require('discord.js');
const panel=require('../commands/panel');
const interactionHandler=require('../events/interactionCreate');
const checks=require('../utils/credentialChecks');

const GUILD='1488378242846036070';
const MEMBER='1255248600850497568';
const EMOJI_ID='1559204224556863521';
const baseConfig={brandName:'Astra Customs',accentColor:'#3b82f6'};

function dropdowns(payload){
  return JSON.stringify(payload).match(/astra_ticket_type/g)||[];
}
test('all three ticket categories appear in one emoji-labelled dropdown, not separate buttons',()=>{
  const row=panel.ticketSelectRow().toJSON();
  assert.equal(row.components.length,1);
  const select=row.components[0];
  assert.equal(select.custom_id,'astra_ticket_type');
  assert.deepEqual(select.options.map(x=>x.value),['support','management','report']);
  for(const option of select.options)assert.equal(option.emoji.id,EMOJI_ID);
  assert.equal(select.max_values,1);
  const payload=panel.BUILDERS.tickets(baseConfig);
  assert.equal(dropdowns(payload).length,1);
  const encoded=JSON.stringify(payload);
  assert.doesNotMatch(encoded,/help_ticket_open|management_ticket_open|report_ticket_open/);
});
test('ticket dropdown is present on order/status and portfolio as well',()=>{
  for(const type of ['order','order-status','portfolio']){
    const rendered=panel.BUILDERS[type](baseConfig,GUILD);
    assert.equal(dropdowns(rendered).length,1,type);
    assert.doesNotMatch(JSON.stringify(rendered),/help_ticket_open/);
  }
});
test('all ticket menu selections open the correct modal and preserve privacy',async()=>{
  for(const [selection,expectedModal] of [
    ['support','ticket_open_modal'],
    ['management','special_ticket_management'],
    ['report','special_ticket_report']
  ]){
    let shown=null;
    const interaction={
      guildId:GUILD,customId:'astra_ticket_type',values:[selection],
      isChatInputCommand:()=>false,isAutocomplete:()=>false,isButton:()=>false,
      isStringSelectMenu:()=>true,isModalSubmit:()=>false,
      showModal:async modal=>{shown=modal.toJSON();},
      client:{commands:new Map()}
    };
    await interactionHandler.execute(interaction);
    assert.ok(shown,'Expected a modal for '+selection);
    assert.equal(shown.custom_id,expectedModal);
    if(selection==='report')assert.equal(shown.components.length,3);
  }
});
test('old support ticket buttons still work on previously published panels',async()=>{
  let modal;
  const interaction={
    guildId:GUILD,customId:'help_ticket_open',
    isChatInputCommand:()=>false,isAutocomplete:()=>false,isButton:()=>true,
    isStringSelectMenu:()=>false,isModalSubmit:()=>false,
    showModal:async value=>{modal=value.toJSON()},
    client:{commands:new Map()}
  };
  await interactionHandler.execute(interaction);
  assert.equal(modal.custom_id,'ticket_open_modal');
});
test('Roblox cookie live check authenticates with safe read-only GET, without modifying Roblox',async()=>{
  const requests=[];
  const result=await checks.checkRobloxCookie({
    env:{ROBLOX_COOKIE:'test-cookie'},
    get:async(url,options)=>{
      requests.push({url,headers:options.headers});
      return {status:200,data:{id:1432640960,name:'Example'}};
    }
  });
  assert.equal(result.state,'working');
  assert.equal(requests.length,1);
  assert.equal(requests[0].url,'https://users.roblox.com/v1/users/authenticated');
  assert.equal(requests[0].headers.Cookie,'.ROBLOSECURITY=test-cookie');
  assert.ok(!JSON.stringify(result).includes('test-cookie'));
});
test('Bloxlink and RoGoid return unlinked, not false "credential valid" statuses, on 404',async()=>{
  for(const [provider,call] of [
    ['Bloxlink',checks.checkBloxlink],
    ['RoGoid',checks.checkRogoid]
  ]){
    const result=await call(GUILD,MEMBER,{
      env:{BLOXLINK_API_KEY:'test-bloxlink-secret',ROGOID_API_KEY:'test-rogoid-secret',GUILD_ID:GUILD},
      get:async()=>({status:404,data:{error:'not_verified'}})
    });
    assert.equal(result.state,'unlinked',provider);
    assert.ok(!JSON.stringify(result).includes('test-'));
  }
});
test('401 is rejected, 429 is rate limited, and no raw key is disclosed',async()=>{
  for(const [status,expected] of [[401,'rejected'],[403,'denied'],[429,'rate_limited'],[503,'unavailable']]){
    const result=await checks.checkRogoid(GUILD,MEMBER,{
      env:{ROGOID_API_KEY:'secret-key',GUILD_ID:GUILD},
      get:async()=>({status,data:{echo:'secret-key'}})
    });
    assert.equal(result.state,expected);
    assert.ok(!JSON.stringify(result).includes('secret-key'));
  }
});
test('RoGoid and Bloxlink live checks send credentials in headers, never URL',async()=>{
  const requests=[];
  const get=async(url,options)=>{
    requests.push({url,headers:options.headers});
    return {status:200,data:url.includes('rogoid')?{
      discordId:MEMBER,robloxId:'1432640960'
    }:{robloxID:'1432640960'}};
  };
  const result=await checks.runAll(GUILD,MEMBER,{
    env:{GUILD_ID:GUILD,BLOXLINK_API_KEY:'blox-secret',
      ROGOID_API_KEY:'rogoid-secret',ROBLOX_COOKIE:'roblox-cookie'},get
  });
  assert.equal(result.bloxlink.state,'working');
  assert.equal(result.rogoid.state,'working');
  assert.equal(requests.length,3);
  assert.equal(requests.find(x=>x.url.includes('blox.link')).headers.Authorization,'blox-secret');
  assert.equal(requests.find(x=>x.url.includes('rogoid')).headers.Authorization,'Bearer rogoid-secret');
  assert.ok(requests.every(x=>!x.url.includes('secret')));
  assert.ok(!JSON.stringify(result).includes('secret'));
});
test('credential checks are throttled per guild',()=>{
  assert.equal(checks.acquireCheck('health-check-isolated',1000000),0);
  assert.ok(checks.acquireCheck('health-check-isolated',1000001)>0);
  assert.equal(checks.acquireCheck('health-check-isolated',1060001),0);
});
