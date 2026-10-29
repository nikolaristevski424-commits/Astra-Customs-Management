const test=require('node:test');
const assert=require('node:assert/strict');
const {ChannelType}=require('discord.js');
const calc=require('../utils/payoutMath');
const payout=require('../commands/payout');
const records=require('../utils/payoutRequests');
const config=require('../utils/config');

const RATES={
  '1497420258900709426':80,
  '1497420310599700560':85,
  '1497420194807808174':90,
  '1497420135814791301':95,
};
function member(...roleIds){
  return {id:'1255248600850497568',roles:{cache:new Map(roleIds.map(id=>[id,{id}]))},
    permissions:{has:()=>false}};
}
test('uses the highest matching designer role, not a supplied percentage',()=>{
  assert.deepEqual(calc.selectCommission(member('1497420258900709426'),{commissionRates:RATES}),
    {roleId:'1497420258900709426',rate:80});
  assert.deepEqual(calc.selectCommission(member('1497420258900709426','1497420135814791301'),{commissionRates:RATES}),
    {roleId:'1497420135814791301',rate:95});
  assert.equal(calc.selectCommission(member('123456789012345678'),{commissionRates:RATES}),null);
});
test('tax is deducted before designer share, using whole Robux',()=>{
  const cases=[[80,112],[85,119],[90,126],[95,133]];
  for(const [rate,expected] of cases){
    const result=calc.calculatePayout(200,rate);
    assert.equal(result.totalPrice,200);
    assert.equal(result.robloxTax,60);
    assert.equal(result.afterTax,140);
    assert.equal(result.amount,expected);
    assert.equal(result.commissionPercent,rate);
  }
  assert.deepEqual(
    (({robloxTax,afterTax,amount})=>({robloxTax,afterTax,amount}))(calc.calculatePayout(101,85)),
    {robloxTax:31,afterTax:70,amount:59});
});
test('bad totals and commission percentages cannot produce payout records',()=>{
  for(const total of [0,-1,1.2,Infinity,Number.MAX_SAFE_INTEGER]){
    assert.throws(()=>calc.calculatePayout(total,80));
  }
  for(const rate of [0,101,82.5,NaN]){
    assert.throws(()=>calc.calculatePayout(200,rate));
  }
});
test('slash command accepts total price, not self-claimed payout amount',()=>{
  const options=payout.data.toJSON().options.find(x=>x.name==='request').options;
  assert.equal(options.find(x=>x.name==='total_price').required,true);
  assert.equal(options.some(x=>x.name==='amount'),false);
  assert.equal(options.find(x=>x.name==='payment_link').required,true);
  assert.equal(options.find(x=>x.name==='customer_discord').required,true);
});
test('review embed displays sale total, tax, role, rate and exact payout',()=>{
  const quote={...calc.calculatePayout(200,95),commissionRoleId:'1497420135814791301'};
  const payload=payout.buildEmbed({brandName:'Astra Customs',accentColor:'#4565A9'},{
    id:1,status:'Pending',requestedBy:'1255248600850497568',
    robloxUsername:'Designer',reason:'Logo',createdAt:Date.now(),...quote
  }).toJSON();
  const fields=Object.fromEntries(payload.fields.map(f=>[f.name,f.value]));
  assert.equal(fields['Total customer price'],'R$200');
  assert.equal(fields['Roblox tax (30%)'],'-R$60');
  assert.equal(fields['After Roblox tax'],'R$140');
  assert.match(fields['Designer commission'],/95%/);
  assert.match(fields['Designer commission'],/1497420135814791301/);
  assert.equal(fields['Designer payout'],'**R$133**');
});
test('actual payout request stores computed amount and real matching role',async()=>{
  const guildId='computed-payout-'+Date.now();
  const requester=member('1497420088456777859','1497420258900709426','1497420194807808174');
  config.setConfig(guildId,{commissionRates:RATES,payoutRequesterRoleIds:['1497420088456777859'],
    payoutRequestsChannelId:'1560658675368984677'});
  let result;
  const channel={
    id:'1560658675368984677',guildId,type:ChannelType.GuildText,
    isTextBased:()=>true,isDMBased:()=>false,
    send:async p=>{result=p;return{id:'555555555555555555',channelId:'1560658675368984677',url:'https://discord.com/channels/example'}}
  };
  let message;
  const interaction={
    guildId,guild:{members:{fetch:async()=>requester}},
    member:requester,user:{id:requester.id},
    client:{channels:{fetch:async()=>channel}},
    options:{
      getSubcommand:()=> 'request',
      getInteger:(name)=>name==='total_price'?200:null,
      getString:(name)=>({
        robux_username:'Designer',reason:'Livery commission',
        payment_link:'https://www.roblox.com/game-pass/1234/example',
        customer_discord:'buyer_name',roblox_id:'111111111111111111'
      })[name]||null,
    },
    deferReply:async()=>{},editReply:async text=>{message=text;},reply:async text=>{message=text;}
  };
  await payout.execute(interaction);
  const saved=records.list(guildId)[0];
  assert.equal(saved.totalPrice,200);
  assert.equal(saved.robloxTax,60);
  assert.equal(saved.afterTax,140);
  assert.equal(saved.commissionPercent,90);
  assert.equal(saved.commissionRoleId,'1497420194807808174');
  assert.equal(saved.amount,126);
  assert.equal(saved.customerDiscordUsername,'buyer_name');
  assert.ok(result.embeds.length>0);
  assert.match(message,/R\$126/);
});
