const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    MessageFlags,
} = require('discord.js');
const config = require('../utils/config');
const { ICONS: SERVICE_ICONS } = require('./service');
const { parseColor } = require('../utils/embeds');
const { sendAsPanel } = require('../utils/respond');
const { isExecutive } = require('../utils/env');

const DEFAULT_SERVICES = { Liveries: 'open', Clothing: 'open', Graphics: 'open', Photography: 'open', Discord: 'open' };
const PANEL_CHANNELS = Object.freeze({
    guidelines: '1488378243697606713',
    dashboard: '1497063428487909548',
    tickets: '1497580809752805456',
    order: '1507174314485612708',
});

function addPanelChannel(subcommand) {
    return subcommand.addChannelOption((o) => o.setName('channel').setDescription('Channel to send the panel to').addChannelTypes(ChannelType.GuildText));
}

function baseContainer(cfg) {
    return new ContainerBuilder().setAccentColor(parseColor(cfg.accentColor));
}

function orderStatusPanel(cfg) {
    const services = Object.keys(cfg.serviceStatus || {}).length ? cfg.serviceStatus : DEFAULT_SERVICES;
    const container = baseContainer(cfg);
    const lines = [`## ${cfg.brandName} | Order Status`, '', 'Current availability for each service:', ''];
    for (const [name, status] of Object.entries(services)) {
        const normalizedStatus = { available: 'open', limited: 'delayed', unavailable: 'closed' }[status] || status;
        lines.push(`**${name}:** ${SERVICE_ICONS[normalizedStatus] || '❓'}`);
    }
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('Status can change as the queue moves. Open an order or ticket to confirm current availability with staff.'));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('order_open').setLabel('Start an Order').setStyle(ButtonStyle.Success).setEmoji('🛒'),
        new ButtonBuilder().setCustomId('help_ticket_open').setLabel('Ask Support').setStyle(ButtonStyle.Secondary).setEmoji('🎫'),
    ));
    return { components: [container] };
}

function ticketsPanel(cfg) {
    const container = baseContainer(cfg);
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `## ${cfg.brandName} | Support\n\nNeed help with an order, payment, delivery, or something else? Open a private ticket and include the details staff need to help quickly.\n\n**Before opening a ticket**\n- Explain the issue clearly.\n- Include relevant order or payment information.\n- Keep communication respectful while staff review your request.`
        )
    );
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('Tickets are private. Do not post passwords, private Roblox cookies, or other sensitive credentials.'));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('help_ticket_open').setLabel('Open Private Ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫'),
    ));
    return { components: [container] };
}

function orderPanel(cfg) {
    const container = baseContainer(cfg);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🛒 Services\n\nAt ${cfg.brandName}, our team turns ideas into polished, custom work. Choose the service that best matches what you need, then start a private order request.`));
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        '**🚗 Livery Designs**\nStart an order for liveries.\n\n**👕 Uniform Designs**\nStart an order for uniforms and clothing.\n\n**🎨 Graphics & ELS**\nRequest graphics, ELS work, logos, or related assets.\n\n**💬 Discord Designs**\nRequest Discord setup, branding, or custom bot work.\n\n**Before you start**\nHave your references, deadline, budget, and key specifications ready.'
    ));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('order_open').setLabel('Start Order Request').setStyle(ButtonStyle.Success).setEmoji('🛒'),
        new ButtonBuilder().setCustomId('help_ticket_open').setLabel('Need Help First').setStyle(ButtonStyle.Secondary).setEmoji('🎫'),
    ));
    return { components: [container] };
}

function applicationsPanel(cfg) {
    const container = baseContainer(cfg);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `## Employee Applications\n\n*${cfg.brandName} is hiring!* If you want to join a dedicated team, review the requirements below and choose the application that fits you best. We would love to see you help us improve the shop and its systems.`
    ));
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        '**Creative Team Requirements**\n> <:OpenedEmoji1:1545902291469467668> Must have past experience\n> <:OpenedEmoji1:1545902291469467668> Must be 13+\n> <:OpenedEmoji1:1545902291469467668> Must be active\n> <:OpenedEmoji1:1545902291469467668> Must be dedicated\n> <:OpenedEmoji1:1545902291469467668> Must be professional\n\n**Customer Support Requirements**\n> <:OpenedEmoji1:1545902291469467668> Must be dedicated\n> <:OpenedEmoji1:1545902291469467668> Must be 13+\n> <:OpenedEmoji1:1545902291469467668> Must be active\n> <:OpenedEmoji1:1545902291469467668> Must be willing to do at least 3 tickets a week'
    ));
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        '**Before you apply**\nPlease answer every question honestly and with useful detail. Designers should prepare portfolio links and list their software or specialties. Applications are reviewed by the team; submitting does not guarantee acceptance.'
    ));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('application_staff_open').setLabel('Apply for Staff').setStyle(ButtonStyle.Primary).setEmoji('🧑‍💼'),
        new ButtonBuilder().setCustomId('application_designer_open').setLabel('Apply as Designer').setStyle(ButtonStyle.Success).setEmoji('🎨'),
    ));
    return { components: [container] };
}

const BUILDERS = {
    'order-status': (cfg) => orderStatusPanel(cfg),
    tickets: (cfg) => ticketsPanel(cfg),
    order: (cfg) => orderPanel(cfg),
    applications: (cfg) => applicationsPanel(cfg),
};

module.exports = {
    BUILDERS,
    PANEL_CHANNELS,

    data: new SlashCommandBuilder()
        .setName('panel')
        .setDescription('Send a styled panel to a channel.')
        .addSubcommand((sub) => addPanelChannel(sub.setName('order-status').setDescription('Send the service status panel.')))
        .addSubcommand((sub) => addPanelChannel(sub.setName('tickets').setDescription('Send the support ticket panel.')))
        .addSubcommand((sub) => addPanelChannel(sub.setName('order').setDescription('Send the customer order panel.')))
        .addSubcommand((sub) => addPanelChannel(sub.setName('applications').setDescription('Send the staff and designer applications panel.'))),

    async execute(interaction) {
        const guildId = interaction.guildId;
        const cfg = config.getConfig(guildId);

        if (!isExecutive(interaction.member)) {
            return interaction.reply({ content: 'Only configured executives can send panels.', ephemeral: true });
        }

        const type = interaction.options.getSubcommand();
        const configuredChannelId = PANEL_CHANNELS[type];
        const targetChannel = interaction.options.getChannel('channel') || (configuredChannelId ? await interaction.client.channels.fetch(configuredChannelId).catch(() => null) : null) || interaction.channel;

        const builder = BUILDERS[type];
        if (!builder) return interaction.reply({ content: 'Unknown panel type.', ephemeral: true });

        const payload = builder(cfg, guildId);
        const sent = await sendAsPanel(interaction, { flags: MessageFlags.IsComponentsV2, ...payload }, targetChannel);

        if (type === 'honeypot' && sent) {
            config.setNested(guildId, 'honeypot', { channelId: sent.channelId, messageId: sent.id });
        }
    },
};
