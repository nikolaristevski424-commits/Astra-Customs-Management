const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { downloadBuffer } = require('../utils/http');

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

module.exports = {
    data: new SlashCommandBuilder()
        .setName('wanted')
        .setDescription('Make a fun "WANTED" poster.')
        .addUserOption((o) => o.setName('user').setDescription('Who to feature (defaults to you)'))
        .addIntegerOption((o) => o.setName('reward').setDescription('Reward amount to show, e.g. 500').setMinValue(0)),

    async execute(interaction) {
        let sharp;
        try {
            sharp = require('sharp');
        } catch {
            return interaction.reply({ content: 'The `sharp` package is not installed on this bot. Run `npm install` and restart.', ephemeral: true });
        }

        const target = interaction.options.getUser('user') || interaction.user;
        const reward = interaction.options.getInteger('reward');

        await interaction.deferReply();

        try {
            const avatarUrl = target.displayAvatarURL({ extension: 'png', size: 512 });
            const avatarBuffer = await downloadBuffer(avatarUrl);
            const avatarResized = await sharp(avatarBuffer).resize(FRAME.size, FRAME.size).png().toBuffer();

            const poster = await sharp(Buffer.from(buildBaseSvg()))
                .composite([
                    { input: avatarResized, top: FRAME.y, left: FRAME.x },
                    { input: Buffer.from(buildTextSvg({ username: target.username, reward })), top: 0, left: 0 },
                ])
                .png()
                .toBuffer();

            const file = new AttachmentBuilder(poster, { name: 'wanted.png' });
            await interaction.editReply({ files: [file] });
        } catch (err) {
            console.error('[wanted] error:', err);
            await interaction.editReply('Failed to make the poster. Check the bot console for details.');
        }
    },
};
