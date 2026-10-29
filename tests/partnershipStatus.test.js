const test=require('node:test');
const assert=require('node:assert/strict');
const partner=require('../utils/partnerPosts');
const panel=require('../commands/panel');
const config=require('../utils/config');
const serviceManager=require('../utils/serviceStatusManager');
const availability=require('../utils/serviceAvailability');

test('partnership invite inputs allow Discord shorthand and full https URLs',()=>{
  const cases=['discord.gg/astracustoms','https://discord.gg/astracustoms',
    'https://discord.com/invite/astracustoms','www.discord.gg/astracustoms'];
  for(const input of cases){
    assert.equal(partner.normalizeInvite(input),'https://discord.gg/astracustoms',input);
    assert.equal(partner.isInvite(input),true,input);
  }
  for(const input of ['discord.gg.evil.com/foo','https://evil.com/discord.gg/astracustoms',
    'javascript:alert(1)','http://discord.gg/foo','discord.gg/foo?x=1','https://user:pass@discord.gg/foo','abc']){
    assert.equal(partner.normalizeInvite(input),null,input);
  }
});
test('partnership keeps multiple representatives and the command runner in the ping',async()=>{
  const messages=[];
  const channel={id:'1497069090081210418',isTextBased:()=>true,isDMBased:()=>false,
    send:async payload=>{messages.push(payload);return{channelId:'1497069090081210418',url:'https://discord.com/channels/1/2/3'}}};
  const interaction={guild:{channels:{fetch:async ()=>channel}},client:{user:{id:'999999999999999999'}}};
  const result=await partner.send(interaction,{title:'Partner',description:'Welcome to our partner',
    fields:[{name:'Partner',value:'Example'}],invite:'discord.gg/astracustoms',
    mentionUsers:['111111111111111111','222222222222222222','333333333333333333'],
    ping:{content:'',parse:[],roles:[]},footer:'partnership'});
  assert.equal(result.error,undefined);
  assert.equal(messages.length,1);
  const m=messages[0];
  assert.deepEqual(m.allowedMentions.users,['111111111111111111','222222222222222222','333333333333333333']);
  assert.equal(m.components[0].components[0].data.url,'https://discord.gg/astracustoms');
});
function makeV2(id,channelId,kind){
  const calls=[];
  const body=kind==='order'
    ? {type:17,components:[{type:10,content:'Order Here: when staff change the order status'},
       {type:1,components:[{type:3,custom_id:'astra_order_type'}]}]}
    : {type:17,components:[{type:10,content:'Order Status — Discord, Liveries, Graphics. Current availability'}]};
  return {id,channelId,author:{id:'my-bot'},embeds:[],components:[{toJSON:()=>body}],
    flags:{has:()=>true},edit:async payload=>{calls.push(JSON.stringify(payload));},
    get edited(){return calls}};
}
test('/status refreshes BOTH public panels including when previous messages are not registered',async()=>{
  const gid='panel-dual-'+Date.now(),orderId=panel.PANEL_CHANNELS.order,statusId=panel.PANEL_CHANNELS['order-status'];
  const order=makeV2('111111111111111112',orderId,'order');
  const status=makeV2('111111111111111113',statusId,'status');
  const client={user:{id:'my-bot'},channels:{fetch:async id=>({
    messages:{fetch:async query=>typeof query==='object'?new Map([[id==='order'?order.id:status.id,id==='order'?order:status]]):null}
  })}};
  // Both default panel channels are provided separately.
  client.channels.fetch=async id=>({messages:{fetch:async query=>{
    if(typeof query!=='object')return null;
    return new Map([[id===orderId?order.id:status.id,id===orderId?order:status]]);
  }}});
  serviceManager.set(gid,'liveries','open');
  const result=await panel.refreshPanels(client,gid,{discover:true});
  assert.equal(result.find(x=>x.type==='order').count,1);
  assert.equal(result.find(x=>x.type==='order-status').count,1);
  assert.equal(order.edited.length,1);
  assert.equal(status.edited.length,1);
  assert.ok(order.edited[0].includes(availability.badgeIcons.open));
  assert.ok(status.edited[0].includes(availability.badgeIcons.open));
  assert.equal(config.getConfig(gid).orderPanel.messageId,order.id);
  assert.equal(config.getConfig(gid).orderStatusPanel.messageId,status.id);
});
test('Order Here panel containing words "order status" is NOT misidentified as status panel',async()=>{
  const gid='panel-no-crossover-'+Date.now();
  const order=makeV2('111111111111111114',panel.PANEL_CHANNELS.order,'order');
  const client={user:{id:'my-bot'},channels:{fetch:async id=>({
    messages:{fetch:async query=>
      typeof query==='object'&&id===panel.PANEL_CHANNELS.order?new Map([[order.id,order]]):new Map()}
  })}};
  const result=await panel.refreshPanels(client,gid,{discover:true});
  assert.equal(result.find(x=>x.type==='order').count,1);
  assert.equal(result.find(x=>x.type==='order-status').count,0);
});
test('both tracking commands are present',()=>{
 const choices=panel.data.toJSON().options.map(x=>x.name);
 assert.ok(choices.includes('track-order'));
 assert.ok(choices.includes('track-status'));
 assert.ok(choices.includes('refresh'));
});
