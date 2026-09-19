const { SlashCommandBuilder, MessageFlags, ContainerBuilder, MediaGalleryBuilder, TextDisplayBuilder, SeparatorBuilder } = require('discord.js');
const config = require('../utils/config');
const portfolio = require('../utils/portfolio');
const designerProfiles = require('../utils/designerProfiles');
const perms = require('../utils/permissions');
const { parseColor } = require('../utils/embeds');
const { sendAsPanel } = require('../utils/respond');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('portfolio')
        .setDescription('Showcase past work.')
        .addSubcommand((sub) =>
            sub
                .setName('add')
                .setDescription('Add a piece to the portfolio')
                .addAttachmentOption((o) => o.setName('image').setDescription('Image to add').setRequired(true))
                .addStringOption((o) => o.setName('caption').setDescription('Short caption'))
                .addStringOption((o) => o.setName('category').setDescription('Category, e.g. Liveries, Logos, Banners'))
                .addUserOption((o) => o.setName('designer').setDescription('Tag this piece to a designer (shows on their /portfolio profile)'))
        )
        .addSubcommand((sub) =>
            sub.setName('view').setDescription('View the portfolio').addStringOption((o) => o.setName('category').setDescription('Filter by category'))
        )
        .addSubcommand((sub) => sub.setName('remove').setDescription('Remove a piece by its list index').addIntegerOption((o) => o.setName('index').setDescription('Index from /portfolio view').setRequired(true)))
        .addSubcommand((sub) =>
            sub
                .setName('profile')
                .setDescription('Auto-generate a designer\'s portfolio profile')
                .addUserOption((o) => o.setName('designer').setDescription('Designer to showcase').setRequired(true))
                .addStringOption((o) => o.setName('specialties').setDescription('Comma-separated specialties, e.g. "Liveries, Uniforms"').setRequired(true))
        ),

    async execute(interaction) {
        const guildId = interaction.guildId;
        const cfg = config.getConfig(guildId);
        const sub = interaction.options.getSubcommand();

        if (sub === 'add') {
            if (!perms.isStaff(interaction.member, cfg)) {
                return interaction.reply({ content: 'You do not have permission to add to the portfolio.', ephemeral: true });
            }
            const image = interaction.options.getAttachment('image', true);
            if (!image.contentType?.startsWith('image/')) {
                return interaction.reply({ content: 'Please attach a valid image.', ephemeral: true });
            }
            const caption = interaction.options.getString('caption') || '';
            const category = interaction.options.getString('category') || 'General';
            const designer = interaction.options.getUser('designer');
            portfolio.add(guildId, { url: image.url, caption, category, addedBy: interaction.user.id, designerId: designer?.id || null });
            return interaction.reply({ content: `Added to the **${category}** portfolio${designer ? ` for ${designer.tag}` : ''}.`, ephemeral: true, allowedMentions: { users: [] } });
        }

        if (sub === 'remove') {
            if (!perms.isStaff(interaction.member, cfg)) {
                return interaction.reply({ content: 'You do not have permission to edit the portfolio.', ephemeral: true });
            }
            const index = interaction.options.getInteger('index', true);
            const removed = portfolio.removeAt(guildId, index);
            if (!removed) return interaction.reply({ content: `No portfolio item at index ${index}.`, ephemeral: true });
            return interaction.reply({ content: 'Removed.', ephemeral: true });
        }

        if (sub === 'view') {
            const category = interaction.options.getString('category');
            const pieces = portfolio.list(guildId, category);
            if (!pieces.length) {
                return interaction.reply({ content: category ? `No portfolio pieces in **${category}** yet.` : 'The portfolio is empty. Staff can add pieces with `/portfolio add`.', ephemeral: true });
            }

            const container = new ContainerBuilder().setAccentColor(parseColor(cfg.accentColor));
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${cfg.brandName} Portfolio${category ? ` — ${category}` : ''}`));
            container.addSeparatorComponents(new SeparatorBuilder());

            // Discord media galleries allow up to 10 items.
            const shown = pieces.slice(-10).reverse();
            container.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(shown.map((p) => ({ media: { url: p.url }, description: p.caption || undefined })))
            );

            return sendAsPanel(interaction, { flags: MessageFlags.IsComponentsV2, components: [container] });
        }

        if (sub === 'profile') {
            if (!perms.isStaff(interaction.member, cfg)) {
                return interaction.reply({ content: 'You do not have permission to generate designer profiles.', ephemeral: true });
            }
            const designer = interaction.options.getUser('designer', true);
            const specialties = interaction.options.getString('specialties', true);
            designerProfiles.set(guildId, designer.id, specialties);

            const pieces = portfolio.listByDesigner(guildId, designer.id).slice(-10).reverse();

            const container = new ContainerBuilder().setAccentColor(parseColor(cfg.accentColor));
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent([`## Designer Portfolio — ${designer.username}`, `<@${designer.id}>`, '', `**Specialties:** ${specialties}`].join('\n'))
            );
            if (pieces.length) {
                container.addSeparatorComponents(new SeparatorBuilder());
                container.addMediaGalleryComponents(
                    new MediaGalleryBuilder().addItems(pieces.map((p) => ({ media: { url: p.url }, description: p.caption || undefined })))
                );
            }

            return sendAsPanel(interaction, { flags: MessageFlags.IsComponentsV2, components: [container], allowedMentions: { users: [designer.id] } });
        }
    },
};
