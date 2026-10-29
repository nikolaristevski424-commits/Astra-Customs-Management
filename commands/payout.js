const { withFooter } = require('../utils/footerBranding');
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, userMention, ChannelType, MessageFlags } = require('discord.js');
const config = require('../utils/config');
const perms = require('../utils/permissions');
const { isExecutive } = require('../utils/env');
const payoutRequests = require('../utils/payoutRequests');
const { baseEmbed } = require('../utils/embeds');
const { selectCommission, calculatePayout, MAX_TOTAL_PRICE } = require('../utils/payoutMath');

function buildEmbed(cfg, record) {
    const statusColor = record.status === 'Paid'
        ? 0x2ecc71
        : record.status === 'Denied'
            ? 0xe74c3c
            : undefined;
    return baseEmbed(cfg, {
        title: 'Astra Customs | Payout #'+record.id+' — '+(record.status==='Pending'?'Awaiting Review':record.status),
        bannerKey: 'payout',
        color: statusColor,
        fields: [
            { name: 'Requested by', value: userMention(record.requestedBy), inline: true },
            ...(record.totalPrice !== undefined ? [
                { name: 'Total customer price', value: 'R$'+record.totalPrice, inline: true },
                { name: 'Roblox tax (30%)', value: '-R$'+record.robloxTax, inline: true },
                { name: 'After Roblox tax', value: 'R$'+record.afterTax, inline: true },
                { name: 'Designer commission', value: String(record.commissionPercent)+'% of after-tax price'+(record.commissionRoleId?' (role <@&'+record.commissionRoleId+'>)':''), inline: false },
                { name: 'Designer payout', value: '**R$'+record.amount+'**', inline: true },
                { name: 'Payment verification', value: 'Management must verify the Roblox transaction and buyer before approving.', inline: false }
            ] : [{ name: 'Amount (legacy request)', value: 'R$'+record.amount, inline: true }]),
            { name: 'Roblox username', value: String(record.robloxUsername).slice(0,90), inline: true },
            { name: 'Reason', value: String(record.reason).slice(0,1000) },
            ...(record.paymentLink?[{name:'Payment link used',value:record.paymentLink.slice(0,1024)}]:[]),
            ...(record.customerDiscordUsername?[{name:'Customer Discord username',value:record.customerDiscordUsername.slice(0,250)}]:[]),
            { name: 'Decision', value: record.status==='Pending'?'🟠 Pending review':record.status==='Paid'?'🟢 Paid — recorded by management':'🔴 Denied', inline: true },
            ...(record.paidBy ? [{ name: 'Reviewed by', value: userMention(record.paidBy), inline: true }] : []),
            ...(record.deniedBy ? [{ name: 'Denied by', value: userMention(record.deniedBy), inline: true }] : []),
            ...(record.decisionReason ? [{ name: 'Decision reason', value: record.decisionReason }] : []),
        ],
        footer: `Payout request #${record.id}`,
        timestamp: record.createdAt,
    });
}

function buildButtons(record) {
    if (record.status !== 'Pending') return [];
    return [
        new ButtonBuilder().setCustomId(`payout_markpaid_${record.id}`).setLabel('Confirm Manual Payment').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`payout_deny_${record.id}`).setLabel('Deny Request').setEmoji('❌').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`payout_autosend_${record.id}`).setLabel('Send Robux Automatically').setEmoji('💸').setStyle(ButtonStyle.Secondary),
    ];
}

