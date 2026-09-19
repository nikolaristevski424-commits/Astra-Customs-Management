const { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const config = require('../utils/config');
const pricelistUtil = require('../utils/pricelist');
const { parseColor } = require('../utils/embeds');

// In-memory selection state per quote message: messageId -> { section: [itemKey, ...] }
const state = new Map();

function sectionMenu(customId, placeholder, items) {
    if (!items.length) return null;
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(customId)
            .setPlaceholder(placeholder)
            .setMinValues(0)
            .setMaxValues(Math.min(items.length, 25))
            .addOptions(items.slice(0, 25).map((item) => ({ label: `${item.name} — R$${item.price}`, value: `${item.section}:${item.index}` })))
    );
}

function buildComponents(guildId) {
    const pl = pricelistUtil.getPricelist(guildId);
    const packages = [
        { section: 'basicPack', index: 'null', name: pl.basicPack.name, price: pl.basicPack.price },
        { section: 'fullPack', index: 'null', name: pl.fullPack.name, price: pl.fullPack.price },
    ];
    return [
        sectionMenu('quote_sel_commandPacks', 'Command Packs...', pl.commandPacks.map((i, index) => ({ ...i, section: 'commandPacks', index }))),
        sectionMenu('quote_sel_singleCommands', 'Single Commands...', pl.singleCommands.map((i, index) => ({ ...i, section: 'singleCommands', index }))),
        sectionMenu('quote_sel_basicPackAddons', 'Basic Pack Addons...', pl.basicPackAddons.map((i, index) => ({ ...i, section: 'basicPackAddons', index }))),
        sectionMenu('quote_sel_packages', 'Basic Pack / Full Pack...', packages.map((i) => ({ ...i, index: 'null' }))),
    ].filter(Boolean);
}

function flatByKey(guildId) {
    const map = new Map();
    for (const item of pricelistUtil.flatten(guildId)) map.set(`${item.section}:${item.index}`, item);
    return map;
}

function buildSummaryEmbed(cfg, guildId, selections) {
    const flat = flatByKey(guildId);
    const chosen = Object.values(selections).flat().map((key) => flat.get(key)).filter(Boolean);
    const total = chosen.reduce((sum, i) => sum + i.price, 0);

    const embed = new EmbedBuilder()
        .setColor(parseColor(cfg.accentColor))
        .setTitle('Quote Builder')
        .setDescription(chosen.length ? chosen.map((i) => `• ${i.name} — R$${i.price}`).join('\n') : 'Pick items from the menus below to build a quote.')
        .setFooter({ text: `Total: R$${total}` });
    return embed;
}

module.exports = {
    state,
    buildComponents,
    buildSummaryEmbed,

    data: new SlashCommandBuilder().setName('quote').setDescription('Build a price quote by selecting items.'),

    async execute(interaction) {
        const guildId = interaction.guildId;
        const cfg = config.getConfig(guildId);
        const components = buildComponents(guildId);

        if (!components.length) {
            return interaction.reply({ content: 'No priced items are configured yet.', ephemeral: true });
        }

        const reply = await interaction.reply({ embeds: [buildSummaryEmbed(cfg, guildId, {})], components, ephemeral: true, fetchReply: true });
        state.set(reply.id, {});
    },

    /** Called from the central select-menu handler in events/interactionCreate.js. */
    async handleSelect(interaction) {
        const guildId = interaction.guildId;
        const cfg = config.getConfig(guildId);
        const section = interaction.customId.replace('quote_sel_', '');

        const current = state.get(interaction.message.id) || {};
        current[section] = interaction.values;
        state.set(interaction.message.id, current);

        await interaction.update({ embeds: [buildSummaryEmbed(cfg, guildId, current)] });
    },
};
