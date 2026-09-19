const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ContainerBuilder,
    TextDisplayBuilder,
    MediaGalleryBuilder,
    SeparatorBuilder,
    MessageFlags,
} = require('discord.js');
const config = require('../utils/config');
const perms = require('../utils/permissions');
const { isExecutive } = require('../utils/env');
const packages = require('../utils/packages');
const { parseColor } = require('../utils/embeds');
const { createCatalogThread } = require('../utils/catalogThreads');

function buildPackageContainer(cfg, pkg) {
    const container = new ContainerBuilder().setAccentColor(parseColor(cfg.accentColor));
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            [
                `## ${pkg.name}`,
                `**Price:** R$${pkg.price}`,
                `**Created by:** <@${pkg.createdBy}>`,
                `**Status:** ${pkg.status}`,
                '',
                pkg.description || 'No description.',
                pkg.files?.length ? `\n**Delivery files:** ${pkg.files.map((file) => `[${file.name}](${file.url})`).join(', ')}` : '\n**Delivery files:** None attached.',
            ].join('\n')
        )
    );
    if (pkg.images?.length) {
        container.addSeparatorComponents(new SeparatorBuilder());
        container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(pkg.images.map((url) => ({ media: { url } }))));
    }
    return container;
}

function buildReviewButtons(pkg) {
    if (pkg.status !== 'pending') return [];
    return [
        new ButtonBuilder().setCustomId(`package_approve_${pkg.id}`).setLabel('Approve').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`package_deny_${pkg.id}`).setLabel('Deny').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`package_editprice_${pkg.id}`).setLabel('Edit Price').setStyle(ButtonStyle.Secondary),
    ];
}