// Forum channels (including media channels) cannot use channel.send().
function channelKind(channel){
    if(!channel)return 'missing';
    if(channel.type===ChannelType.GuildForum||channel.type===ChannelType.GuildMedia)return 'forum';
    if(channel.isTextBased?.() && channel.send && !channel.isDMBased?.())return 'text';
    return 'unsupported';
}
function payoutLink(guildId,channelId,messageId){
    return 'https://discord.com/channels/'+guildId+'/'+channelId+(messageId?'/'+messageId:'');
}
function postPayload(cfg,record){
    const buttons=buildButtons(record);
    return withFooter({
        embeds:[buildEmbed(cfg,record)],
        components:buttons.length?[new ActionRowBuilder().addComponents(buttons)]:[],
        allowedMentions:{parse:[]}
    },cfg);
}
async function postPayout(client,guildId,cfg,record){
    const id=cfg.payoutRequestsChannelId;
    if(!id)throw Error('PAYOUT_REQUESTS_CHANNEL_ID is missing from .env.');
    const channel=await client.channels.fetch(id).catch(error=>{
        throw Error('Cannot fetch payout channel <#'+id+'>: '+error.message);
    });
    if(channel?.guildId && channel.guildId!==guildId)
        throw Error('The payout channel belongs to another Discord server.');
    const kind=channelKind(channel);
    if(kind==='unsupported'||kind==='missing')
        throw Error('Channel <#'+id+'> must be a normal text or Forum channel.');
    const payload=postPayload(cfg,record);
    let messageId,channelId,url;
    if(kind==='forum'){
        if(!channel.threads?.create)
            throw Error('Cannot create forum post in <#'+id+'>. Grant the bot View Channel and Create Posts/Send Messages.');
        const tags=(channel.availableTags||[]).filter(tag=>tag.id);
        // Forums may require one applied tag for new posts.
        const appliedTags=channel.flags?.has?.('RequireTag') && tags.length?[tags[0].id]:[];
        const thread=await channel.threads.create({
            name:('Payout #'+record.id+' | '+record.robloxUsername).slice(0,100),
            message:payload,
            autoArchiveDuration:[60,1440,4320,10080].includes(channel.defaultAutoArchiveDuration)?
                channel.defaultAutoArchiveDuration:1440,
            ...(appliedTags.length?{appliedTags}:{}),
            reason:'Astra Customs payout approval #'+record.id
        });
        channelId=thread.id;
        messageId=thread.id;
        url=payoutLink(guildId,thread.id,thread.id);
    }else{
        const msg=await channel.send(payload);
        channelId=msg.channelId||channel.id;
        messageId=msg.id;
        url=msg.url||payoutLink(guildId,channelId,messageId);
    }
    payoutRequests.updatePublication(guildId,record.id,{
        publicationChannelId:channelId,publicationMessageId:messageId,publicationUrl:url,
        publishedAt:Date.now(),publishError:null
    });
    return {url,channelId,messageId,kind};
}
async function payoutChannelInfo(client,guildId,cfg){
    const id=cfg.payoutRequestsChannelId;
    if(!id)return {kind:'missing',message:'PAYOUT_REQUESTS_CHANNEL_ID is empty.'};
    let channel=null;
    try{channel=await client.channels.fetch(id);}catch(error){
        return {kind:'missing',message:'Cannot fetch <#'+id+'>: '+error.message};
    }
    if(channel?.guildId && channel.guildId!==guildId)
        return {kind:'invalid',message:'Configured channel belongs to another Discord server.'};
    const kind=channelKind(channel);
    const flags=channel?.permissionsFor?.(client.user?.id);
    const permissionNames=['ViewChannel','SendMessages','EmbedLinks',
        ...(kind==='forum'?['SendMessagesInThreads']:[])];
    const missing=flags?permissionNames.filter(p=>!flags.has(p)):[];
    return {kind,message:'<#'+id+'> ('+kind+')',
        missing,
        hint:kind==='forum'?'Payout requests will be created as individual Forum posts.':
            kind==='text'?'Payout requests will appear as standard messages.':
            'Use a normal text or Forum channel.'};
}

