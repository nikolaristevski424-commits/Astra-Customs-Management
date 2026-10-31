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
test('Order Here is solely for orders and shows original custom status emoji legend',()=>{
  const payload=panel.BUILDERS.order(baseConfig,GUILD);
  const encoded=JSON.stringify(payload);
  const availability=require('../utils/serviceAvailability');
  assert.equal(dropdowns(payload).length,0,'Order Here must not offer ticket creation');
  assert.doesNotMatch(encoded,/help_ticket_open|management_ticket_open|report_ticket_open/);
  assert.match(encoded,/astra_order_type/);
  assert.match(encoded,/Status Legend/);
  for(const status of ['open','delayed','closed','premium']){
    assert.ok(encoded.includes(availability.icons[status]),'Missing original '+status+' custom emoji');
    assert.ok(encoded.includes(availability.labels[status]),'Missing '+status+' legend label');
  }
  assert.ok(encoded.includes('astra-customs-terms.vercel.app'));
});
test('Tickets is the only panel offering ticket creation; Order Status has all custom emoji legend states',()=>{
  for(const type of Object.keys(panel.BUILDERS)){
    const rendered=panel.BUILDERS[type](baseConfig,GUILD);
    const count=dropdowns(rendered).length;
    assert.equal(count,type==='tickets'?1:0,type+' must not open tickets outside Tickets');
    if(type!=='tickets'){
      const json=JSON.stringify(rendered);
      assert.doesNotMatch(json,/help_ticket_open|management_ticket_open|report_ticket_open/,type);
    }
  }
  const status=JSON.stringify(panel.BUILDERS['order-status'](baseConfig));
  const availability=require('../utils/serviceAvailability');
  assert.match(status,/Status Legend/);
  for(const name of ['open','delayed','closed','premium']){
    assert.ok(status.includes(availability.icons[name]),'Missing '+name+' custom emoji');
    assert.ok(status.includes(availability.labels[name]),'Missing '+name+' text');
  }
  assert.ok(status.includes('order_open'),'Order Status should retain its Order Now button');
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
      message:{author:{id:'bot'},components:panel.BUILDERS.tickets(baseConfig).components},

      isChatInputCommand:()=>false,isAutocomplete:()=>false,isButton:()=>false,
      isStringSelectMenu:()=>true,isModalSubmit:()=>false,
      showModal:async modal=>{shown=modal.toJSON();},
      client:{user:{id:'bot'},commands:new Map()}
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
    message:{author:{id:'bot'},embeds:[{title:'Astra Customs Assistance'}],
      components:[{type:1,components:[{type:2,custom_id:'help_ticket_open'}]}]},
    isChatInputCommand:()=>false,isAutocomplete:()=>false,isButton:()=>true,
    isStringSelectMenu:()=>false,isModalSubmit:()=>false,
    showModal:async value=>{modal=value.toJSON()},
    client:{user:{id:'bot'},commands:new Map()}
  };
  await interactionHandler.execute(interaction);
  assert.equal(modal.custom_id,'ticket_open_modal');
});
test('stale Order Status and Portfolio menus and buttons cannot open tickets',async()=>{
  for(const type of ['order-status','portfolio','order']){
    const source=panel.BUILDERS[type](baseConfig,GUILD);
    // Older messages still have the historical menu component.
    const message={author:{id:'bot'},components:[
       ...source.components,
       panel.ticketSelectRow()
    ]};
    for(const customId of ['astra_ticket_type','help_ticket_open','management_ticket_open','report_ticket_open']){
      let rejected,opened=false;
      const interaction={
        guildId:GUILD,customId,values:['support'],message,
        isChatInputCommand:()=>false,isAutocomplete:()=>false,
        isButton:()=>customId!=='astra_ticket_type',
        isStringSelectMenu:()=>customId==='astra_ticket_type',
        isModalSubmit:()=>false,
        showModal:async()=>{opened=true;},
        reply:async payload=>{rejected=payload;},
        client:{user:{id:'bot'},commands:new Map()}
      };
      await interactionHandler.execute(interaction);
      assert.equal(opened,false,customId+' opened a ticket on '+type);
      assert.match(rejected.content,/Tickets/);
      assert.ok(rejected.flags&MessageFlags.Ephemeral);
    }
  }
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
