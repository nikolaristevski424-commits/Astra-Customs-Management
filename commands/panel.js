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
const affiliations = require('./affiliate');
const portfolio = require('../utils/portfolio');
const { parseColor } = require('../utils/embeds');
const { sendAsPanel } = require('../utils/respond');
const { isExecutive } = require('../utils/env');

function addPanelChannel(subcommand) {
    return subcommand.addChannelOption((o) => o.setName('channel').setDescription('Channel to send the panel to').addChannelTypes(ChannelType.GuildText));
}

const PANEL_CHANNELS = Object.freeze({
    'order-status': '1497063428487909548',
    tickets: '1497580809752805456',
    order: '1507174314485612708',
});

function baseContainer(cfg) {
    return new ContainerBuilder().setAccentColor(parseColor(cfg.accentColor));
}

function orderStatusPanel(cfg) {
    const services = Object.keys(cfg.serviceStatus || {}).length ? cfg.serviceStatus : { Liveries: 'open', Clothing: 'open', Graphics: 'open', Photography: 'open', Discord: 'open' };
    const container = baseContainer(cfg);
    const lines = [`## ${cfg.brandName} | Order Status`, '', 'Current availability for each service:', ''];
    for (const [name, status] of Object.entries(services)) {
        const normalized = { available: 'open', limited: 'delayed', unavailable: 'closed' }[status] || status;
        const icons = { open: '<:StatusEMOJIGreen:1545902027299627018><:OpenedEmoji1:1545902291469467668><:OpenedEmoji2:1545902335421841509><:OpenedEmoji3:1545902388961878188>', delayed: '<:StatusEmojiYellow:1545902089186705459>', closed: '<:StatusEmojiRed:1545902134258827294><:ClosedEmoji1:1545902477621072022><:ClosedEmoji2:1545902533703245914><:ClosedEmoji3:1545902589403594903>', premium: '<:boost_1:1492387526613143683>' };
        lines.push(`**${name}:** ${icons[normalized] || '❓'}`);
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
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${cfg.brandName} Assistance\n\nNeed help with an order, payment, delivery, management issue, or member concern? Open a private ticket and explain what you need.`));
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**Before opening a ticket**\n- Explain the issue clearly.\n- Include relevant order or payment information.\n- Never share passwords, Roblox cookies, or private credentials.\n- Keep communication respectful while staff review your request.'));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('help_ticket_open').setLabel('Open Private Ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫')));
    return { components: [container] };
}

function orderPanel(cfg) {
    const container = baseContainer(cfg);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${cfg.brandName} | Order Here\n\nStart a private order request for custom work. Our team will review your details and guide you through the next steps.`));
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**Services**\n🚗 Livery Designs\n👕 Uniform Designs\n🎨 Graphics and ELS\n💬 Discord Designs\n\n**Have ready**\nYour references, deadline, budget, and important specifications.'));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('order_open').setLabel('Start Order Request').setStyle(ButtonStyle.Success).setEmoji('🛒'),
        new ButtonBuilder().setCustomId('help_ticket_open').setLabel('Need Help First').setStyle(ButtonStyle.Secondary).setEmoji('🎫'),
    ));
    return { components: [container] };
}

function applicationsPanel(cfg) {
    const container = baseContainer(cfg);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Employee Applications\n\n*${cfg.brandName} is hiring!* Review the requirements below, then choose the application that fits you best.`));
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**Creative Team**\n> <:OpenedEmoji1:1545902291469467668> Past experience\n> <:OpenedEmoji1:1545902291469467668> 13+\n> <:OpenedEmoji1:1545902291469467668> Active, dedicated, and professional\n\n**Customer Support**\n> <:OpenedEmoji1:1545902291469467668> 13+\n> <:OpenedEmoji1:1545902291469467668> Active and dedicated\n> <:OpenedEmoji1:1545902291469467668> At least 3 tickets per week'));
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('Answer every question honestly and with useful detail. Designers should prepare portfolio links and list their software or specialties. Submitting an application does not guarantee acceptance.'));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('application_staff_open').setLabel('Apply for Staff').setStyle(ButtonStyle.Primary).setEmoji('🧑‍💼'),
        new ButtonBuilder().setCustomId('application_designer_open').setLabel('Apply as Designer').setStyle(ButtonStyle.Success).setEmoji('🎨'),
    ));
    return { components: [container] };
}

function portfolioPanel(cfg, guildId) {
    const pieces = portfolio.list(guildId).slice(-10).reverse();
    const container = baseContainer(cfg);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${cfg.brandName} | Portfolio\n\nA selection of recent work from our creative team.`));
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        pieces.length ? pieces.map((piece) => `**${piece.caption || 'Featured work'}**\n${piece.url}`).join('\n\n') : 'The portfolio is currently being updated. Check back soon or open a ticket to request examples of relevant work.'
    ));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('order_open').setLabel('Start an Order').setStyle(ButtonStyle.Success).setEmoji('🛒'),
        new ButtonBuilder().setCustomId('help_ticket_open').setLabel('Ask About Work').setStyle(ButtonStyle.Secondary).setEmoji('🎫'),
    ));
    return { components: [container] };
}

