const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MediaGalleryBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    MessageFlags,
} = require('discord.js');
const config = require('../utils/config');
const affiliations = require('./affiliate');
const portfolio = require('../utils/portfolio');
const pricelistCmd = require('./pricelist');
const { ICONS: SERVICE_ICONS } = require('./service');
const { parseColor } = require('../utils/embeds');
const { sendAsPanel } = require('../utils/respond');
const { isExecutive } = require('../utils/env');

const DEFAULT_SERVICES = { Liveries: 'available', Clothing: 'available', Graphics: 'available', Photography: 'available', Discord: 'available' };

function addPanelChannel(subcommand) {
    return subcommand.addChannelOption((o) => o.setName('channel').setDescription('Channel to send the panel to').addChannelTypes(ChannelType.GuildText));
}

function baseContainer(cfg) {
    const container = new ContainerBuilder().setAccentColor(parseColor(cfg.accentColor));
    if (cfg.bannerUrl) container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems([{ media: { url: cfg.bannerUrl } }]));
    return container;
}

function withFooter(container, cfg) {
    if (cfg.footerUrl) container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems([{ media: { url: cfg.footerUrl } }]));
    return container;
}

function dashboardPanel(cfg) {
    const container = baseContainer(cfg);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${cfg.brandName}\n\n${cfg.text.dashboardIntro}`));
    container.addSeparatorComponents(new SeparatorBuilder());

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('dashboard_menu')
                .setPlaceholder('View our Dashboard')
                .addOptions(
                    { label: 'Guidelines', value: 'guidelines', emoji: '📘' },
                    { label: 'Order Status', value: 'order-status', emoji: '🛡️' },
                    { label: 'Price List', value: 'pricelist', emoji: '💰' },
                    { label: 'Portfolio', value: 'portfolio', emoji: '🖼️' },
                    { label: 'Affiliations', value: 'affiliations', emoji: '🤝' },
                )
        )
    );

    withFooter(container, cfg);

    const primaryButtons = [
        new ButtonBuilder().setCustomId('order_open').setLabel('Order Now').setStyle(ButtonStyle.Success).setEmoji('🛒'),
        new ButtonBuilder().setCustomId('help_ticket_open').setLabel('Help').setStyle(ButtonStyle.Danger).setEmoji('🎧'),
        new ButtonBuilder().setCustomId('dashboard_loa').setLabel('Request LOA').setStyle(ButtonStyle.Secondary).setEmoji('🌴'),
    ];
    const applicationButtons = [
        new ButtonBuilder().setCustomId('application_staff_open').setLabel('Staff Application').setStyle(ButtonStyle.Primary).setEmoji('🧑‍💼'),
        new ButtonBuilder().setCustomId('application_designer_open').setLabel('Designer Application').setStyle(ButtonStyle.Primary).setEmoji('🎨'),
    ];
    if (cfg.groupUrl) primaryButtons.push(new ButtonBuilder().setLabel('Group').setStyle(ButtonStyle.Link).setURL(cfg.groupUrl).setEmoji('🔗'));

    return { components: [container, new ActionRowBuilder().addComponents(primaryButtons), new ActionRowBuilder().addComponents(applicationButtons)] };
}

function guidelinesPanel(cfg) {
    const container = baseContainer(cfg);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Discord Guidelines\n\n${cfg.text.guidelines}`));
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('guidelines_view_guidelines').setLabel('Guidelines').setStyle(ButtonStyle.Primary).setEmoji('📘'),
            new ButtonBuilder().setCustomId('guidelines_view_orderRegulations').setLabel('Order Regulations').setStyle(ButtonStyle.Primary).setEmoji('🛡️'),
            new ButtonBuilder().setCustomId('guidelines_view_careers').setLabel('Careers').setStyle(ButtonStyle.Primary).setEmoji('🧑‍💼'),
        )
    );
    withFooter(container, cfg);
    return { components: [container] };
}

function orderStatusPanel(cfg) {
    const services = Object.keys(cfg.serviceStatus || {}).length ? cfg.serviceStatus : DEFAULT_SERVICES;
    const container = baseContainer(cfg);
    const lines = ['## Order Status', '', 'Below is the current availability of all order statuses.', ''];
    for (const [name, status] of Object.entries(services)) {
        lines.push(`**${name}:** ${SERVICE_ICONS[status] || '❓'}`);
    }
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
    withFooter(container, cfg);
    return { components: [container] };
}

