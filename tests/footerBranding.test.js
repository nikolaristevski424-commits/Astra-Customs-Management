const test = require('node:test');
const assert = require('node:assert/strict');
const {EmbedBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle} = require('discord.js');
const {withFooter,footerUrl} = require('../utils/footerBranding');

test('classic embeds keep their existing banner and gain a footer image at the bottom', () => {
  const main = new EmbedBuilder().setTitle('Astra Customs Giveaway').setImage('https://example.org/cover.png');
  const original={embeds:[main]};
  const enriched=withFooter(original);
  assert.equal(original.embeds.length,1);
  assert.equal(enriched.embeds.length,2);
  assert.equal(enriched.embeds[0].toJSON().image.url,'https://example.org/cover.png');
  assert.equal(enriched.embeds[1].toJSON().image.url,footerUrl());
  assert.equal(withFooter(enriched).embeds.length,2);
});

test('components v2 append a gallery after buttons, without duplicating it', () => {
  const container = new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('Order Here'));
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('test-order').setLabel('Order').setStyle(ButtonStyle.Primary));
  const original={flags:MessageFlags.IsComponentsV2, components:[container,row]};
  const result=withFooter(original);
  assert.equal(original.components.length,2);
  assert.equal(result.components.length,3);
  assert.equal(result.components[2].toJSON().type,12);
  assert.equal(result.components[2].toJSON().items[0].media.url,footerUrl());
  assert.equal(withFooter(result).components.length,3);
});

test('regular button-only replies and empty messages are not modified',()=>{
 const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('test').setLabel('Continue').setStyle(ButtonStyle.Primary));
 const payload={components:[row]};
 assert.equal(withFooter(payload),payload);
 assert.equal(withFooter({content:'Hello'}).content,'Hello');
});

test('brand asset can be overridden for the current server',()=>{
 const main=new EmbedBuilder().setTitle('Test');
 const result=withFooter({embeds:[main]},{footerUrl:'https://example.com/astra-footer.png'});
 assert.equal(result.embeds[1].toJSON().image.url,'https://example.com/astra-footer.png');
});
