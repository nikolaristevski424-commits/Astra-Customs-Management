const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, userMention } = require('discord.js');
const config = require('../utils/config');
const { downloadBuffer } = require('../utils/http');
const perms = require('../utils/permissions');
const releases = require('../utils/releases');
const { parseColor } = require('../utils/embeds');

function buildEmbed(cfg, release) {
    const reached = release.status === 'reached';
    const embed = new EmbedBuilder()
        .setColor(parseColor(cfg.accentColor))
        .setTitle(release.title)
        .setDescription(release.description)
        .addFields(
            { name: 'Reaction Goal', value: `🎉 ${release.reactedUserIds.length}/${release.goal}`, inline: true },
            { name: 'Released By', value: userMention(release.releasedBy), inline: true },
        )
        .setFooter({ text: `Release #${release.id}` });
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

        const title = interaction.options.getString('title', true);
        const description = interaction.options.getString('description', true);
        const goal = interaction.options.getInteger('goal', true);
        const file = interaction.options.getAttachment('file', true);
        const previewImage = interaction.options.getAttachment('preview_image');

        const release = releases.create(guildId, {
            title,
            description,
            goal,
            fileUrl: file.url,
            fileName: file.name,
            previewImageUrl: previewImage?.url || (file.contentType?.startsWith('image/') ? file.url : null),
            releasedBy: interaction.user.id,
        });

        const sent = await interaction.channel.send({ embeds: [buildEmbed(cfg, release)], components: [buildRow(release)] });
        releases.attachMessage(guildId, release.id, sent.id, sent.channelId);

        return interaction.reply({ content: `Release \`#${release.id}\` posted — needs ${goal} reactions to unlock.`, ephemeral: true });
    },
};