module.exports = {
    buildEmbed,
    buildButtons,
    postPayout,
    payoutChannelInfo,
    channelKind,

    data: new SlashCommandBuilder()
        .setName('payout')
        .setDescription('Request a Robux payout from the group.')
        .addSubcommand((sub) =>
            sub
                .setName('request')
                .setDescription('Request to be paid Robux from the group\'s funds')
                .addIntegerOption((o) => o.setName('total_price').setDescription('Total price customer paid in Robux, BEFORE the 30% Roblox tax').setRequired(true).setMinValue(1).setMaxValue(MAX_TOTAL_PRICE))
                .addStringOption((o) => o.setName('robux_username').setDescription('Your Roblox username').setRequired(true).setMaxLength(50))
                .addStringOption((o) => o.setName('reason').setDescription('What this payout is for').setRequired(true).setMaxLength(1000))
                .addStringOption(o=>o.setName('payment_link').setDescription('Payment URL the customer used').setRequired(true).setMaxLength(600))
                .addStringOption(o=>o.setName('customer_discord').setDescription('Discord username of the customer who purchased').setRequired(true).setMaxLength(100))
                .addStringOption((o) => o.setName('roblox_id').setDescription('Your Roblox user ID, if known (speeds up an auto-send attempt)'))
        )
        .addSubcommand(sub=>sub.setName('publish').setDescription('Publish an existing saved payout request (executives only)')
            .addIntegerOption(o=>o.setName('request_id').setDescription('Saved payout request number').setRequired(true).setMinValue(1)))
        .addSubcommand(sub=>sub.setName('diagnose').setDescription('Check payout review channel and missing posts (executives only)'))
        .addSubcommand((sub) =>
            sub
                .setName('list')
                .setDescription('View payout requests')
                .addStringOption((o) =>
                    o.setName('status').setDescription('Filter by status').addChoices({ name: 'Pending', value: 'Pending' }, { name: 'Paid', value: 'Paid' }, { name: 'Denied', value: 'Denied' })
                )
        ),

    async execute(interaction) {
        const guildId = interaction.guildId;
        const cfg = config.getConfig(guildId);
        const sub = interaction.options.getSubcommand();

        if (sub==='diagnose') {
            if(!isExecutive(interaction.member))
                return interaction.reply({content:'Executive access required.',flags:MessageFlags.Ephemeral});
            await interaction.deferReply({flags:MessageFlags.Ephemeral});
            const info=await payoutChannelInfo(interaction.client,guildId,cfg);
            const unpublished=payoutRequests.list(guildId,'Pending').filter(p=>!p.publishedAt);
            return interaction.editReply([
                '**Astra Customs | Payout Delivery Diagnostics**',
                '**Channel:** '+info.message,
                '**Missing permissions:** '+(info.missing?.join(', ')||'Not detected (Discord permissions may still reject posting)'),
                info.hint||'',
                '**Saved pending requests without posts:** '+unpublished.length,
                unpublished.length?'Unpublished IDs: '+unpublished.slice(-10).map(r=>'\`#'+r.id+'\`').join(', '):'',
                'Use \`/payout publish request_id:7\` to publish saved request #7 without submitting a second payout.'
            ].filter(Boolean).join('\n'));
        }
        if(sub==='publish'){
            if(!isExecutive(interaction.member))
                return interaction.reply({content:'Executive access required.',flags:MessageFlags.Ephemeral});
            const record=payoutRequests.find(guildId,interaction.options.getInteger('request_id',true));
            if(!record)return interaction.reply({content:'That payout request was not found.',flags:MessageFlags.Ephemeral});
            if(record.status!=='Pending')return interaction.reply({content:'This payout is already '+record.status+'.',flags:MessageFlags.Ephemeral});
            if(record.publishedAt)
                return interaction.reply({content:'Payout #'+record.id+' is already published: '+(record.publicationUrl||'Check the review channel'),flags:MessageFlags.Ephemeral});
            await interaction.deferReply({flags:MessageFlags.Ephemeral});
            try{
                const result=await postPayout(interaction.client,guildId,cfg,record);
                return interaction.editReply('✅ Existing payout **#'+record.id+'** published successfully: '+result.url);
            }catch(error){
                payoutRequests.updatePublication(guildId,record.id,{publishError:error.message});
                console.error('[payout] Publish existing request #'+record.id+' failed:',error);
                return interaction.editReply('Payout #'+record.id+' remains saved but is not posted: '+error.message.slice(0,350)+'\nRun \`/payout diagnose\` to inspect the channel.');
            }
        }
        if (sub === 'list') {
            if (!isExecutive(interaction.member)) {
                return interaction.reply({ content: 'This command is restricted to the executive team.', ephemeral: true });
            }
            const status = interaction.options.getString('status');
            const all = payoutRequests.list(guildId, status);
            if (!all.length) return interaction.reply({ content: 'No matching payout requests.', ephemeral: true });
            const lines = all.slice(-25).reverse().map((r) => `\`#${r.id}\` <@${r.requestedBy}> — R$${r.amount} — ${r.status}`);
            return interaction.reply({ content: lines.join('\n'), ephemeral: true, allowedMentions: { users: [] } });
        }

        if (sub === 'request') {
            if (!perms.isPayoutRequester(interaction.member, cfg)) {
                return interaction.reply({ content: 'You need the configured payout requester role to submit a payout request.', ephemeral: true });
            }

            const totalPrice = interaction.options.getInteger('total_price', true);
            // Use verified guild membership to derive the rate; no manual rate input.
            const freshMember=await interaction.guild?.members?.fetch(interaction.user.id).catch(()=>null);
            const commission=selectCommission(freshMember||interaction.member,cfg);
            if (!commission)
                return interaction.reply({content:'You do not have a configured designer commission role. Ask management to check COMMISSION_RATES.',flags:MessageFlags.Ephemeral});
            let breakdown;
            try { breakdown=calculatePayout(totalPrice,commission.rate); }
            catch(error) { return interaction.reply({content:error.message,flags:MessageFlags.Ephemeral}); }
            if (breakdown.amount<1)
                return interaction.reply({content:'This sale results in less than 1 Robux after tax and commission. Contact management.',flags:MessageFlags.Ephemeral});
            const amount=breakdown.amount;
            const robuxUsername = interaction.options.getString('robux_username', true);
            const reason = interaction.options.getString('reason', true);
            const paymentLink=interaction.options.getString('payment_link',true).trim();
            const customerDiscordUsername=interaction.options.getString('customer_discord',true).trim();
            let url;
            try{url=new URL(paymentLink)}catch{}
            if(!url || url.protocol!=='https:' || !url.hostname || url.username || url.password)
                return interaction.reply({content:'A valid HTTPS payment URL is required.',flags:MessageFlags.Ephemeral});
            if(!customerDiscordUsername)
                return interaction.reply({content:'Enter the customer\'s Discord username.',flags:MessageFlags.Ephemeral});

            const robloxId = interaction.options.getString('roblox_id') || null;

            await interaction.deferReply({flags:MessageFlags.Ephemeral});
            const record = payoutRequests.create(guildId, {
                requestedBy: interaction.user.id, ...breakdown, commissionRoleId:commission.roleId,
                robloxUsername: robuxUsername, robloxId, reason,
                paymentLink:url.toString(),customerDiscordUsername
            });
            try {
                const post=await postPayout(interaction.client,guildId,cfg,record);
                return interaction.editReply('✅ Payout request **#'+record.id+'** submitted for **R$'+amount+'** ('+commission.rate+
                    '% of R$'+breakdown.afterTax+' after Roblox tax, from a R$'+totalPrice+' customer payment): '+post.url+
                    '\nManagement must verify the actual purchase before approving or paying.');
            }catch(error){
                console.error('[payout] Could not publish payout #'+record.id+':',error);
                payoutRequests.updatePublication(guildId,record.id,{publishError:error.message});
                return interaction.editReply('⚠️ Payout **#'+record.id+'** was saved, but Discord could not post it: '+
                    error.message.slice(0,350)+'\nAn executive can use \`/payout publish request_id:'+record.id+'\` after fixing the channel. Do **not** submit another request.');
            }
        }
    },
};
