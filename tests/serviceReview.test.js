const test=require('node:test');
const assert=require('node:assert/strict');
const {ChannelType,MessageFlags}=require('discord.js');
const config=require('../utils/config');
const availability=require('../utils/serviceAvailability');
const status=require('../commands/status');
const service=require('../commands/service');
const panel=require('../commands/panel');
const {createCatalogThread}=require('../utils/catalogThreads');

test('preserves signal bars before each exact three-part status emoji',()=>{
  const signal={
    open:'<:StatusEMOJIGreen:1545902027299627018>',
    delayed:'<:StatusEmojiYellow:1545902089186705459>',
    closed:'<:StatusEmojiRed:1545902134258827294>',
    premium:'<:StatusEMOJIGreen:1545902027299627018>'
  };
  const badges={
    open:'<:OpenedEmoji1:1545902291469467668><:OpenedEmoji2:1545902335421841509><:OpenedEmoji3:1545902388961878188>',
    closed:'<:ClosedEmoji1:1545902477621072022><:ClosedEmoji2:1545902533703245914><:ClosedEmoji3:1545902589403594903>',
    delayed:'<:DeleyaedEmoji1:1558226588980617268><:DeleyaedEmojimiddle:1558226618160259072><:DeleyaedEmoji:1558226651148582973>',
    premium:'<:P12:1558228368883978295><:P13:1558228373975597146><:P12:1558228377511526523>'
  };
  for(const status of Object.keys(signal)){
    assert.equal(availability.signalIcons[status],signal[status]);
    assert.equal(availability.badgeIcons[status],badges[status]);
    assert.equal(availability.icons[status],signal[status]+badges[status]);
  }
  assert.deepEqual(status.data.toJSON().options[1].choices,service.data.toJSON().options[1].choices);
});
test('order status panel and the order selector show updated custom emojis',()=>{
  const cfg=config.defaultConfig();cfg.brandName='Astra Customs';cfg.serviceStatus={liveries:'delayed',uniforms:'closed',websites:'premium'};
  const statusView=JSON.stringify(panel.BUILDERS['order-status'](cfg));
  const orderView=JSON.stringify(panel.BUILDERS.order(cfg));
  for(const style of ['delayed','closed','premium'])assert.ok(statusView.includes(availability.icons[style]));
  assert.ok(orderView.includes(availability.icons.delayed));
  assert.ok(statusView.includes(availability.signalIcons.open+availability.badgeIcons.open));
  assert.ok(orderView.includes(availability.signalIcons.premium+availability.badgeIcons.premium));
  assert.ok(statusView.includes('StatusEmojiYellow'));
});
test('live status update edits the registered message rather than posting duplicates',async()=>{
  const guildId='panel-test-'+Date.now(),cfg=config.getConfig(guildId);
  const edited=[];
  config.setNested(guildId,'orderStatusPanel',{channelId:'ch1',messageId:'msg1'});
  const message={id:'msg1',channelId:'ch1',author:{id:'bot1'},embeds:[],flags:{has:()=>true},
    edit:async value=>{edited.push(value);return message;}};
  const client={user:{id:'bot1'},channels:{fetch:async(id)=>({
    messages:{fetch:async(input)=>input==='msg1'?message:null}
  })}};
  const result=await panel.refreshPanels(client,guildId);
  assert.equal(result.find(x=>x.type==='order-status').updated,true);
  assert.equal(edited.length,1);
  assert.ok(JSON.stringify(edited[0]).includes('Order Status'));
});
test('untracked legacy status embed is located, edited and registered',async()=>{
  const guildId='legacy-panel-'+Date.now(),edited=[];
  const message={id:'legacy1',channelId:panel.PANEL_CHANNELS['order-status'],author:{id:'bot1'},
    embeds:[{title:'Order Status',description:'Liveries Open',image:{url:'https://example.com/top.png'}}],
    components:[],flags:{has:()=>false},edit:async payload=>{edited.push(payload)}};
  const collection={find:predicate=>predicate(message)?message:undefined};
  const client={user:{id:'bot1'},channels:{fetch:async id=>({
    messages:{fetch:async()=>collection}
  })}};
  const results=await panel.refreshPanels(client,guildId,{discover:true});
  assert.equal(results.find(x=>x.type==='order-status').updated,true);
  assert.ok(JSON.stringify(edited[0]).includes('OpenedEmoji1'));
  assert.equal(config.getConfig(guildId).orderStatusPanel.messageId,'legacy1');
});
test('forum review submits an actual starter message in threads.create',async()=>{
  let options=null;
  const channel={id:'forum1',type:ChannelType.GuildForum,defaultAutoArchiveDuration:1440,
    threads:{create:async arg=>{options=arg;return{id:'thread1',url:'https://discord.com/channels/1/2'}}}};
  const result=await createCatalogThread(channel,'Package',{content:'Review'},{});
  assert.equal(result.fallback,false);
  assert.equal(options.message.content,'Review');
  assert.equal(options.startMessage,undefined);
});
test('text review creates a public thread and posts review inside it',async()=>{
  let options=null,posted=null;
  const thread={id:'thread2',send:async p=>{posted=p;return{id:'post1',url:'https://discord.com/channels/1/2/3'}}};
  const channel={id:'text1',type:ChannelType.GuildText,defaultAutoArchiveDuration:1440,
    threads:{create:async a=>{options=a;return thread;}}};
  const result=await createCatalogThread(channel,'Package',{content:'Preview'});
  assert.equal(options.type,ChannelType.PublicThread);
  assert.equal(options.startMessage,undefined);
  assert.equal(posted.content,'Preview');
  assert.equal(result.fallback,false);
});
test('permission failures in text review channels fall back to ordinary messages',async()=>{
  const channel={id:'text2',type:ChannelType.GuildText,
    threads:{create:async()=>{const e=new Error('Missing Permissions');e.code=50013;throw e;}},
    send:async p=>({id:'post2',url:'https://discord.com/channels/1/2/3'})};
  const result=await createCatalogThread(channel,'Review',{content:'Buttons'});
  assert.equal(result.fallback,true);
  assert.equal(result.id,'text2');
  assert.match(result.reason,/Missing Permissions/);
});
