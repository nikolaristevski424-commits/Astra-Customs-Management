const {
    ActionRowBuilder,ButtonBuilder,ButtonStyle,ChannelType,ModalBuilder,
    TextInputBuilder,TextInputStyle,OverwriteType,PermissionsBitField,MessageFlags
} = require('discord.js');
const {withFooter}=require('./footerBranding');
const tickets=require('./tickets');
const {getExecutiveRoleIds,parseIdList}=require('./env');

const CATEGORY_ID='1565467577415639182';
const FOUNDER_ID='1255248600850497568';
const TYPES=Object.freeze({
    management:Object.freeze({
        label:'Management Ticket',prefix:'management',
        transcriptChannelId:'1531632265812119552',roleIds:[],
    }),
    report:Object.freeze({
        label:'Report a User',prefix:'report',
        transcriptChannelId:'1531632326834913322',
        roleIds:['1538963485667500144','1565167658377158777','1565198911662985336'],
    })
});

function routing(type){return TYPES[type]||null;}
function authorizedRoles(guild,cfg,type){
    const data=routing(type);
    if(!data)return [];
    const configured=type==='report' ? data.roleIds :
        [...(cfg.managerRoleIds||[]),...getExecutiveRoleIds(),...parseIdList(process.env.OWNERSHIP_ROLE_IDS)];
    return [...new Set(configured)].filter(id=>guild.roles?.cache?.has(id));
}
function form(type){
    const definition=routing(type);
    if(!definition)throw Error('Unknown ticket type');
    const modal=new ModalBuilder().setCustomId('special_ticket_'+type).setTitle(definition.label);
    if(type==='report'){
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder()
                .setCustomId('reported_user').setLabel('Discord username or user ID')
                .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)),
            new ActionRowBuilder().addComponents(new TextInputBuilder()
                .setCustomId('reason').setLabel('What happened?')
                .setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1500)),
            new ActionRowBuilder().addComponents(new TextInputBuilder()
                .setCustomId('evidence').setLabel('Evidence or message links (optional)')
                .setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000)),
        );
    }else{
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder()
            .setCustomId('reason').setLabel('What do you need management for?')
            .setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1500)));
    }
    return modal;
}
async function open(interaction,type){
    const definition=routing(type);
    if(!definition)return interaction.reply({content:'Unknown ticket type.',flags:MessageFlags.Ephemeral});
    const guild=interaction.guild,guildId=interaction.guildId;
    const existing=tickets.findOpenForUser(guildId,interaction.user.id,type);
    if(existing)return interaction.reply({
        content:'You already have an open '+definition.label.toLowerCase()+': <#'+existing.channelId+'>',
        flags:MessageFlags.Ephemeral
    });
    const parent=await guild.channels.fetch(CATEGORY_ID).catch(()=>null);
    if(!parent || parent.type!==ChannelType.GuildCategory || String(parent.guildId)!==String(guildId))
        return interaction.reply({content:'The private ticket category is not available. Please contact management.',flags:MessageFlags.Ephemeral});

    const reason=interaction.fields.getTextInputValue('reason').trim();
    const reportedUser=type==='report'?interaction.fields.getTextInputValue('reported_user').trim():null;
    const evidence=type==='report'?(interaction.fields.getTextInputValue('evidence')||'').trim():null;
    if(!reason || (type==='report' && !reportedUser))
        return interaction.reply({content:'Please fill in the required ticket fields.',flags:MessageFlags.Ephemeral});

    await interaction.deferReply({flags:MessageFlags.Ephemeral});
    const cfg=require('./config').getConfig(guildId);
    const roles=authorizedRoles(guild,cfg,type);
    // Only the opener, explicitly authorized roles, and founder can view.
    // Never inherit broad support-staff access for sensitive tickets.
    const allow=[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory];
    const overrides=[
        {id:guild.roles.everyone.id,type:OverwriteType.Role,deny:[PermissionsBitField.Flags.ViewChannel]},
        {id:interaction.user.id,type:OverwriteType.Member,allow},
        ...roles.map(id=>({id,type:OverwriteType.Role,allow})),
        ...(interaction.user.id!==FOUNDER_ID?[{id:FOUNDER_ID,type:OverwriteType.Member,allow}]:[])
    ];
    let channel;
    try{
        channel=await guild.channels.create({
            name:(definition.prefix+'-'+interaction.user.username).toLowerCase()
                .replace(/[^a-z0-9-]/g,'-').slice(0,90),
            type:ChannelType.GuildText,parent:CATEGORY_ID,permissionOverwrites:overrides,
            reason:'Astra Customs '+definition.label+' opened by '+interaction.user.id
        });
    }catch(error){
        console.error('[specialTickets] Could not create private '+type+' ticket:',error);
        return interaction.editReply('Could not create the private ticket. Check the bot’s Manage Channels and category permissions.');
    }
    tickets.create(guildId,channel.id,{
        type,userId:interaction.user.id,reason,reportedUser,evidence,
        staffRoleIds:roles,transcriptChannelId:definition.transcriptChannelId,
    });
    const row=new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_claim_'+channel.id).setLabel('Claim').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket_close_'+channel.id).setLabel('Request Close').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ticket_close_instant_'+channel.id).setLabel('Staff: Close').setStyle(ButtonStyle.Danger)
    );
    const fields=[
        {name:'Opened by',value:'<@'+interaction.user.id+'>',inline:true},
        ...(type==='report'?[{name:'Reported user',value:reportedUser.slice(0,100),inline:true}]:[]),
        {name:'Description',value:reason.slice(0,1024)},
        ...(evidence?[{name:'Evidence / message links',value:evidence.slice(0,1024)}]:[]),
        {name:'Status',value:'Open',inline:true}
    ];
    const pingIds=type==='report'?roles:[];
    const text='<@'+interaction.user.id+'> '+(type==='report' ? pingIds.map(id=>'<@&'+id+'>').join(' ') : '');
    try{
        await channel.send(withFooter({
            content:text.trim(),embeds:[{title:'Astra Customs | '+definition.label,
                description:type==='report'?'Report submitted privately. The review team will assess the evidence. Do not contact or harass the reported user.':'Management will review your request here.',
                fields,color:type==='report'?0xe69a38:0x4e8cdb}],
            components:[row],
            allowedMentions:{parse:[],users:[interaction.user.id],roles:pingIds}
        },cfg));
        await channel.send({content:'**Terms of Service:** https://astra-customs-terms.vercel.app/\nPlease do not share passwords, security codes, or private credentials.',allowedMentions:{parse:[]}});
    }catch(error){
        console.error('[specialTickets] Ticket created but introductory message failed '+channel.id,error);
        return interaction.editReply('Your ticket was created: <#'+channel.id+'>, but the bot could not post the introduction. Please notify management.');
    }
    return interaction.editReply('Your private '+definition.label.toLowerCase()+' is ready: <#'+channel.id+'>');
}

module.exports={CATEGORY_ID,FOUNDER_ID,TYPES,routing,authorizedRoles,form,open};
