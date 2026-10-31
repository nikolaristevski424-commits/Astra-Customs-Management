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
const {COLORS,accent}=require('../utils/visualSystem');
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
    const container = new ContainerBuilder().setAccentColor(accent(cfg));
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

function statusLegend(){
    return [
        '**Status Legend**',
        availability.icons.open+' **Open** — Accepting new orders',
        availability.icons.delayed+' **Delayed** — Orders may take longer',
        availability.icons.closed+' **Closed** — Not accepting new orders',
        availability.icons.premium+' **Premium / Boosters Only** — Restricted availability; ask management'
    ].join('\n');
}
function orderStatusPanel(cfg) {
    const container=baseContainer(cfg,'status');
    const values=Object.keys(catalog.TYPES).map(id=>availability.status(cfg,id));
    const available=values.filter(s=>s==='open').length;
    const lines=['# '+cfg.brandName+' | Service Status',
      '**LIVE AVAILABILITY**   •   '+available+' / '+values.length+' services accepting new commissions',
      '', '**CURRENT SERVICE STATUS**'];
    for (const [id,group] of Object.entries(catalog.TYPES)) {
        const value=availability.status(cfg,id);
        lines.push('**'+group.label+'** '+(availability.icons[value]||'❔')+' '+(availability.labels[value]||value));
    }
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(statusLegend()));
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '*Changes are reflected here automatically when management uses \`/status\`.*'));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
       new ButtonBuilder().setCustomId('order_open').setLabel('Order Now').setStyle(ButtonStyle.Success)
    ));

    return {components:[container]};
}

function ticketsPanel(cfg) {
    const container = baseContainer(cfg, 'tickets');
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
       '# '+cfg.brandName+' | Support Center\n'+
       '**PRIVATE SUPPORT**   ·   Orders  /  Management  /  Reports\n\n'+
       'Need assistance? Choose the correct ticket type and a dedicated team will review your request.'
    ));
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
       '**01  /  CHOOSE A DEPARTMENT**\n'+
       '🎫 **General Support** — Purchases, orders, payments and delivery\n'+
       '🛡️ **Management** — Escalations and private management requests\n'+
       '⚑ **Report a User** — Confidential reports and supporting evidence'
    ));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        '**02  /  OPEN YOUR TICKET**\nChoose an option below to get started.\n'+
        '**3 active tickets maximum**   •   Orders are tracked separately\n'+
        '**Security**  Never share passwords or authentication codes.\n'+
        '**Terms**  https://astra-customs-terms.vercel.app/'
    ));
    container.addActionRowComponents(ticketSelectRow());
    return { components: [container] };
}

function orderPanel(cfg){
    const container=baseContainer(cfg,'order');
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '# '+cfg.brandName+' | Commission Store\n'+
      '**ORDER HERE**  ·  Custom work, professional delivery\n\n'+
      'Choose your service, select a product, and explain your design brief. All requests receive their own tracked order ID.'));
    container.addSeparatorComponents(new SeparatorBuilder());
    const lines=Object.entries(catalog.TYPES).map(([id,group])=>{
      const current=availability.status(cfg,id);
      return '**'+group.label+'** '+(availability.icons[current]||'')+' '+(availability.labels[current]||'Open');
    });
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
       '**01  /  LIVE SERVICE AVAILABILITY**\n'+lines.join('\n')
    ));
    container.addSeparatorComponents(new SeparatorBuilder());
    // Use the original custom status emoji sets, not generic Unicode circles.
    // This legend also refreshes with the Order Here panel when /status changes.
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(statusLegend()));
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '**02  /  BEGIN YOUR COMMISSION**\nChoose a service from the dropdown. Your ticket will be organized automatically.\n'+
      '**Before purchasing**  https://astra-customs-terms.vercel.app/'
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
      ['designer','🎨','Design liveries, uniforms and graphics for customers'],
      ['staff','💬','Help customers with orders, payments and support'],
      ['moderator','🛡️','Moderate Discord fairly and respond to rule violations'],
      ['partnership','🤝','Build partnerships and help Astra Customs grow']
    ];
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '# '+cfg.brandName+' | Team Applications\n'+
      'Join the team behind Astra Customs. Check each position’s status and choose the application that fits your skills.'));
    container.addSeparatorComponents(new SeparatorBuilder());
    for(const [key,emoji,description] of entries){
      const status=getStatus(cfg,key),info=STATUSES[status];
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        emoji+' **'+APPLICATIONS[key].name+'**   '+info.emoji+' **'+info.label+'**\n'+description));
    }
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '**Before applying**\nAnswer honestly and include your experience. Closed positions cannot be submitted. Delayed positions may take longer to review.'));
    // Discord only provides preset button colors. Distinct blue and green
    // actions differentiate positions without using red for positive actions.
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('application_designer_open').setLabel(APPLICATIONS.designer.name)
        .setEmoji('🎨').setStyle(ButtonStyle.Primary).setDisabled(getStatus(cfg,'designer')==='closed'),
      new ButtonBuilder().setCustomId('application_staff_open').setLabel(APPLICATIONS.staff.name)
        .setEmoji('💬').setStyle(ButtonStyle.Success).setDisabled(getStatus(cfg,'staff')==='closed')
    ));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('application_moderator_open').setLabel(APPLICATIONS.moderator.name)
        .setEmoji('🛡️').setStyle(ButtonStyle.Primary).setDisabled(getStatus(cfg,'moderator')==='closed'),
      new ButtonBuilder().setCustomId('application_partnership_open').setLabel(APPLICATIONS.partnership.name)
        .setEmoji('🤝').setStyle(ButtonStyle.Success).setDisabled(getStatus(cfg,'partnership')==='closed')
    ));
    return {components:[container]};
}

