const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, userMention } = require('discord.js');
const config = require('../utils/config');
const { downloadBuffer } = require('../utils/http');
const perms = require('../utils/permissions');
const releases = require('../utils/releases');
const { baseEmbed } = require('../utils/embeds');
const { watermarkImageBuffer } = require('./watermark');

function buildEmbed(cfg, release) {
    const reached = release.status === 'reached';
    const embed = baseEmbed(cfg, {
        color: reached ? 0x2ecc71 : cfg.accentColor,
        title: release.title,
        description: release.description,
        fields: [
            { name: 'Reaction Goal', value: `🎉 ${release.reactedUserIds.length}/${release.goal}`, inline: true },
            { name: 'Released By', value: userMention(release.releasedBy), inline: true },
            { name: 'File', value: reached ? release.fileName : `🔒 Unlocks at ${release.goal} reactions`, inline: false },
        ],
        footer: `Free Release #${release.id}`,
    });
    if (reached) embed.setAuthor({ name: '🎉 Goal reached!' });
    if (release.previewImageUrl) embed.setImage(release.previewImageUrl);
    if (reached) embed.addFields({ name: 'Download', value: release.fileName });
    return embed;
}

function buildRow(release) {
    const disabled = release.status === 'reached';
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`release_react_${release.id}`)
            .setLabel(disabled ? 'Goal Reached' : `React (${release.reactedUserIds.length}/${release.goal})`)
            .setEmoji('🎉')
            .setStyle(disabled ? ButtonStyle.Secondary : ButtonStyle.Primary)
            .setDisabled(disabled)
    );
}

module.exports = {
    downloadFile: downloadBuffer,
    buildEmbed,
    buildRow,

    data: new SlashCommandBuilder()
        .setName('release')
        .setDescription('Post a free download that unlocks once enough people react.')
        .addStringOption((o) => o.setName('title').setDescription('e.g. "Free Release"').setRequired(true))
        .addStringOption((o) => o.setName('description').setDescription('What it is').setRequired(true))
        .addIntegerOption((o) => o.setName('goal').setDescription('Reactions needed to unlock it').setRequired(true).setMinValue(1))
        .addAttachmentOption((o) => o.setName('file').setDescription('The file to give away').setRequired(true))
        .addAttachmentOption((o) => o.setName('preview_image').setDescription('Optional preview image shown before the goal is reached')),

    async execute(interaction) {
        const guildId = interaction.guildId;
        const cfg = config.getConfig(guildId);

        if (!perms.isStaff(interaction.member, cfg)) {
            return interaction.reply({ content: 'You do not have permission to post a release.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const title = interaction.options.getString('title', true);
        const description = interaction.options.getString('description', true);
        const goal = interaction.options.getInteger('goal', true);
        const file = interaction.options.getAttachment('file', true);
        const previewImage = interaction.options.getAttachment('preview_image');
        const imageSource = previewImage || (file.contentType?.startsWith('image/') ? file : null);
        let previewBuffer = null;
        let previewName = null;

        if (imageSource) {
            try {
                const originalPreview = await module.exports.downloadFile(imageSource.url);
                previewBuffer = await watermarkImageBuffer(originalPreview, `${cfg.brandName || 'Astra Customs'} • PREVIEW`, { opacity: 0.58, spacing: 2.8 });
                previewName = `release-preview-${Date.now()}.png`;
            } catch (error) {
                console.error('[release] Failed to create watermarked preview:', error.message);
            }
        }

        const release = releases.create(guildId, {
            title,
            description,
            goal,
            fileUrl: file.url,
            fileName: file.name,
            previewImageUrl: previewName ? `attachment://${previewName}` : null,
            releasedBy: interaction.user.id,
        });

        const payload = { embeds: [buildEmbed(cfg, release)], components: [buildRow(release)] };
        if (previewBuffer && previewName) payload.files = [new AttachmentBuilder(previewBuffer, { name: previewName })];
        const sent = await interaction.channel.send(payload);
        releases.attachMessage(guildId, release.id, sent.id, sent.channelId);

        return interaction.editReply(`Release \`#${release.id}\` posted — needs ${goal} reactions to unlock.`);
    },
};
