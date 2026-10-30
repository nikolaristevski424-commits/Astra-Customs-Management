const test=require('node:test');
const assert=require('node:assert/strict');
const v=require('../utils/accountVerification');
const rogoid=require('../utils/rogoid');
const GUILD='1488378242846036070';
const DISCORD='1255248600850497568';
const OTHER='1453383083913904234';
const ROBLOX='1432640960';

test('Bloxlink is authoritative and RoGoid is never called when Bloxlink finds a match',async()=>{
  let secondary=0;
  const result=await v.robloxToDiscordWithSource(GUILD,ROBLOX,{
    bloxlinkLookup:async()=>DISCORD,
    rogoidLookup:async()=>{secondary++;return OTHER}
  });
  assert.deepEqual(result,{userId:DISCORD,source:'bloxlink'});
  assert.equal(secondary,0);
});
test('RoGoid is tried only when Bloxlink has no verified match',async()=>{
  const result=await v.robloxToDiscordWithSource(GUILD,ROBLOX,{
    bloxlinkLookup:async()=>null,rogoidLookup:async()=>DISCORD
  });
  assert.deepEqual(result,{userId:DISCORD,source:'rogoid'});
  const reverse=await v.discordToRobloxWithSource(GUILD,DISCORD,{
    bloxlinkLookup:async()=>null,rogoidLookup:async()=>ROBLOX
  });
  assert.deepEqual(reverse,{userId:ROBLOX,source:'rogoid'});
});
test('Invalid responses and provider errors never verify a buyer',async()=>{
  const result=await v.robloxToDiscordWithSource(GUILD,ROBLOX,{
    bloxlinkLookup:async()=>{throw new Error('provider offline')},
    rogoidLookup:async()=>({discordId:DISCORD})
  });
  assert.deepEqual(result,{userId:null,source:null});
  assert.equal(rogoid.extractDiscord({verified:false,discordId:DISCORD,robloxId:ROBLOX},ROBLOX),null);
  assert.equal(rogoid.extractDiscord({verified:true,discordId:DISCORD,robloxId:'9999'},ROBLOX),null);
  assert.equal(rogoid.extractDiscord({verified:true,discordId:DISCORD,robloxId:ROBLOX},ROBLOX),DISCORD);
  assert.equal(rogoid.extractRoblox({data:{discordId:OTHER,robloxId:ROBLOX}},DISCORD),null);
});
test('RoGoid API URL stays on the trusted HTTPS provider host',()=>{
  const good=rogoid.endpoint('https://api.rogoid.xyz/v1/{guildId}/users/{robloxId}',
    {guildId:GUILD,robloxId:ROBLOX});
  assert.equal(good,'https://api.rogoid.xyz/v1/'+GUILD+'/users/'+ROBLOX);
  assert.equal(rogoid.endpoint('http://api.rogoid.xyz/test',{guildId:GUILD}),null);
  assert.equal(rogoid.endpoint('https://rogoid.xyz.attacker.tld/{robloxId}',{robloxId:ROBLOX}),null);
  assert.equal(rogoid.endpoint('https://rogoid.xyz/test?api_key=secret',{}),null);
});
test('Missing RoGoid endpoint fails closed without making network calls',async()=>{
  let calls=0;
  const result=await rogoid.robloxToDiscord(GUILD,ROBLOX,{
    env:{ROGOID_API_KEY:'hidden-test-secret'},
    get:async()=>{calls++;return{status:200,data:{discordId:DISCORD}}}
  });
  assert.equal(result,null);
  assert.equal(calls,0);
});
test('Provider lookup accepts only expected identity and never sends API key in URL',async()=>{
  let called;
  const result=await rogoid.robloxToDiscord(GUILD,ROBLOX,{
    env:{
      ROGOID_API_KEY:'hidden-test-secret',
      ROGOID_ROBLOX_TO_DISCORD_URL:'https://api.rogoid.xyz/v1/servers/{guildId}/roblox/{robloxId}',
      ROGOID_AUTH_HEADER:'x-api-key'
    },
    get:async(url,config)=>{called={url,config};return{status:200,data:{verified:true,robloxId:ROBLOX,discordId:DISCORD}}}
  });
  assert.equal(result,DISCORD);
  assert.equal(called.config.headers['x-api-key'],'hidden-test-secret');
  assert.ok(!called.url.includes('hidden-test-secret'));
});
