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
    EmbedBuilder,
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
const { isOwner } = require('../utils/ownership');
const perms=require('../utils/permissions');
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

// All ticket entry points use the same three-type menu and server emoji.
// Discord's select option emoji displays before the option label.
const TICKET_EMOJI=Object.freeze({id:'1559204224556863521',name:'ticketsupportroleicon'});
const TICKET_CHOICES=Object.freeze([
    {label:'Support Ticket',value:'support',description:'Orders, payments, delivery or general help'},
    {label:'Management Ticket',value:'management',description:'Contact the Astra Customs management team'},
    {label:'Report a User',value:'report',description:'Privately report a member or incident'}
]);
function ticketSelectRow(){
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('astra_ticket_type')
            .setPlaceholder('Choose a ticket type...')
            .setMinValues(1).setMaxValues(1)
            .addOptions(TICKET_CHOICES.map(choice=>({...choice,emoji:{...TICKET_EMOJI}})))
    );
}

function orderStatusPanel(cfg) {
    const container=baseContainer(cfg,'status');
    const values=Object.keys(catalog.TYPES).map(id=>availability.status(cfg,id));
    const available=values.filter(s=>s==='open').length;
    const lines=['## '+cfg.brandName+' | Order Status',
      '', '**Live design availability** · '+available+' of '+values.length+' services open', ''];
    for (const [id,group] of Object.entries(catalog.TYPES)) {
        const value=availability.status(cfg,id);
        lines.push('**'+group.label+'** '+(availability.icons[value]||'❔')+' '+(availability.labels[value]||value));
    }
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '*Changes are reflected here automatically when management uses \`/status\`.*'));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
       new ButtonBuilder().setCustomId('order_open').setLabel('Order Now').setStyle(ButtonStyle.Success)
    ));
    container.addActionRowComponents(ticketSelectRow());
    return {components:[container]};
}

