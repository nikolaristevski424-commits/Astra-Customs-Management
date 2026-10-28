const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ChannelType,
    MessageFlags,
} = require('discord.js');
const config = require('../utils/config');
const catalog=require('../utils/catalog');
const availability=require('../utils/serviceAvailability');
const affiliations = require('./affiliate');
const portfolio = require('../utils/portfolio');
const { parseColor, addPanelBanner } = require('../utils/embeds');
const { sendAsPanel } = require('../utils/respond');
const {withFooter} = require('../utils/footerBranding');
const { isExecutive } = require('../utils/env');
const { APPLICATIONS, STATUSES, getStatus } = require('../utils/applicationStatus');

function addPanelChannel(subcommand) {
    return subcommand.addChannelOption((o) => o.setName('channel').setDescription('Channel to send the panel to').addChannelTypes(ChannelType.GuildText));
}

const PANEL_CHANNELS = Object.freeze({
    'order-status': '1497063428487909548',
    tickets: '1497580809752805456',
    order: '1507174314485612708',
});

function baseContainer(cfg, bannerKey = null) {
    const container = new ContainerBuilder().setAccentColor(parseColor(cfg.accentColor));
    if (bannerKey) addPanelBanner(container, cfg, bannerKey);
    return container;
}

function orderStatusPanel(cfg) {
    const container=baseContainer(cfg,'status');
    const lines=['## '+cfg.brandName+' | Order Status','','Current availability for all design services',''];
    for (const [id,group] of Object.entries(catalog.TYPES)) {
        const value=availability.status(cfg,id);
        lines.push('**'+group.label+'** '+(availability.icons[value]||'❔')+' '+(availability.labels[value]||value));
    }
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('Live availability: updated when staff change /status or /service. Custom prices are confirmed before payment.'));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
       new ButtonBuilder().setCustomId('order_open').setLabel('Order Now').setStyle(ButtonStyle.Success),
       new ButtonBuilder().setCustomId('help_ticket_open').setLabel('Support').setStyle(ButtonStyle.Secondary)
    ));
    return {components:[container]};
}

function ticketsPanel(cfg) {
    const container = baseContainer(cfg, 'tickets');
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${cfg.brandName} Assistance\n\nNeed help with an order, payment, delivery, management issue, or member concern? Open a private ticket and explain what you need.`));
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**Before opening a ticket**\n- Explain the issue clearly.\n- Include relevant order or payment information.\n- Never share passwords, Roblox cookies, or private credentials.\n- Keep communication respectful while staff review your request.'));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('help_ticket_open').setLabel('Open Private Ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫')));
    return { components: [container] };
}

function orderPanel(cfg){
    const container=baseContainer(cfg,'order');
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## '+cfg.brandName+' | Place an Order\n\nSelect your desired service below. Prices and availability update when our staff change the order status.'));
    container.addSeparatorComponents(new SeparatorBuilder());
    const lines=Object.entries(catalog.TYPES).map(([id,group])=>'**'+group.label+'** — '+(availability.labels[availability.status(cfg,id)]||'Open'));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')+'\n\n**Before you purchase:** https://astra-customs-terms.vercel.app/'));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
        .setCustomId('astra_order_type').setPlaceholder('Select an order type...').addOptions(
            Object.entries(catalog.TYPES).map(([id,group])=>({label:group.label,value:id,description:availability.labels[availability.status(cfg,id)]||'View designs'}))
        )));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('help_ticket_open').setLabel('Contact Support').setStyle(ButtonStyle.Secondary)
    ));
    return {components:[container]};
}

function applicationsPanel(cfg) {
    const container = baseContainer(cfg, 'applications');
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Employee Applications\n\n*${cfg.brandName} is hiring!* Review the requirements below, then choose the application that fits you best.`));
    container.addSeparatorComponents(new SeparatorBuilder());
    const designerStatus = getStatus(cfg, 'designer');
    const staffStatus = getStatus(cfg, 'staff');
    const designerInfo = STATUSES[designerStatus];
    const staffInfo = STATUSES[staffStatus];
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `**${APPLICATIONS.designer.name} — ${designerInfo.emoji} ${designerInfo.label}**\n> ${STATUSES.open.emoji} Past experience\n> ${STATUSES.open.emoji} 13+\n> ${STATUSES.open.emoji} Active, dedicated, and professional\n\n**${APPLICATIONS.staff.name} — ${staffInfo.emoji} ${staffInfo.label}**\n> ${STATUSES.open.emoji} 13+\n> ${STATUSES.open.emoji} Active and dedicated\n> ${STATUSES.open.emoji} At least 3 tickets per week`
    ));
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('Answer every question honestly and with useful detail. Designers should prepare portfolio links and list their software or specialties. Submitting an application does not guarantee acceptance.'));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('application_staff_open').setLabel(APPLICATIONS.staff.buttonLabel).setStyle(ButtonStyle.Primary).setEmoji('🧑‍💼').setDisabled(staffStatus === 'closed'),
        new ButtonBuilder().setCustomId('application_designer_open').setLabel(APPLICATIONS.designer.buttonLabel).setStyle(ButtonStyle.Success).setEmoji('🎨').setDisabled(designerStatus === 'closed'),
    ));
    return { components: [container] };
}

function portfolioPanel(cfg, guildId) {
    const pieces = portfolio.list(guildId).slice(-10).reverse();
    const container = baseContainer(cfg, 'portfolio');
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
    async refreshPanels(client,guildId){
        const cfg=config.getConfig(guildId);
        for(const [type,key] of [['order','orderPanel'],['order-status','orderStatusPanel']]){
            const record=cfg[key];
            if(!record?.channelId||!record?.messageId) continue;
            try{
                const channel=await client.channels.fetch(record.channelId);
                if(!channel?.messages?.fetch)continue;
                const message=await channel.messages.fetch(record.messageId);
                await message.edit(withFooter({flags:MessageFlags.IsComponentsV2,...BUILDERS[type](cfg,guildId)},cfg));
            }catch(error){console.warn('[panel] Refresh failed for '+type+': '+error.message);}
        }
    },

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

        if(type==='order' && sent) config.setNested(guildId,'orderPanel',{channelId:sent.channelId,messageId:sent.id});
        if(type==='order-status' && sent) config.setNested(guildId,'orderStatusPanel',{channelId:sent.channelId,messageId:sent.id});
        if (type === 'honeypot' && sent) {
            config.setNested(guildId, 'honeypot', { channelId: sent.channelId, messageId: sent.id });
        }
        if (type === 'applications' && sent) {
            config.setNested(guildId, 'applicationPanel', { channelId: sent.channelId, messageId: sent.id });
        }

        return sent;
    },
};
