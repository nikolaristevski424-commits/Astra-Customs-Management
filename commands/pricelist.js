const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../utils/config');
const pricelistUtil = require('../utils/pricelist');
const perms = require('../utils/permissions');
const { parseColor } = require('../utils/embeds');
const { sendAsPanel } = require('../utils/respond');

function formatItems(items) {
    return items.map((i) => `**${i.name}** — ${formatPrice(i.price)}`).join('\n');
}

function formatPrice(price) {
    return typeof price === 'number' ? `R$${price}` : `R$${price}`;
}

function productFields(products) {
    const groups = new Map();
    for (const item of products) {
        const category = item.category || 'Design Services';
        if (!groups.has(category)) groups.set(category, []);
        groups.get(category).push(item);
    }
    return [...groups].map(([category, items]) => ({ name: category, value: formatItems(items) }));
}

function buildPricelistEmbed(cfg) {
    const pl = pricelistUtil.getPricelist(cfg._guildId);
    const links = [
        cfg.showcasesChannelId ? `[showcases](<#${cfg.showcasesChannelId}>)` : null,
        cfg.orderingChannelId ? `[ordering](<#${cfg.orderingChannelId}>)` : null,
        cfg.rulesChannelId ? `[rules](<#${cfg.rulesChannelId}>)` : null,
    ].filter(Boolean);

    const embed = new EmbedBuilder()
        .setColor(parseColor(cfg.accentColor))
        .setTitle(`${cfg.brandName} — Price List`)
        .setDescription(
            [
                links.length ? `Check out our previous projects in ${links.join(', ')}.` : null,
                cfg.taxNote,
                cfg.bulkDiscountNote,
            ]
                .filter(Boolean)
                .join('\n\n')
        )
        .addFields(
            { name: 'Discord Bot — Command Packs', value: formatItems(pl.commandPacks) },
            { name: 'Discord Bot — Single Commands', value: formatItems(pl.singleCommands) },
            ...productFields(pl.products),
            { name: `${pl.basicPack.name}`, value: `R$${pl.basicPack.price}\n${pl.basicPack.includes.map((i) => `• ${i}`).join('\n')}` },
            { name: 'Basic Pack Addons', value: formatItems(pl.basicPackAddons) },
            { name: `${pl.fullPack.name}`, value: `R$${pl.fullPack.price}\nIncludes: ${pl.fullPack.includes.join(', ')}` },
        );
    if (cfg.bannerUrl) embed.setImage(cfg.bannerUrl);
    return embed;
}

module.exports = {
    buildPricelistEmbed,

    data: new SlashCommandBuilder()
        .setName('pricelist')
        .setDescription('View or edit the price list.')
        .addSubcommand((sub) => sub.setName('view').setDescription('View the price list'))
        .addSubcommand((sub) =>
            sub
                .setName('set')
                .setDescription('Edit a price')
                .addStringOption((o) =>
                    o
                        .setName('section')
                        .setDescription('Which section')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Command Packs', value: 'commandPacks' },
                            { name: 'Single Commands', value: 'singleCommands' },
                            { name: 'Design Services', value: 'products' },
                            { name: 'Basic Pack', value: 'basicPack' },
                            { name: 'Basic Pack Addons', value: 'basicPackAddons' },
                            { name: 'Full Pack', value: 'fullPack' },
                        )
                )
                .addStringOption((o) => o.setName('item').setDescription('Item name (autocomplete)').setRequired(true).setAutocomplete(true))
                .addStringOption((o) => o.setName('price').setDescription('New price in Robux, e.g. 250 or 120-140').setRequired(true).setMaxLength(20))
        ),

    async autocomplete(interaction) {
        const guildId = interaction.guildId;
        const section = interaction.options.getString('section');
        const focused = interaction.options.getFocused().toLowerCase();
        const items = pricelistUtil.flatten(guildId).filter((i) => !section || i.section === section);
        const filtered = items.filter((i) => i.name.toLowerCase().includes(focused)).slice(0, 25);
        await interaction.respond(filtered.map((i) => ({ name: `${i.name} (R$${i.price})`, value: `${i.section}:${i.index}` })));
    },

    async execute(interaction) {
        const guildId = interaction.guildId;
        const cfg = config.getConfig(guildId);
        const sub = interaction.options.getSubcommand();

        if (sub === 'view') {
            return sendAsPanel(interaction, { embeds: [buildPricelistEmbed({ ...cfg, _guildId: guildId })] });
        }

        if (sub === 'set') {
            if (!perms.isManager(interaction.member, cfg)) {
                return interaction.reply({ content: 'You do not have permission to edit prices.', ephemeral: true });
            }
            const itemKey = interaction.options.getString('item', true);
            const rawPrice = interaction.options.getString('price', true).replace(/\s/g, '');
            if (!/^\d+(?:-\d+)?$/.test(rawPrice)) {
                return interaction.reply({ content: 'Price must be a Robux amount like `250` or a range like `120-140`.', ephemeral: true });
            }
            const price = rawPrice.includes('-') ? rawPrice : Number(rawPrice);
            const [section, indexStr] = itemKey.split(':');
            const index = indexStr === 'null' ? null : Number(indexStr);
            pricelistUtil.setPrice(guildId, section, index, price);
            return interaction.reply({ content: `Updated price to R$${price}.`, ephemeral: true });
        }
    },
};
