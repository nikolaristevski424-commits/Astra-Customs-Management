const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
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
 * Build a diagonal, tiled, semi-transparent white text watermark as an SVG
 * the exact size of the target image. sharp can composite SVG directly.
 */
function buildTextWatermarkSvg(width, height, text) {
    const safeText = escapeXml(text);
    const fontSize = Math.max(18, Math.round(Math.min(width, height) / 12));
    const tileW = fontSize * (safeText.length * 0.6 + 4);
    const tileH = fontSize * 4;

    const cols = Math.ceil(width / tileW) + 2;
    const rows = Math.ceil(height / tileH) + 2;

    let tiles = '';
    for (let r = -1; r < rows; r++) {
        for (let c = -1; c < cols; c++) {
            const x = c * tileW;
            const y = r * tileH;
            tiles += `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="${fontSize}" fill="white" fill-opacity="0.35" transform="rotate(-30 ${x} ${y})">${safeText}</text>`;
        }
    }

    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${tiles}</svg>`;
}

module.exports = {
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
            return interaction.reply({ content: 'Only staff can stamp the shop watermark onto an image.', ephemeral: true });
        }

        const attachment = interaction.options.getAttachment('image', true);
        const style = interaction.options.getString('style') || 'text';
        if (!attachment.contentType || !attachment.contentType.startsWith('image/')) {
            return interaction.reply({ content: 'Please provide a valid image.', ephemeral: true });
        }

        let sharp;
        try {
            sharp = require('sharp');
        } catch {
            return interaction.reply({ content: 'The `sharp` package is not installed on this bot. Run `npm install` and restart.', ephemeral: true });
        }

        await interaction.deferReply();

        try {
            const imageBuffer = await downloadBuffer(attachment.url);
            const metadata = await sharp(imageBuffer).metadata();

            let overlay;
            if (style === 'logo') {
                if (!fs.existsSync(LOGO_WATERMARK_PATH)) {
                    return interaction.editReply('No logo watermark is configured. Drop a PNG at `assets/watermark.png`, or just omit `style:` to use the text watermark.');
                }
                overlay = await sharp(fs.readFileSync(LOGO_WATERMARK_PATH))
                    .resize(metadata.width, metadata.height, { fit: 'cover' })
                    .ensureAlpha()
                    .png()
                    .toBuffer();
            } else {
                const text = interaction.options.getString('text') || cfg.watermarkText || cfg.brandName || 'Watermark';
                const svg = buildTextWatermarkSvg(metadata.width, metadata.height, text);
                overlay = Buffer.from(svg);
            }

            const watermarkedBuffer = await sharp(imageBuffer)
                .ensureAlpha()
                .composite([{ input: overlay, blend: 'over' }])
                .png()
                .toBuffer();

            const file = new AttachmentBuilder(watermarkedBuffer, { name: 'watermarked.png' });
            await interaction.editReply({ files: [file] });
        } catch (err) {
            console.error('[watermark] error:', err);
            await interaction.editReply('Failed to apply the watermark. Check the bot console for details.');
        }
    },
};