function ticketsPanel(cfg) {
    const container = baseContainer(cfg, 'tickets');
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${cfg.brandName} Assistance\n\nNeed help with an order, payment, delivery, management issue, or member concern? Open a private ticket and explain what you need.`));
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**Before opening a ticket**\n- Explain the issue clearly.\n- Include relevant order or payment information.\n- Never share passwords, Roblox cookies, or private credentials.\n- Keep communication respectful while staff review your request.'));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        '**Select a ticket type below.** You may have up to **3 open tickets** across these options; orders are counted separately.\n**Terms:** https://astra-customs-terms.vercel.app/'
    ));
    container.addActionRowComponents(ticketSelectRow());
    return { components: [container] };
}

function orderPanel(cfg){
    const container=baseContainer(cfg,'order');
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '## '+cfg.brandName+' | Order Here\n\nChoose a service below to start your commission. Current availability is shown for every category.'));
    container.addSeparatorComponents(new SeparatorBuilder());
    const lines=Object.entries(catalog.TYPES).map(([id,group])=>{
      const current=availability.status(cfg,id);
      return '**'+group.label+'** '+(availability.icons[current]||'')+' '+(availability.labels[current]||'Open');
    });
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
    container.addSeparatorComponents(new SeparatorBuilder());
    // Use the original custom status emoji sets, not generic Unicode circles.
    // This legend also refreshes with the Order Here panel when /status changes.
    const legend=[
        '**Status Legend**',
        availability.icons.open+' **Open** — Accepting new orders',
        availability.icons.delayed+' **Delayed** — Orders may take longer',
        availability.icons.closed+' **Closed** — Not accepting new orders',
        availability.icons.premium+' **Premium / Boosters Only** — Restricted availability; ask management'
    ].join('\n');
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(legend));
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '**Start your order** — Choose a service from the menu below.\n**Before purchasing:** https://astra-customs-terms.vercel.app/'
    ));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
        .setCustomId('astra_order_type').setPlaceholder('Select an order type...').addOptions(
            Object.entries(catalog.TYPES).map(([id,group])=>({label:group.label,value:id,description:availability.labels[availability.status(cfg,id)]||'View designs'}))
        )));
    return {components:[container]};
}

function applicationsPanel(cfg) {
    const container=baseContainer(cfg,'applications');
    const entries=[
      ['designer','🎨','Portfolio and design experience'],
      ['staff','🧑‍💼','Helpful support and customer communication'],
      ['moderator','🛡️','Fair moderation and professional conduct'],
      ['partnership','🤝','Community outreach and genuine partnerships']
    ];
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '## '+cfg.brandName+' | Team Applications\n\nJoin a team that helps Astra Customs grow. Review availability and choose the role that fits you.'));
    container.addSeparatorComponents(new SeparatorBuilder());
    for(const [key,emoji,description] of entries){
      const status=getStatus(cfg,key),info=STATUSES[status];
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        emoji+' **'+APPLICATIONS[key].name+'** — '+info.emoji+' **'+info.label+'**\n'+description));
    }
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '*Closed applications cannot be submitted. Delayed applications are accepted but may take longer to review. Please answer every question honestly.*'));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('application_designer_open').setLabel('Creative Team').setStyle(ButtonStyle.Primary).setDisabled(getStatus(cfg,'designer')==='closed'),
      new ButtonBuilder().setCustomId('application_staff_open').setLabel('Customer Support').setStyle(ButtonStyle.Primary).setDisabled(getStatus(cfg,'staff')==='closed')
    ));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('application_moderator_open').setLabel('Discord Moderator').setStyle(ButtonStyle.Secondary).setDisabled(getStatus(cfg,'moderator')==='closed'),
      new ButtonBuilder().setCustomId('application_partnership_open').setLabel('Partnership Team').setStyle(ButtonStyle.Secondary).setDisabled(getStatus(cfg,'partnership')==='closed')
    ));
    return {components:[container]};
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
    ));
    container.addActionRowComponents(ticketSelectRow());
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

function hasPanelMarker(message,type,clientUserId){
    if(!message || message.author?.id!==clientUserId)return false;
    const body=JSON.stringify(message.components?.map(c=>c.toJSON?.()||c)||[]);
    const legacy=JSON.stringify(message.embeds?.map(e=>e.toJSON?.()||e)||[]);
    const content=String(message.content||'');
    const text=[content,body,legacy].join(' ');
    // Order Here panels have a selectable order-type control; the description
    // itself mentions "order status", so do not mistake it for the status panel.
    const orderMenu=body.includes('astra_order_type')||body.includes('astra_order_item_');
    if(type==='order'){
      if(orderMenu)return true;
      return (/Order Here|Place an Order/i.test(text) &&
        /Select an order type|Choose your service|order_open/i.test(text));
    }
    if(type==='order-status'){
      if(orderMenu || /\b(?:Order Here|Place an Order)\b/i.test(text))return false;
      const names=['Discord','Liveries','Graphics','Uniforms','Bots','Logos','Embeds','Websites','ELS'];
      const matches=names.filter(n=>new RegExp('\\b'+n+'\\b','i').test(text)).length;
      const badge=/OpenedEmoji|ClosedEmoji|DeleyaedEmoji|StatusEMOJI|OPENED|DELAYED|CLOSED|Premium/i.test(text);
      return (/\bOrder Status\b/i.test(text) &&
        /Current availability|Live availability|Order Now|Liveries/i.test(text)) ||
        (matches>=7 && badge);
    }
    return false;
}
function extractMessages(result){
    if(!result)return [];
    if(result.values && typeof result.values==='function')return [...result.values()];
    if(Array.isArray(result))return result;
    if(result.find && typeof result.find==='function'){
      // Supports older lightweight message collections from tests.
      return [result.find(x=>!!x)].filter(Boolean);
    }
    return [];
}
async function discoverPanels(client,guildId,type,cfg){
    const record=cfg[type==='order'?'orderPanel':'orderStatusPanel'];
    const channels=[
      record?.channelId,PANEL_CHANNELS[type],
      type==='order'?cfg.orderingChannelId:null,
      type==='order'?cfg.orderRequestsChannelId:null
    ].filter(Boolean);
    const found=new Map();
    const errors=[];
    for(const id of new Set(channels)){
        let channel;
        try{channel=await client.channels.fetch(id);}
        catch(error){errors.push('Channel '+id+': '+error.message);continue;}
        if(!channel?.messages?.fetch)continue;
        try {
          let before=null;
          // Older status posts may no longer be among the newest 100 messages.
          for(let page=0;page<3;page++){
            const args={limit:100,...(before?{before}:{})};
            const collection=await channel.messages.fetch(args);
            const messages=extractMessages(collection);
            if(!messages.length)break;
            for(const message of messages){
              if(hasPanelMarker(message,type,client.user.id))found.set(message.id,message);
            }
            if(messages.length<100)break;
            before=messages[messages.length-1]?.id;
            if(!before)break;
          }
        }catch(error){errors.push('Channel '+id+': '+error.message);}
    }
    return {messages:[...found.values()].slice(0,8),errors};
}
function legacyOrderPayload(cfg,message){
    // Editing an existing classic embed with Components V2 flags is rejected by
    // Discord. Preserve its working buttons/selects and update the embed text.
    const old=message.embeds?.[0];
    const lines=Object.entries(catalog.TYPES).map(([id,group])=>{
      const state=availability.status(cfg,id);
      return '**'+group.label+'** '+(availability.icons[state]||'')+' '+(availability.labels[state]||state);
    });
    const e=new EmbedBuilder().setColor(parseColor(cfg.accentColor))
      .setTitle(cfg.brandName+' | Order Here')
      .setDescription('**Choose your service below**\n\n'+lines.join('\n')+
       '\n\n*Prices are confirmed in your order ticket.*\n'+
       '**Terms:** https://astra-customs-terms.vercel.app/');
    const banner=old?.image?.url;
    if(banner)e.setImage(banner);
    return withFooter({embeds:[e],components:message.components||[],allowedMentions:{parse:[]}},cfg);
}
function legacyStatusPayload(cfg,message){
    const old=message.embeds?.[0];
    const lines=Object.entries(catalog.TYPES).map(([id,group])=>{
        const current=availability.status(cfg,id);
        return '**'+group.label+'** '+(availability.icons[current]||'')+' **'+(availability.labels[current]||current)+'**';
    });
    const embed=new EmbedBuilder().setColor(parseColor(cfg.accentColor)).setTitle(cfg.brandName+' | Order Status')
        .setDescription('**Live availability**\n\n'+lines.join('\n')+
          '\n\nAvailability updates when management uses \`/status\`.').setTimestamp();
    const image=old?.image?.url;
    if(image)embed.setImage(image);
    return withFooter({embeds:[embed],components:message.components||[],allowedMentions:{parse:[]}},cfg);
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
    ticketSelectRow,
    TICKET_CHOICES,
    TICKET_EMOJI,
    async refreshPanels(client,guildId,{discover=false}={}){
        const cfg=config.getConfig(guildId);
        const results=[];
        for(const [type,key] of [['order','orderPanel'],['order-status','orderStatusPanel']]){
            const record=cfg[key];
            const toEdit=new Map();
            const errors=[];
            if(record?.channelId&&record?.messageId){
                try{
                    const channel=await client.channels.fetch(record.channelId);
                    const saved=await channel?.messages?.fetch(record.messageId);
                    if(saved?.author?.id===client.user.id)
                        toEdit.set(saved.id,saved);
                    else errors.push('Recorded message is missing or belongs to another bot.');
                }catch(error){errors.push('Recorded message: '+error.message);}
            }
            // Always look for the existing public Order Here AND Order Status
            // panel. A stored message ID may point to an older duplicate.
            if(discover){
                const found=await discoverPanels(client,guildId,type,cfg);
                for(const message of found.messages)toEdit.set(message.id,message);
                errors.push(...found.errors);
            }
            if(!toEdit.size){
                results.push({type,updated:false,count:0,
                    error:errors.join(' | ')||'No recognizable bot-authored panel found. Use /panel track-status to connect its message ID.'});
                continue;
            }
            const edited=[];
            let channelId=null;
            for(const message of toEdit.values()){
                try{
                    const isLegacy=!!message.embeds?.length &&
                        !message.flags?.has?.(MessageFlags.IsComponentsV2);
                    const payload=isLegacy
                      ? (type==='order'?legacyOrderPayload(cfg,message):legacyStatusPayload(cfg,message))
                      : withFooter({flags:MessageFlags.IsComponentsV2,...BUILDERS[type](cfg,guildId)},cfg);
                    await message.edit(payload);
                    edited.push(message.id);
                    channelId=message.channelId;
                }catch(error){
                    errors.push('Message '+message.id+': '+error.message);
                    console.warn('[panel] '+type+' update failed for '+message.id+': '+error.message);
                }
            }
            if(edited.length){
                // The latest visible status message becomes the registered target.
                const id=edited[edited.length-1];
                const last=toEdit.get(id);
                if(record?.messageId!==id||record?.channelId!==last.channelId)
                    config.setNested(guildId,key,{channelId:last.channelId,messageId:id});
                channelId=last.channelId;
            }
            results.push({type,updated:edited.length>0,count:edited.length,messageIds:edited,
                channelId,...(errors.length?{error:errors.join(' | ').slice(0,700)}:{})});
        }
        return results;
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
        .addSubcommand((sub) => addPanelChannel(sub.setName('honeypot').setDescription('Send the protected-channel panel.')))
        .addSubcommand(sub=>sub.setName('refresh').setDescription('Repair and refresh published order/status panels.'))
        .addSubcommand(sub=>sub.setName('track-status').setDescription('Register an existing bot-authored status panel by message ID.')
            .addStringOption(o=>o.setName('message_id').setDescription('Existing Discord message ID').setRequired(true))
            .addChannelOption(o=>o.setName('channel').setDescription('Channel containing the status message').addChannelTypes(ChannelType.GuildText)))
        .addSubcommand(sub=>sub.setName('track-order').setDescription('Register an existing bot-authored Order Here message by ID.')
            .addStringOption(o=>o.setName('message_id').setDescription('Existing Discord message ID').setRequired(true))
            .addChannelOption(o=>o.setName('channel').setDescription('Channel containing the Order Here message').addChannelTypes(ChannelType.GuildText))),

    async execute(interaction) {
        const guildId = interaction.guildId;
        const cfg = config.getConfig(guildId);

        if (!isExecutive(interaction.member) && !perms.isManager(interaction.member,cfg) && !isOwner(interaction)) {
            return interaction.reply({ content: 'Only Astra Customs management or ownership can manage panels.', flags:MessageFlags.Ephemeral });
        }

        const type = interaction.options.getSubcommand();
        if(type==='refresh'){
            await interaction.deferReply({flags:MessageFlags.Ephemeral});
            const results=await module.exports.refreshPanels(interaction.client,guildId,{discover:true});
            const detail=results.map(r=>'**'+r.type+'**: '+(r.updated?'✅ Edited '+r.count+' message(s)':'⚠️ No message edited')+
                (r.error?' ('+r.error.slice(0,160)+')':'')).join('\n');
            return interaction.editReply(detail+'\nTo connect existing messages use \`/panel track-status\` and \`/panel track-order\` with the message IDs.');
        }
        if(type==='track-status'||type==='track-order'){
            const targetType=type==='track-order'?'order':'order-status';
            const targetKey=targetType==='order'?'orderPanel':'orderStatusPanel';
            const messageId=interaction.options.getString('message_id',true).trim();
            if(!/^\d{17,22}$/.test(messageId))
                return interaction.reply({content:'Provide a valid Discord message ID.',flags:MessageFlags.Ephemeral});
            await interaction.deferReply({flags:MessageFlags.Ephemeral});
            const channel=interaction.options.getChannel('channel')||
                await interaction.client.channels.fetch(cfg[targetKey]?.channelId||PANEL_CHANNELS[targetType]).catch(()=>null);
            const message=await channel?.messages?.fetch(messageId).catch(()=>null);
            if(!message || !hasPanelMarker(message,targetType,interaction.client.user.id)){
                return interaction.editReply('That is not a recognized '+targetType+' message authored by this bot. For a different bot, you must recreate the panel using /panel '+targetType+'.');
            }
            config.setNested(guildId,targetKey,{channelId:channel.id,messageId:message.id});
            const result=await module.exports.refreshPanels(interaction.client,guildId);
            const refreshed=result.find(x=>x.type===targetType);
            return interaction.editReply(refreshed?.updated?'Existing '+targetType+' panel registered and refreshed: '+message.url:
                'Panel registered, but refresh failed: '+(refreshed?.error||'Unknown error'));
        }
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