module.exports = {
    buildPackageContainer,
    buildReviewButtons,

    data: new SlashCommandBuilder()
        .setName('package')
        .setDescription('Create, submit, and browse shop packages.')
        .addSubcommand((sub) =>
            sub
                .setName('create')
                .setDescription('Create a new package (saved as a draft until you /package request it)')
                .addStringOption((o) => o.setName('name').setDescription('Package name').setRequired(true))
                .addIntegerOption((o) => o.setName('price').setDescription('Price in Robux').setRequired(true).setMinValue(0))
                .addStringOption((o) => o.setName('description').setDescription('What\'s included').setRequired(true))
                .addAttachmentOption((o) => o.setName('image1').setDescription('Photo 1'))
                .addAttachmentOption((o) => o.setName('image2').setDescription('Photo 2'))
                .addAttachmentOption((o) => o.setName('image3').setDescription('Photo 3'))
                .addAttachmentOption((o) => o.setName('image4').setDescription('Photo 4'))
                .addAttachmentOption((o) => o.setName('image5').setDescription('Photo 5'))
                .addAttachmentOption((o) => o.setName('file1').setDescription('Delivery file 1'))
                .addAttachmentOption((o) => o.setName('file2').setDescription('Delivery file 2'))
                .addAttachmentOption((o) => o.setName('file3').setDescription('Delivery file 3'))
                .addAttachmentOption((o) => o.setName('file4').setDescription('Delivery file 4'))
                .addAttachmentOption((o) => o.setName('file5').setDescription('Delivery file 5'))
        )
        .addSubcommand((sub) =>
            sub
                .setName('request')
                .setDescription('Submit one of your draft packages for approval')
                .addIntegerOption((o) => o.setName('package_id').setDescription('Package ID from /package list').setRequired(true).setAutocomplete(true))
        )
        .addSubcommand((sub) =>
            sub
                .setName('setprice')
                .setDescription('Change the price of any package — executive team only')
                .addIntegerOption((o) => o.setName('package_id').setDescription('Package ID').setRequired(true).setAutocomplete(true))
                .addIntegerOption((o) => o.setName('price').setDescription('New price in Robux').setRequired(true).setMinValue(0))
        )
        .addSubcommand((sub) =>
            sub
                .setName('list')
                .setDescription('Browse packages')
                .addStringOption((o) =>
                    o.setName('status').setDescription('Filter by status').addChoices({ name: 'Draft', value: 'draft' }, { name: 'Pending', value: 'pending' }, { name: 'Approved', value: 'approved' }, { name: 'Denied', value: 'denied' })
                )
        )
        .addSubcommand((sub) => sub.setName('view').setDescription('View one package in full').addIntegerOption((o) => o.setName('package_id').setDescription('Package ID').setRequired(true).setAutocomplete(true)))
        .addSubcommand((sub) => sub.setName('collect').setDescription('Pickup instructions for a purchased package')),

    async autocomplete(interaction) {
        const guildId = interaction.guildId;
        const cfg = config.getConfig(guildId);
        const focused = interaction.options.getFocused().toLowerCase();
        const staffView = perms.isStaff(interaction.member, cfg);
        const all = packages.list(guildId).filter((p) => staffView || p.status === 'approved');
        const filtered = all.filter((p) => p.name.toLowerCase().includes(focused) || `${p.id}`.includes(focused)).slice(0, 25);
        await interaction.respond(filtered.map((p) => ({ name: `#${p.id} ${p.name} (${p.status}, R$${p.price})`, value: p.id })));
    },

    async execute(interaction) {
        const guildId = interaction.guildId;
        const cfg = config.getConfig(guildId);
        const sub = interaction.options.getSubcommand();

        if (sub === 'collect') {
            if (!cfg.packageCollectorId) {
                return interaction.reply({
                    content: 'Package delivery is handled through support right now. Please open a ticket and include your proof of purchase. An administrator can optionally set `PACKAGE_COLLECTOR_ID` to the Discord user who delivers package files.',
                    ephemeral: true,
                });
            }
            const tag = cfg.packageCollectorTag ? `**${cfg.packageCollectorTag}**` : `<@${cfg.packageCollectorId}>`;
            return interaction.reply({
                content: `Your package is delivered by ${tag} (<@${cfg.packageCollectorId}>). DM them with your proof of purchase and the package you bought. If they do not respond, open a support ticket.`,
                allowedMentions: { users: [] },
            });
        }

        if (sub === 'create') {
            if (!perms.isStaff(interaction.member, cfg)) {
                return interaction.reply({ content: 'You do not have permission to create packages.', ephemeral: true });
            }
            const name = interaction.options.getString('name', true);
            const price = interaction.options.getInteger('price', true);
            const description = interaction.options.getString('description', true);
            const images = ['image1', 'image2', 'image3', 'image4', 'image5']
                .map((n) => interaction.options.getAttachment(n))
                .filter(Boolean)
                .map((a) => a.url);
            const files = ['file1', 'file2', 'file3', 'file4', 'file5']
                .map((name) => interaction.options.getAttachment(name))
                .filter(Boolean)
                .map((file) => ({ name: file.name, url: file.url }));

            const pkg = packages.create(guildId, { name, price, description, images, files, createdBy: interaction.user.id });
            return interaction.reply({
                content: `Package \`#${pkg.id}\` **${name}** saved as a draft. Run \`/package request package_id:${pkg.id}\` to submit it for approval.`,
                ephemeral: true,
            });
        }

        if (sub === 'request') {
            const id = interaction.options.getInteger('package_id', true);
            const pkg = packages.find(guildId, id);
            if (!pkg) return interaction.reply({ content: `No package found with ID \`#${id}\`.`, ephemeral: true });
            if (pkg.createdBy !== interaction.user.id && !perms.isManager(interaction.member, cfg)) {
                return interaction.reply({ content: 'You can only submit your own packages.', ephemeral: true });
            }
            if (pkg.status !== 'draft' && pkg.status !== 'denied') {
                return interaction.reply({ content: `Package \`#${id}\` is already **${pkg.status}**.`, ephemeral: true });
            }

            const updated = packages.updateStatus(guildId, id, 'pending');

            const targetChannelId = cfg.packageBundleChannelId || cfg.packageReviewChannelId || interaction.channelId;
            const channel = await interaction.client.channels.fetch(targetChannelId).catch(() => null);
            if (!channel) {
                return interaction.reply({ content: 'Submitted, but the catalog channel is not reachable. Set `PACKAGE_BUNDLE_CHANNEL_ID` in `.env`.', ephemeral: true });
            }

            const container = buildPackageContainer(cfg, updated);
            const row = new ActionRowBuilder().addComponents(buildReviewButtons(updated));
            const thread = await createCatalogThread(channel, `Package ${updated.id} - ${updated.name}`, {
                flags: MessageFlags.IsComponentsV2,
                components: [container, row],
            }).catch(() => null);
            if (!thread) return interaction.reply({ content: 'Submitted, but its review thread could not be created. Check the bot has permission to create threads in `PACKAGE_BUNDLE_CHANNEL_ID`.', ephemeral: true });

            return interaction.reply({ content: `Package \`#${id}\` submitted in <#${thread.id}> for approval.`, ephemeral: true });
        }

        if (sub === 'setprice') {
            if (!isExecutive(interaction.member)) {
                return interaction.reply({ content: 'Changing a package price is restricted to the executive team (configured in `.env`).', ephemeral: true });
            }
            const id = interaction.options.getInteger('package_id', true);
            const price = interaction.options.getInteger('price', true);
            const updated = packages.setPrice(guildId, id, price, interaction.user.id);
            if (!updated) return interaction.reply({ content: `No package found with ID \`#${id}\`.`, ephemeral: true });
            return interaction.reply({ content: `Package \`#${id}\` **${updated.name}** price set to R$${price}.`, ephemeral: true });
        }

        if (sub === 'list') {
            const staffView = perms.isStaff(interaction.member, cfg);
            const status = staffView ? interaction.options.getString('status') : 'approved';
            const all = packages.list(guildId, status);
            if (!all.length) return interaction.reply({ content: 'No packages found.', ephemeral: true });
            const lines = all.map((p) => `\`#${p.id}\` **${p.name}** — R$${p.price} — ${p.status}`);
            return interaction.reply({ content: lines.join('\n'), ephemeral: true });
        }

        if (sub === 'view') {
            const id = interaction.options.getInteger('package_id', true);
            const pkg = packages.find(guildId, id);
            if (!pkg) return interaction.reply({ content: `No package found with ID \`#${id}\`.`, ephemeral: true });
            if (pkg.status !== 'approved' && !perms.isStaff(interaction.member, cfg)) {
                return interaction.reply({ content: 'This package isn\'t public yet.', ephemeral: true });
            }
            const container = buildPackageContainer(cfg, pkg);
            return interaction.reply({ flags: MessageFlags.IsComponentsV2, components: [container], ephemeral: true });
        }
    },
};
