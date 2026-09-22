const { SlashCommandBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../utils/config');
const perms = require('../utils/permissions');
const { downloadBuffer } = require('../utils/http');

const LOGO_WATERMARK_PATH = path.join(__dirname, '..', 'assets', 'watermark.png');

function escapeXml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Build a diagonal, tiled, semi-transparent white text watermark as an SVG.
 * This remains exported for compatibility; runtime image processing uses Jimp.
 */
function buildTextWatermarkSvg(width, height, text, { opacity = 0.35, spacing = 4 } = {}) {
    const safeText = escapeXml(text);
    const fontSize = Math.max(18, Math.round(Math.min(width, height) / 12));
    const tileW = fontSize * (safeText.length * 0.6 + 4);
    const tileH = fontSize * spacing;

    const cols = Math.ceil(width / tileW) + 2;
    const rows = Math.ceil(height / tileH) + 2;

    let tiles = '';
    for (let r = -1; r < rows; r++) {
        for (let c = -1; c < cols; c++) {
            const x = c * tileW;
            const y = r * tileH;
            tiles += `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="${fontSize}" fill="white" fill-opacity="${opacity}" transform="rotate(-30 ${x} ${y})">${safeText}</text>`;
        }
    }

    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${tiles}</svg>`;
}

async function watermarkImageBuffer(imageBuffer, text, options = {}) {
    const { Jimp, loadFont, measureText } = require('jimp');
    const image = await Jimp.read(imageBuffer);
    const fontSize = Math.min(image.width, image.height) >= 900 ? 64 : Math.min(image.width, image.height) >= 450 ? 32 : 16;
    const fontPath = path.join(__dirname, '..', 'node_modules', '@jimp', 'plugin-print', 'dist', 'fonts', 'open-sans', `open-sans-${fontSize}-white`, `open-sans-${fontSize}-white.fnt`);
    const font = await loadFont(fontPath);
    const overlay = new Jimp({ width: image.width, height: image.height, color: 0x00000000 });
    const watermarkWidth = measureText(font, text) + fontSize * 3;
    const rowHeight = fontSize * (options.spacing || 3);

    for (let y = -rowHeight; y < image.height + rowHeight; y += rowHeight) {
        for (let x = -watermarkWidth; x < image.width + watermarkWidth; x += watermarkWidth) {
            overlay.print({ font, x, y, text });
        }
    }

    overlay.opacity(options.opacity ?? 0.58);
    image.composite(overlay, 0, 0);

    if (options.logoBuffer) {
        const logo = await Jimp.read(options.logoBuffer);
        logo.resize({ w: image.width, h: image.height });
        logo.opacity(0.35);
        image.composite(logo, 0, 0);
    }

    return image.getBuffer('image/png');
}

module.exports = {
    buildTextWatermarkSvg,
    watermarkImageBuffer,
    data: new SlashCommandBuilder()
        .setName('watermark')
        .setDescription('Stamp an image with the shop watermark.')
        .addAttachmentOption((o) => o.setName('image').setDescription('The image to watermark').setRequired(true))
        .addStringOption((o) =>
            o
                .setName('style')
                .setDescription('Watermark style (defaults to tiled text)')
                .addChoices({ name: 'Tiled Text (default)', value: 'text' }, { name: 'Logo overlay (assets/watermark.png)', value: 'logo' })
        )
        .addStringOption((o) => o.setName('text').setDescription('Override the watermark text just for this image')),

    async execute(interaction) {
        const cfg = config.getConfig(interaction.guildId);
        if (!perms.isStaff(interaction.member, cfg)) {
            return interaction.reply({ content: 'Only staff can stamp the shop watermark onto an image.', flags: MessageFlags.Ephemeral });
        }

        const attachment = interaction.options.getAttachment('image', true);
        const style = interaction.options.getString('style') || 'text';
        const imageType = attachment.contentType || '';
        if (imageType && !imageType.startsWith('image/')) {
            return interaction.reply({ content: 'Please provide a valid image.', flags: MessageFlags.Ephemeral });
        }

        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        } catch (error) {
            console.error('[watermark] Could not acknowledge interaction:', error.message);
            return;
        }

        try {
            const imageBuffer = await downloadBuffer(attachment.url);
            const text = interaction.options.getString('text') || cfg.watermarkText || cfg.brandName || 'Watermark';
            const options = { opacity: 0.58, spacing: 2.8 };
            if (style === 'logo') {
                if (!fs.existsSync(LOGO_WATERMARK_PATH)) {
                    await interaction.editReply('No logo watermark is configured. Drop a PNG at `assets/watermark.png`, or use the default tiled-text style.').catch(() => {});
                    return;
                }
                options.logoBuffer = fs.readFileSync(LOGO_WATERMARK_PATH);
            }
            const watermarkedBuffer = await watermarkImageBuffer(imageBuffer, text, options);

            const file = new AttachmentBuilder(watermarkedBuffer, { name: 'watermarked.png' });
            await interaction.editReply({ files: [file] }).catch((error) => console.error('[watermark] Could not send result:', error.message));
        } catch (err) {
            console.error('[watermark] error:', err);
            await interaction.editReply('Failed to apply the watermark. Check the bot console for details.').catch(() => {});
        }
    },
};
