const test=require('node:test');
const assert=require('node:assert/strict');
const {ActionRowBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,MessageFlags}=require('discord.js');
const config=require('../utils/config');
const panel=require('../commands/panel');
const events=require('../events/interactionCreate');
const {withFooter}=require('../utils/footerBranding');
const {APPLICATIONS}=require('../utils/applicationStatus');
const GUILD='1488378242846036070';

function objects(value){
  return JSON.parse(JSON.stringify(value));
}
test('application panel labels all four jobs accurately with colored role buttons',()=>{
  const cfg={brandName:'Astra Customs',accentColor:'#5c77df',applicationStatus:{
    designer:'open',staff:'open',moderator:'open',partnership:'open'
  }};
  const payload=panel.BUILDERS.applications(cfg);
  const raw=objects(payload.components);
  const buttons=[];
  function walk(node){
    if(Array.isArray(node))return node.forEach(walk);
    if(!node||typeof node!=='object')return;
    if(node.type===2)buttons.push(node);
    if(node.components)walk(node.components);
  }
  walk(raw);
  assert.equal(buttons.length,4);
  const expected={
    application_designer_open:{name:APPLICATIONS.designer.name,style:ButtonStyle.Primary},
    application_staff_open:{name:APPLICATIONS.staff.name,style:ButtonStyle.Success},
    application_moderator_open:{name:'Discord Moderator',style:ButtonStyle.Primary},
    application_partnership_open:{name:'Partnership Team',style:ButtonStyle.Success}
  };
  for(const btn of buttons){
    const item=expected[btn.custom_id];
    assert.ok(item,'Unexpected application action: '+btn.custom_id);
    assert.equal(btn.label,item.name);
    assert.equal(btn.style,item.style);
    assert.ok(btn.emoji?.name);
  }
  assert.match(JSON.stringify(raw),/Discord Moderator/);
  assert.match(JSON.stringify(raw),/Partnership Team/);
});
test('legacy Order Here controls remove only ticket selections, preserving order dropdown',()=>{
 const row=new ActionRowBuilder().addComponents(
   new ButtonBuilder().setCustomId('order_open').setLabel('Order Now').setStyle(ButtonStyle.Success),
   new ButtonBuilder().setCustomId('help_ticket_open').setLabel('Support').setStyle(ButtonStyle.Secondary)
 );
 const ticket=new ActionRowBuilder().addComponents(
   new ButtonBuilder().setCustomId('management_ticket_open').setLabel('Management').setStyle(ButtonStyle.Secondary)
 );
 const result=panel.withoutTicketControls([row,ticket]);
 assert.equal(result.length,1);
 const serialized=JSON.stringify(result.map(v=>v.toJSON()));
 assert.match(serialized,/order_open/);
 assert.doesNotMatch(serialized,/help_ticket_open|management_ticket_open/);
});
test('shared classic embed polish applies Astra branding without modifying original values or decision footers',()=>{
  const src=new EmbedBuilder().setTitle('Astra Customs | Order update')
    .setDescription('The order is complete.')
    .addFields({name:'Order ID',value:'#123'});
  const result=withFooter({embeds:[src]},{brandName:'Astra Customs'});
  const decorated=result.embeds[0].toJSON();
  assert.equal(decorated.title,'Astra Customs | Order update');
  assert.equal(decorated.description,'The order is complete.');
  assert.equal(decorated.fields[0].value,'#123');
  assert.equal(decorated.author.name,'Astra Customs');
  assert.match(decorated.footer.text,/Official update/);
  assert.ok(decorated.color>0);
  const review=withFooter({embeds:[src.toJSON()]},{brandName:'Astra Customs'});
  assert.equal(review.embeds[0].toJSON().fields[0].name,'Order ID');
  const decided=withFooter({embeds:[new EmbedBuilder().setTitle('Application Accepted')
    .setColor(0x2ecc71).setFooter({text:'Decision: Accepted • Moderator'})]});
  assert.match(decided.embeds[0].toJSON().footer.text,/^Decision: Accepted/);
  assert.equal(decided.embeds[0].toJSON().color,0x2ecc71);
});
test('Moderator review decision, result announcement and DM never say Creative Team',async()=>{
  const applicantId='133333333333333333',reviewerId='144444444444444444';
  const channelId='1550931416949461022',messageId='1888888888888888888';
  const results=[],dms=[],roleAdds=[],edits=[];
  const applicationMessage={
    id:messageId,
    embeds:[new EmbedBuilder().setTitle('Discord Moderator Application')
      .addFields({name:'Applicant',value:'<@'+applicantId+'>'})],
    components:[new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('app_accept_moderator_'+applicantId)
        .setLabel('Approve').setStyle(ButtonStyle.Success))],
    edit:async payload=>{edits.push(payload);}
  };
  const guild={
    id:GUILD,
    members:{fetch:async id=>({roles:{add:async roles=>{roleAdds.push({id,roles})}}})}
  };
  config.setConfig(GUILD,{
    applicationsChannelId:channelId,
    applicationResultsChannelId:'1550931585241452654',
    applicationReviewerRoleIds:[],
    moderatorApplicationAcceptRoleId:['1565198911662985336','1565198893837328464']
  });
  let confirmation;
  const interaction={
    guildId:GUILD,guild,
    customId:'app_decision_modal_accept_moderator_'+applicantId+'_'+channelId+'_'+messageId,
    user:{id:reviewerId,tag:'Reviewer'},
    member:{id:reviewerId,permissions:{has:()=>true},roles:{cache:new Map()}},
    client:{
      commands:new Map(),
      channels:{fetch:async()=>({messages:{fetch:async()=>applicationMessage},send:async payload=>{results.push(payload)}})},
      users:{fetch:async()=>({send:async payload=>{dms.push(payload)}})}
    },
    fields:{getTextInputValue:()=> 'Applicant demonstrated good moderation judgment.'},
    isChatInputCommand:()=>false,isAutocomplete:()=>false,isButton:()=>false,
    isStringSelectMenu:()=>false,isModalSubmit:()=>true,
    reply:async payload=>{confirmation=payload}
  };
  await events.execute(interaction);
  assert.equal(edits.length,1,'Original review should be updated');
  assert.equal(results.length,1,'Result should be posted');
  assert.equal(dms.length,1,'Applicant should receive DM');
  assert.equal(roleAdds.length,1);
  assert.deepEqual(roleAdds[0].roles,['1565198911662985336','1565198893837328464']);
  for(const out of [...edits,...results,...dms]){
    const str=JSON.stringify(out);
    assert.match(str,/Discord Moderator/);
    assert.doesNotMatch(str,/Creative Team/);
  }
  assert.match(confirmation.content,/Discord Moderator/);
  assert.ok(confirmation.flags&MessageFlags.Ephemeral);
});
