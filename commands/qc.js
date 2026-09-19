const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, userMention, ChannelType } = require('discord.js');
const config = require('../utils/config');
const perms = require('../utils/permissions');
const qualityControl = require('../utils/qualityControl');
const { parseColor } = require('../utils/embeds');

function titleFor(record) {
    if (record.status === 'accepted') return '✅ Accepted | Quality Control Submission';
    if (record.status === 'denied') return '❌ Denied | Quality Control Submission';
    return '🔍 Quality Control Submission';
}

function buildEmbed(cfg, record) {
    const embed = new EmbedBuilder()
        .setColor(record.status === 'accepted' ? 0x2ecc71 : record.status === 'denied' ? 0xe74c3c : parseColor(cfg.accentColor))
        .setTitle(titleFor(record))
        .setDescription(
            `${userMention(record.designerId)} has submitted their product for approval. Please assess their product(s) and ensure they meet your quality standards. If you have any questions, you can contact ${userMention(record.designerId)} via the thread below.`
        )
        .addFields(
            { name: 'Designer', value: userMention(record.designerId), inline: true },
            { name: 'Ticket', value: record.channelId ? `<#${record.channelId}>` : 'N/A', inline: true },
        )
        .setFooter({ text: `Powered by ${cfg.brandName}` });
    if (record.notes) embed.addFields({ name: 'Notes', value: record.notes });
    if (record.images?.length) embed.setImage(record.images[0]);
    return embed;
}

function buildButtons(record) {
    if (record.status !== 'pending') return [];
    return [
        new ButtonBuilder().setCustomId(`qc_accept_${record.id}`).setLabel('Accept').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`qc_deny_${record.id}`).setLabel('Deny').setStyle(ButtonStyle.Danger),
    ];
}

module.exports = {
    buildEmbed,
    buildButtons,

    data: new SlashCommandBuilder()
        .setName('qc')
        .setDescription('Submit your work for quality control review.')
        .addSubcommand((sub) =>
            sub
                .setName('submit')
                .setDescription('Submit a product for quality control approval')
                .addAttachmentOption((o) => o.setName('image1').setDescription('Product image 1').setRequired(true))
                .addAttachmentOption((o) => o.setName('image2').setDescription('Product image 2'))
                .addAttachmentOption((o) => o.setName('image3').setDescription('Product image 3'))
                .addAttachmentOption((o) => o.setName('image4').setDescription('Product image 4'))
                .addAttachmentOption((o) => o.setName('image5').setDescription('Product image 5'))
                .addStringOption((o) => o.setName('notes').setDescription('Anything QC should know'))
        ),

    async execute(interaction) {
        const guildId = interaction.guildId;
        const cfg = config.getConfig(guildId);

        const isDesigner = Object.keys(cfg.commissionRates || {}).some((roleId) => interaction.member.roles.cache.has(roleId));
        if (!perms.isStaff(interaction.member, cfg) && !isDesigner) {
            return interaction.reply({ content: 'Only designers or staff can submit to quality control.', ephemeral: true });
        }

        const images = ['image1', 'image2', 'image3', 'image4', 'image5']
            .map((n) => interaction.options.getAttachment(n))
            .filter(Boolean)
            .map((a) => a.url);
        const notes = interaction.options.getString('notes');

        const record = qualityControl.create(guildId, { designerId: interaction.user.id, channelId: interaction.channelId, images, notes });

        const targetChannelId = cfg.qcChannelId || interaction.channelId;
        const channel = await interaction.client.channels.fetch(targetChannelId).catch(() => null);
        if (!channel) {
            return interaction.reply({ content: 'Submitted, but the quality control channel isn\'t reachable. Set `QC_CHANNEL_ID` in `.env`.', ephemeral: true });
        }

        const row = new ActionRowBuilder().addComponents(buildButtons(record));
        const qcMention = cfg.qcRoleIds.length ? cfg.qcRoleIds.map((id) => `<@&${id}>`).join(' ') : '';
        const sent = await channel.send({
            content: `${qcMention} ${userMention(interaction.user.id)}`.trim(),
            embeds: [buildEmbed(cfg, record)],
            components: [row],
            allowedMentions: { roles: cfg.qcRoleIds, users: [interaction.user.id] },
        });

        qualityControl.attachMessage(guildId, record.id, sent.id, sent.channelId);

        if (sent.startThread && channel.type === ChannelType.GuildText) {
            await sent.startThread({ name: `Quality Control | ${interaction.user.username}`, autoArchiveDuration: 1440 }).catch(() => {});
        }

        return interaction.reply({ content: `Submitted to quality control as \`#${record.id}\`.`, ephemeral: true });
    },
};
