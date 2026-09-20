const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, userMention } = require('discord.js');
const config = require('../utils/config');
const perms = require('../utils/permissions');
const bundles = require('../utils/bundles');
const { createCatalogThread } = require('../utils/catalogThreads');
const { baseEmbed } = require('../utils/embeds');

function buildEmbed(cfg, record) {
    return baseEmbed(cfg, {
        title: 'Astra Customs | Bundle Request',
        bannerKey: 'bundle',
        fields: [
            { name: 'Bundle type', value: record.bundleType },
            { name: 'Designer', value: userMention(record.designerId) },
            { name: 'Total after tax', value: `${record.totalAfterTax}` },
            { name: 'Notes', value: record.notes || 'None' },
            { name: 'Status', value: record.status },
        ],
        footer: `Bundle request #${record.id}`,
    });
}

function buildButtons(record) {
    if (record.status !== 'Pending') return [];
    return [
        new ButtonBuilder().setCustomId(`bundle_approve_${record.id}`).setLabel('Approve').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`bundle_deny_${record.id}`).setLabel('Deny').setStyle(ButtonStyle.Danger),
    ];
}

module.exports = {
    buildEmbed,
    buildButtons,

    data: new SlashCommandBuilder()
        .setName('bundle')
        .setDescription('Request a bundle.')
        .addSubcommand((sub) =>
            sub
                .setName('request')
                .setDescription('Request a bundle for approval')
                .addStringOption((o) => o.setName('bundle_type').setDescription('e.g. "Discord Bot Code"').setRequired(true))
                .addIntegerOption((o) => o.setName('total_after_tax').setDescription('Total after tax, in Robux').setRequired(true).setMinValue(0))
                .addStringOption((o) => o.setName('notes').setDescription('Notes about the bundle').setRequired(true))
        ),

    async execute(interaction) {
        const guildId = interaction.guildId;
        const cfg = config.getConfig(guildId);

        if (!perms.isStaff(interaction.member, cfg)) {
            return interaction.reply({ content: 'You do not have permission to request bundles.', ephemeral: true });
        }

        const bundleType = interaction.options.getString('bundle_type', true);
        const totalAfterTax = interaction.options.getInteger('total_after_tax', true);
        const notes = interaction.options.getString('notes', true);

        const record = bundles.create(guildId, { bundleType, designerId: interaction.user.id, totalAfterTax, notes });

        const targetChannelId = cfg.packageBundleChannelId || cfg.bundleReviewChannelId || interaction.channelId;
        const channel = await interaction.client.channels.fetch(targetChannelId).catch(() => null);
        if (!channel) {
            return interaction.reply({ content: 'Bundle request saved, but the catalog channel is not reachable. Set `PACKAGE_BUNDLE_CHANNEL_ID` in `.env`.', ephemeral: true });
        }

        const row = new ActionRowBuilder().addComponents(buildButtons(record));
        const thread = await createCatalogThread(channel, `Bundle ${record.id} - ${bundleType}`, {
            embeds: [buildEmbed(cfg, record)],
            components: [row],
            allowedMentions: { parse: [] },
        }).catch(() => null);
        if (!thread) return interaction.reply({ content: 'Bundle request saved, but its review thread could not be created. Check the bot has permission to create threads in `PACKAGE_BUNDLE_CHANNEL_ID`.', ephemeral: true });

        return interaction.reply({ content: `Bundle request \`#${record.id}\` submitted in <#${thread.id}> for approval.`, ephemeral: true });
    },
};
