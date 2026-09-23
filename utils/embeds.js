const {
    ContainerBuilder,
    MediaGalleryBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    EmbedBuilder,
} = require('discord.js');
const { banner, FOOTER } = require('./brandAssets');

/** Parse "#2d2d31" (or "2d2d31") into a numeric color, falling back safely. */
function parseColor(hex, fallback = 0x2d2d31) {
    if (!hex) return fallback;
    if (typeof hex === 'number' && Number.isFinite(hex)) return hex;
    const clean = hex.toString().replace('#', '');
    const n = parseInt(clean, 16);
    return Number.isNaN(n) ? fallback : n;
}

/**
 * Build a Components V2 "container" panel: optional banner image, a
 * markdown text block, optional extra text blocks (with separators),
 * and an optional footer image. Returns a ContainerBuilder; the caller
 * still needs to add any buttons/select menus and send it with
 * `flags: MessageFlags.IsComponentsV2`.
 */
function buildPanel(config, { heading, body, extraBlocks = [] } = {}) {
    const container = new ContainerBuilder().setAccentColor(parseColor(config.accentColor));

    if (config.bannerUrl || banner('dashboard')) {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems([{ media: { url: config.bannerUrl || banner('dashboard') } }])
        );
    }

    if (heading || body) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent([heading ? `## ${heading}` : null, body].filter(Boolean).join('\n\n'))
        );
    }

    for (const block of extraBlocks) {
        container.addSeparatorComponents(new SeparatorBuilder());
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(block));
    }

    if (config.footerUrl || FOOTER) {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems([{ media: { url: config.footerUrl || FOOTER } }])
        );
    }

    return container;
}

/** Standard branded embed (for logs, DMs, etc. where Components V2 would be overkill). */
function baseEmbed(config, opts = {}) {
    const embed = new EmbedBuilder().setColor(parseColor(opts.color || config.accentColor));
    if (opts.title) embed.setTitle(opts.title);
    if (opts.description) embed.setDescription(opts.description);
    if (opts.fields) embed.addFields(opts.fields);
    if (opts.image) embed.setImage(opts.image);
    if (config.brandName) embed.setAuthor({ name: config.brandName });
    embed.setFooter({ text: opts.footer || config.brandName || 'Astra Customs' });
    if (opts.thumbnail) embed.setThumbnail(opts.thumbnail);
    if (opts.timestamp) embed.setTimestamp(opts.timestamp);
    return embed;
}

module.exports = { parseColor, buildPanel, baseEmbed };
