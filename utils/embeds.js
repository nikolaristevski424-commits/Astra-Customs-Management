const fs = require('fs');
const path = require('path');
const {
    ContainerBuilder,
    MediaGalleryBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    EmbedBuilder,
} = require('discord.js');
const { banner, FOOTER } = require('./brandAssets');

const BANNERS_DIR = path.join(__dirname, '..', 'assets', 'banners');

/** Parse "#2d2d31" (or "2d2d31") into a numeric color, falling back safely. */
function parseColor(hex, fallback = 0x2d2d31) {
    if (!hex) return fallback;
    if (typeof hex === 'number' && Number.isFinite(hex)) return hex;
    const clean = hex.toString().replace('#', '');
    const n = parseInt(clean, 16);
    return Number.isNaN(n) ? fallback : n;
}

function addPanelBanner(container, config, bannerKey = 'dashboard') {
    const bannerPath = path.join(BANNERS_DIR, `${bannerKey}-banner.png`);
    const dashboardPath = path.join(BANNERS_DIR, 'dashboard-banner.png');
    const bannerUrl = config.bannerUrl || (
        fs.existsSync(bannerPath) ? banner(bannerKey) : fs.existsSync(dashboardPath) ? banner('dashboard') : null
    );

    if (bannerUrl) {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems([{ media: { url: bannerUrl } }])
        );
    }
}

/**
 * Build a Components V2 "container" panel: optional banner image, a
 * markdown text block, optional extra text blocks (with separators),
 * and an optional footer image. Returns a ContainerBuilder; the caller
 * still needs to add any buttons/select menus and send it with
 * `flags: MessageFlags.IsComponentsV2`.
 */
function buildPanel(config, { heading, body, extraBlocks = [], mention, bannerKey = 'dashboard', accentColor = config.accentColor } = {}) {
    const container = new ContainerBuilder().setAccentColor(parseColor(accentColor));
    const footerUrl = config.footerUrl || (fs.existsSync(path.join(BANNERS_DIR, 'footer-banner.png')) ? FOOTER : null);

    addPanelBanner(container, config, bannerKey);

    if (mention || heading || body) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent([mention, heading ? `## ${heading}` : null, body].filter(Boolean).join('\n\n'))
        );
    }

    for (const block of extraBlocks) {
        container.addSeparatorComponents(new SeparatorBuilder());
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(block));
    }

    if (footerUrl) {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems([{ media: { url: footerUrl } }])
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
    else if (config.bannerUrl) embed.setImage(config.bannerUrl);
    else if (opts.bannerKey && fs.existsSync(path.join(BANNERS_DIR, `${opts.bannerKey}-banner.png`))) embed.setImage(banner(opts.bannerKey));
    if (config.brandName) embed.setAuthor({ name: config.brandName });
    embed.setFooter({ text: opts.footer || config.brandName || 'Astra Customs' });
    if (opts.thumbnail) embed.setThumbnail(opts.thumbnail);
    if (opts.timestamp) embed.setTimestamp(opts.timestamp);
    return embed;
}

module.exports = { parseColor, addPanelBanner, buildPanel, baseEmbed };