function ticketsPanel(cfg) {
    const container = baseContainer(cfg);
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `## ${cfg.brandName} Assistance\n\nHere, you can request support with any questions, issues, or concerns you may have. Please remain **respectful and patient** while communicating with our support team. Disrespectful behavior may result in moderation action. Once your ticket has been submitted, please allow a support agent time to review your request and assist you.`
        )
    );
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('order_open').setLabel('Order Now').setStyle(ButtonStyle.Success).setEmoji('🛒'),
            new ButtonBuilder().setCustomId('help_ticket_open').setLabel('Help').setStyle(ButtonStyle.Danger).setEmoji('🎫'),
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('application_staff_open').setLabel('Staff Application').setStyle(ButtonStyle.Primary).setEmoji('🧑‍💼'),
            new ButtonBuilder().setCustomId('application_designer_open').setLabel('Designer Application').setStyle(ButtonStyle.Primary).setEmoji('🎨'),
        ),
    );
    withFooter(container, cfg);
    return { components: [container] };
}

function affiliationsPanel(cfg, guildId) {
    const container = baseContainer(cfg);
    const all = affiliations.list(guildId);
    const lines = ['## Affiliations', '', cfg.text.affiliationsIntro, ''];
    lines.push(all.length ? all.map((a) => `**${a.name}** — ${a.invite}`).join('\n') : '*No current affiliations.*');
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
    withFooter(container, cfg);
    return { components: [container] };
}

function honeypotPanel(cfg) {
    const container = baseContainer(cfg);
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            [
                '## 🍯 Do Not Type Here',
                '',
                '🚫 **DO NOT TYPE IN THIS CHANNEL.**',
                '',
                `Any message sent here will result in an automatic **softban** — you'll be banned and instantly unbanned, and your last hour of messages will be deleted.`,
                '',
                `Softbanned: ${cfg.honeypot?.count || 0}`,
            ].join('\n')
        )
    );
    withFooter(container, cfg);
    return { components: [container] };
}

function portfolioPanel(cfg, guildId) {
    const pieces = portfolio.list(guildId).slice(-10).reverse();
    const container = baseContainer(cfg);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${cfg.brandName} Portfolio`));
    if (pieces.length) {
        container.addSeparatorComponents(new SeparatorBuilder());
        container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(pieces.map((p) => ({ media: { url: p.url }, description: p.caption || undefined }))));
    } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent('The portfolio is empty. Staff can add pieces with `/portfolio add`.'));
    }
    return { components: [container] };
}

const BUILDERS = {
    dashboard: (cfg, guildId) => dashboardPanel(cfg),
    guidelines: (cfg) => guidelinesPanel(cfg),
    'order-status': (cfg) => orderStatusPanel(cfg),
    tickets: (cfg) => ticketsPanel(cfg),
    affiliations: (cfg, guildId) => affiliationsPanel(cfg, guildId),
    honeypot: (cfg) => honeypotPanel(cfg),
    portfolio: (cfg, guildId) => portfolioPanel(cfg, guildId),
};

module.exports = {
    BUILDERS,

    data: new SlashCommandBuilder()
        .setName('panel')
        .setDescription('Send a styled panel to a channel.')
        .addSubcommand((sub) => addPanelChannel(sub.setName('dashboard').setDescription('Send the main dashboard panel.')))
        .addSubcommand((sub) => addPanelChannel(sub.setName('guidelines').setDescription('Send the guidelines panel.')))
        .addSubcommand((sub) => addPanelChannel(sub.setName('order-status').setDescription('Send the service status panel.')))
        .addSubcommand((sub) => addPanelChannel(sub.setName('tickets').setDescription('Send the ticket and order panel.')))
        .addSubcommand((sub) => addPanelChannel(sub.setName('prices').setDescription('Send the Robux price list.')))
        .addSubcommand((sub) => addPanelChannel(sub.setName('portfolio').setDescription('Send the portfolio panel.')))
        .addSubcommand((sub) => addPanelChannel(sub.setName('affiliations').setDescription('Send the affiliations panel.')))
        .addSubcommand((sub) => addPanelChannel(sub.setName('honeypot').setDescription('Send the honeypot panel.'))),

    async execute(interaction) {
        const guildId = interaction.guildId;
        const cfg = config.getConfig(guildId);

        if (!isExecutive(interaction.member)) {
            return interaction.reply({ content: 'Only configured executives can send panels.', ephemeral: true });
        }

        const type = interaction.options.getSubcommand();
        const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

        if (type === 'prices') {
            return sendAsPanel(interaction, { embeds: [pricelistCmd.buildPricelistEmbed({ ...cfg, _guildId: guildId })] }, targetChannel);
        }

        const builder = BUILDERS[type];
        if (!builder) return interaction.reply({ content: 'Unknown panel type.', ephemeral: true });

        const payload = builder(cfg, guildId);
        const sent = await sendAsPanel(interaction, { flags: MessageFlags.IsComponentsV2, ...payload }, targetChannel);

        if (type === 'honeypot' && sent) {
            config.setNested(guildId, 'honeypot', { channelId: sent.channelId, messageId: sent.id });
        }
    },
};
