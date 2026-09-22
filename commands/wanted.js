const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { downloadBuffer } = require('../utils/http');
const { Jimp, loadFont, measureText } = require('jimp');
const path = require('path');

const WIDTH = 700;
const HEIGHT = 900;
const FRAME = { x: 100, y: 190, size: 480 };

function escapeXml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildBaseSvg() {
    return `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${WIDTH}" height="${HEIGHT}" fill="#e8d3a0"/>
        <rect x="20" y="20" width="${WIDTH - 40}" height="${HEIGHT - 40}" fill="none" stroke="#4a3320" stroke-width="8"/>
        <rect x="36" y="36" width="${WIDTH - 72}" height="${HEIGHT - 72}" fill="none" stroke="#4a3320" stroke-width="2"/>
        <rect x="${FRAME.x - 10}" y="${FRAME.y - 10}" width="${FRAME.size + 20}" height="${FRAME.size + 20}" fill="none" stroke="#4a3320" stroke-width="6"/>
        <rect x="${FRAME.x - 4}" y="${FRAME.y - 4}" width="${FRAME.size + 8}" height="${FRAME.size + 8}" fill="none" stroke="#4a3320" stroke-width="2"/>
    </svg>`;
}

function buildTextSvg({ username, reward }) {
    const rewardLine = reward
        ? `<text x="${WIDTH / 2}" y="740" font-family="Georgia, 'Times New Roman', serif" font-size="34" font-weight="bold" fill="#4a3320" text-anchor="middle">REWARD: R$${escapeXml(reward)}</text>`
        : '';
    return `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <text x="${WIDTH / 2}" y="115" font-family="Georgia, 'Times New Roman', serif" font-size="105" font-weight="bold" fill="#4a3320" text-anchor="middle" letter-spacing="8">WANTED</text>
        <text x="${WIDTH / 2}" y="700" font-family="Georgia, 'Times New Roman', serif" font-size="38" font-weight="bold" fill="#4a3320" text-anchor="middle" letter-spacing="4">DEAD OR ALIVE</text>
        ${rewardLine}
        <text x="${WIDTH / 2}" y="800" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="#4a3320" text-anchor="middle">${escapeXml(username)}</text>
    </svg>`;
}

function fontPath(size) {
    return path.join(__dirname, '..', 'node_modules', '@jimp', 'plugin-print', 'dist', 'fonts', 'open-sans', `open-sans-${size}-white`, `open-sans-${size}-white.fnt`);
}

function drawBorder(image, x, y, width, height, thickness, color) {
    for (let line = 0; line < thickness; line += 1) {
        for (let px = x + line; px < x + width - line; px += 1) {
            image.setPixelColor(color, px, y + line);
            image.setPixelColor(color, px, y + height - line - 1);
        }
        for (let py = y + line; py < y + height - line; py += 1) {
            image.setPixelColor(color, x + line, py);
            image.setPixelColor(color, x + width - line - 1, py);
        }
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('wanted')
        .setDescription('Make a fun "WANTED" poster.')
        .addUserOption((o) => o.setName('user').setDescription('Who to feature (defaults to you)'))
        .addIntegerOption((o) => o.setName('reward').setDescription('Reward amount to show, e.g. 500').setMinValue(0)),

    async execute(interaction) {
        const target = interaction.options.getUser('user') || interaction.user;
        const reward = interaction.options.getInteger('reward');

        await interaction.deferReply();

        try {
            const avatarUrl = target.displayAvatarURL({ extension: 'png', size: 512 });
            const avatarBuffer = await downloadBuffer(avatarUrl);
            const poster = new Jimp({ width: WIDTH, height: HEIGHT, color: 0xe8d3a0ff });
            const avatar = await Jimp.read(avatarBuffer);
            avatar.resize({ w: FRAME.size, h: FRAME.size });
            poster.composite(avatar, FRAME.x, FRAME.y);

            const brown = 0x4a3320ff;
            drawBorder(poster, 20, 20, WIDTH - 40, HEIGHT - 40, 8, brown);
            drawBorder(poster, 36, 36, WIDTH - 72, HEIGHT - 72, 2, brown);
            drawBorder(poster, FRAME.x - 10, FRAME.y - 10, FRAME.size + 20, FRAME.size + 20, 6, brown);
            drawBorder(poster, FRAME.x - 4, FRAME.y - 4, FRAME.size + 8, FRAME.size + 8, 2, brown);

            const titleFont = await loadFont(fontPath(64));
            const bodyFont = await loadFont(fontPath(32));
            const smallFont = await loadFont(fontPath(16));
            const printCentered = (font, text, y) => poster.print({ font, x: (WIDTH - measureText(font, text)) / 2, y, text });
            printCentered(titleFont, 'WANTED', 70);
            printCentered(bodyFont, 'DEAD OR ALIVE', 690);
            if (reward) printCentered(bodyFont, `REWARD: R$${reward}`, 735);
            printCentered(smallFont, target.username, 800);

            const posterBuffer = await poster.getBuffer('image/png');

            const file = new AttachmentBuilder(posterBuffer, { name: 'wanted.png' });
            await interaction.editReply({ files: [file] });
        } catch (err) {
            console.error('[wanted] error:', err);
            await interaction.editReply('Failed to make the poster. Check the bot console for details.');
        }
    },
};