function affiliationsPanel(cfg, guildId) {
    const entries = affiliations.list(guildId);
    const container = baseContainer(cfg);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${cfg.brandName} | Affiliations\n\nCommunities and partners connected with ${cfg.brandName}.`));
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        entries.length ? entries.map((entry) => `**${entry.name}**\n${entry.invite}`).join('\n\n') : 'There are no active affiliations listed right now.'
    ));
    return { components: [container] };
}

function honeypotPanel(cfg) {
    const container = baseContainer(cfg);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `## ${cfg.brandName} | Protected Channel\n\nThis channel is monitored. Do not send messages here.\n\n**Messages may trigger automatic moderation.**\n\nRecorded softbans: **${cfg.honeypot?.count || 0}**`
    ));
    return { components: [container] };
}

const BUILDERS = {
    'order-status': (cfg) => orderStatusPanel(cfg),
    tickets: (cfg) => ticketsPanel(cfg),
    order: (cfg) => orderPanel(cfg),
    applications: (cfg) => applicationsPanel(cfg),
    portfolio: (cfg, guildId) => portfolioPanel(cfg, guildId),
    affiliations: (cfg, guildId) => affiliationsPanel(cfg, guildId),
    honeypot: (cfg) => honeypotPanel(cfg),
};

module.exports = {
    BUILDERS,
    PANEL_CHANNELS,

    data: new SlashCommandBuilder()
        .setName('panel')
        .setDescription('Send a styled panel to a channel.')
        .addSubcommand((sub) => addPanelChannel(sub.setName('order-status').setDescription('Send the service status panel.')))
        .addSubcommand((sub) => addPanelChannel(sub.setName('tickets').setDescription('Send the support panel.')))
        .addSubcommand((sub) => addPanelChannel(sub.setName('order').setDescription('Send the order panel.')))
        .addSubcommand((sub) => addPanelChannel(sub.setName('applications').setDescription('Send the applications panel.')))
        .addSubcommand((sub) => addPanelChannel(sub.setName('portfolio').setDescription('Send the portfolio panel.')))
        .addSubcommand((sub) => addPanelChannel(sub.setName('affiliations').setDescription('Send the affiliations panel.')))
        .addSubcommand((sub) => addPanelChannel(sub.setName('honeypot').setDescription('Send the protected-channel panel.'))),

    async execute(interaction) {
        const guildId = interaction.guildId;
        const cfg = config.getConfig(guildId);

        if (!isExecutive(interaction.member)) {
            return interaction.reply({ content: 'Only configured executives can send panels.', ephemeral: true });
        }

        const type = interaction.options.getSubcommand();
        const configuredChannel = PANEL_CHANNELS[type] ? await interaction.client.channels.fetch(PANEL_CHANNELS[type]).catch(() => null) : null;
        const targetChannel = interaction.options.getChannel('channel') || configuredChannel || interaction.channel;

        const builder = BUILDERS[type];
        if (!builder) return interaction.reply({ content: 'Unknown panel type.', ephemeral: true });

        const payload = builder(cfg, guildId);
        const sent = await sendAsPanel(interaction, { flags: MessageFlags.IsComponentsV2, ...payload }, targetChannel);

        if (type === 'honeypot' && sent) {
            config.setNested(guildId, 'honeypot', { channelId: sent.channelId, messageId: sent.id });
        }

        return sent;
    },
};