function portfolioPanel(cfg, guildId) {
    const pieces = portfolio.list(guildId).slice(-10).reverse();
    const container = baseContainer(cfg, 'portfolio');
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${cfg.brandName} | Featured Work\n**PORTFOLIO**  ·  Custom designs for Roblox and ER:LC communities\n\nA selection of work from our creative team.`));
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        pieces.length ? pieces.map((piece) => `**${piece.caption || 'Featured work'}**\n${piece.url}`).join('\n\n') : 'The portfolio is currently being updated. Check back for new work or browse our design services.'
    ));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('order_open').setLabel('Start an Order').setStyle(ButtonStyle.Success).setEmoji('🛒'),
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
// Old classic Order Here posts cannot become Components V2 in-place.
// Remove just ticket options while preserving their existing order controls.
function withoutTicketControls(components){
    const forbidden=new Set(['astra_ticket_type','help_ticket_open',
        'management_ticket_open','report_ticket_open']);
    return (components||[]).map(row=>{
        const raw=typeof row?.toJSON==='function'?row.toJSON():row;
        if(raw?.type!==1 || !Array.isArray(raw.components))return row;
        const keep=raw.components.filter(c=>!forbidden.has(c.custom_id||c.customId));
        if(!keep.length)return null;
        if(keep.length===raw.components.length)return row;
        return new ActionRowBuilder({type:1,components:keep});
    }).filter(Boolean);
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
       '\n\n**Status Legend**\n'+
       availability.icons.open+' **Open** — Accepting new orders\n'+
       availability.icons.delayed+' **Delayed** — Orders may take longer\n'+
       availability.icons.closed+' **Closed** — Not accepting new orders\n'+
       availability.icons.premium+' **Premium / Boosters Only** — Restricted availability\n\n'+
       '*Prices are confirmed in your order ticket.*\n'+
       '**Terms:** https://astra-customs-terms.vercel.app/');
    const banner=old?.image?.url;
    if(banner)e.setImage(banner);
    return withFooter({embeds:[e],components:withoutTicketControls(message.components),allowedMentions:{parse:[]}},cfg);
}
function legacyStatusPayload(cfg,message){
    const old=message.embeds?.[0];
    const lines=Object.entries(catalog.TYPES).map(([id,group])=>{
        const current=availability.status(cfg,id);
        return '**'+group.label+'** '+(availability.icons[current]||'')+' **'+(availability.labels[current]||current)+'**';
    });
    const embed=new EmbedBuilder().setColor(parseColor(cfg.accentColor)).setTitle(cfg.brandName+' | Order Status')
        .setDescription('**Live availability**\n\n'+lines.join('\n')+
          '\n\n'+statusLegend()+'\n\nAvailability updates when management uses \`/status\`.').setTimestamp();
    const image=old?.image?.url;
    if(image)embed.setImage(image);
    return withFooter({embeds:[embed],components:withoutTicketControls(message.components),allowedMentions:{parse:[]}},cfg);
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
    statusLegend,
    TICKET_CHOICES,
    TICKET_EMOJI,
    withoutTicketControls,
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
