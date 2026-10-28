const test = require('node:test');
const assert = require('node:assert/strict');
const {EmbedBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder} = require('discord.js');
const {withFooter,footerUrl} = require('../utils/footerBranding');

test('classic embeds preserve the header and display the footer before message buttons', () => {
  const cover=new EmbedBuilder().setTitle('Giveaway').setImage('https://example.org/cover.png');
  const buttons=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('enter').setLabel('Enter').setStyle(ButtonStyle.Primary));
  const original={embeds:[cover],components:[buttons]};
  const result=withFooter(original);
  assert.equal(original.embeds.length,1);
  assert.equal(result.embeds.length,2);
  assert.equal(result.embeds[0].toJSON().image.url,'https://example.org/cover.png');
  assert.equal(result.embeds[1].toJSON().image.url,footerUrl());
  assert.equal(withFooter(result).embeds.length,2);
});

test('V2 panels place the footer INSIDE the container above the bottom buttons',()=>{
  const container=new ContainerBuilder().setAccentColor(0x335599)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('Dashboard overview'))
    .addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
      .setCustomId('view_dashboard').setPlaceholder('View dashboard')
      .addOptions({label:'Overview',value:'overview'})))
    .addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder()
      .setCustomId('support').setLabel('Help').setStyle(ButtonStyle.Primary)));
  const original={flags:MessageFlags.IsComponentsV2,components:[container]};
  const result=withFooter(original);
  assert.equal(original.components.length,1);
  assert.equal(result.components.length,2);
  const outer=result.components[0].toJSON();
  assert.equal(outer.type,17);
  assert.equal(outer.accent_color,0x335599);
  assert.deepEqual(outer.components.map(x=>x.type),[10,1,12]);
  assert.equal(outer.components[1].components[0].type,3);
  assert.equal(outer.components[2].items[0].media.url,footerUrl());
  assert.equal(result.components[1].toJSON().components[0].custom_id,'support');
  assert.equal(withFooter(result).components.length,2);
});

test('root-level button rows remain below the branded container',()=>{
  const container=new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('Hello'));
  const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open').setLabel('Open').setStyle(ButtonStyle.Primary));
  const result=withFooter({flags:MessageFlags.IsComponentsV2,components:[container,row]});
  assert.equal(result.components.length,2);
  assert.equal(result.components[0].toJSON().components.at(-1).type,12);
  assert.equal(result.components[1].toJSON().type,1);
  assert.equal(withFooter(result).components.length,2);
});

test('button-only responses and empty messages are not decorated',()=>{
  const button=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('test').setLabel('Continue').setStyle(ButtonStyle.Primary));
  const payload={components:[button]};
  assert.equal(withFooter(payload),payload);
  assert.equal(withFooter({content:'Hello'}).content,'Hello');
});

test('custom footer URL is supported',()=>{
  const e=new EmbedBuilder().setTitle('Test');
  const result=withFooter({embeds:[e]},{footerUrl:'https://example.com/custom.png'});
  assert.equal(result.embeds[1].toJSON().image.url,'https://example.com/custom.png');
});
