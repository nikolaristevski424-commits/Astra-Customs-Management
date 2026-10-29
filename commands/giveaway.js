const { withFooter } = require('../utils/footerBranding');
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, userMention, ChannelType, MessageFlags } = require('discord.js');
const config = require('../utils/config');
const perms = require('../utils/permissions');
const giveaways = require('../utils/giveaways');
const { baseEmbed } = require('../utils/embeds');

const PING_CHOICES = [
    { name: 'No ping', value: 'none' },
    { name: 'A specific role', value: 'role' },
    { name: '@here', value: 'here' },
    { name: '@everyone', value: 'everyone' },
];

function buildEmbed(cfg, giveaway) {
    const ended = giveaway.status === 'ended';
    const odds = giveaways.oddsPercent(giveaway.entrantIds.length,giveaway.winnerCount);
    const embed = baseEmbed(cfg, {
        title: ended ? 'Giveaway Ended' : giveaway.sponsor ? `Giveaway | Sponsored by ${giveaway.sponsor}` : 'Giveaway',
        bannerKey: 'giveaway',
        description: [
            `**Prize:** ${giveaway.prize}`,
            '',
            `**Odds of winning:** ${odds===null?'Calculated after the first entry':odds.toFixed(2)+'%'}`,
            '_Odds reflect the current entrants and can change until the giveaway ends._',
            ...(giveaway.sponsor || giveaway.sponsorInvite ? [
                '',
                '_If this giveaway is sponsored by another server, claim your prize by opening a ticket in the sponsoring server — not Astra Customs._',
            ] : []),
        ].join('\n'),
        fields: [
            { name: 'Winners', value: `${giveaway.winnerCount}`, inline: true },
            { name: 'Entrants', value: `${giveaway.entrantIds.length}`, inline: true },
            { name: 'Hosted by', value: userMention(giveaway.hostedBy), inline: true },
        ],
        footer: `Giveaway #${giveaway.id}`,
    });

    if (giveaway.sponsor || giveaway.sponsorInvite) {
        const sponsorName=giveaway.sponsor||'Sponsoring server';
        embed.addFields({ name: 'Sponsored by', value: giveaway.sponsorInvite ? `[${sponsorName}](${giveaway.sponsorInvite})` : sponsorName, inline: true });
    }

    if (ended) {
        embed.addFields({
            name: 'Winner(s)',
            value: giveaway.winnerIds.length ? giveaway.winnerIds.map((id) => userMention(id)).join(', ') : 'No one entered.',
        });
    } else {
        embed.addFields({ name: 'Ends', value: `<t:${Math.floor(giveaway.endsAt / 1000)}:R>` });
    }
    return embed;
}

function buildRow(giveaway) {
    const ended = giveaway.status === 'ended';
    const buttons = [
        new ButtonBuilder()
            .setCustomId(`giveaway_enter_${giveaway.id}`)
            .setLabel(ended ? 'Giveaway Ended' : `Enter (${giveaway.entrantIds.length})`)
            .setEmoji('🎉')
            .setStyle(ended ? ButtonStyle.Secondary : ButtonStyle.Success)
            .setDisabled(ended),
    ];
    if (!ended) {
        buttons.push(new ButtonBuilder().setCustomId(`giveaway_leave_${giveaway.id}`)
            .setLabel('Leave Giveaway').setEmoji('🚪').setStyle(ButtonStyle.Secondary));
    }
    if (giveaway.sponsorInvite) {
        buttons.push(new ButtonBuilder().setLabel(`Join ${giveaway.sponsor || 'Sponsor'}`.slice(0,80))
            .setStyle(ButtonStyle.Link).setURL(giveaway.sponsorInvite).setEmoji('🔗'));
    }
    return new ActionRowBuilder().addComponents(buttons);
}

/** Builds the message content (ping text) + allowedMentions for a giveaway announcement. */
function winnerAnnouncement(giveaway,winners,{reroll=false}={}) {
    const mentions = winners.map(id=>userMention(id)).join(', ');
    const intro = reroll ? '🎉 **Giveaway Reroll** — ' : '🎉 **Giveaway Winners!** — ';
    const sponsorText = (giveaway.sponsor || giveaway.sponsorInvite)
        ? '\n\n**Sponsored giveaway:** Your prize is provided by **'+(giveaway.sponsor||'the sponsoring server')+'**. '+
          (giveaway.sponsorInvite?'Join the sponsor server: '+giveaway.sponsorInvite+'\n':'')+
          '**Open a ticket in the sponsoring server to claim your prize. Do not open a claim ticket in Astra Customs.**'
        : '\nOpen an Astra Customs support ticket to claim your prize.';
    return intro+mentions+' won **'+giveaway.prize+'**!'+sponsorText;
}

function buildPing(giveaway) {
    if (giveaway.pingType === 'everyone') return { content: '@everyone', allowedMentions: { parse: ['everyone'] } };
    if (giveaway.pingType === 'here') return { content: '@here', allowedMentions: { parse: ['everyone'] } };
    if (giveaway.pingType === 'role' && giveaway.pingRoleId) return { content: `<@&${giveaway.pingRoleId}>`, allowedMentions: { roles: [giveaway.pingRoleId] } };
    return { content: undefined, allowedMentions: { parse: [] } };
}

module.exports = {
    buildEmbed,
    buildRow,
    buildPing,
    winnerAnnouncement,

    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Run a giveaway.')
        .addSubcommand((sub) =>
            sub
                .setName('start')
                .setDescription('Start a giveaway')
                .addStringOption((o) => o.setName('prize').setDescription('What you are giving away').setRequired(true))
                .addStringOption((o) => o.setName('duration').setDescription('How long, e.g. 30m, 2h, 1d').setRequired(true))
                .addIntegerOption((o) => o.setName('winners').setDescription('Number of winners').setMinValue(1))
                .addStringOption((o) => o.setName('sponsor').setDescription('Sponsor name, for a sponsored giveaway'))
                .addStringOption((o) => o.setName('sponsor_invite').setDescription("Join link for the sponsor's server"))
                .addStringOption((o) => o.setName('ping').setDescription('Who to notify (default: no ping)').addChoices(...PING_CHOICES))
                .addRoleOption((o) => o.setName('ping_role').setDescription('Role to ping — only used when ping is set to "A specific role"'))
                .addChannelOption(o=>o.setName('channel').setDescription('Optional channel to post the giveaway').addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement))
                .addChannelOption(o=>o.setName('channel').setDescription('Optional destination channel; defaults to the configured giveaway channel')
                    .addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement))
        )
        .addSubcommand((sub) =>
            sub.setName('reroll').setDescription('Pick new winner(s) for an ended giveaway').addIntegerOption((o) => o.setName('giveaway_id').setDescription('Giveaway ID').setRequired(true))
        ),

    async execute(interaction) {
        const guildId = interaction.guildId;
        const cfg = config.getConfig(guildId);
        const sub = interaction.options.getSubcommand();

        if (sub === 'start') {
            if (!perms.isStaff(interaction.member, cfg)) {
                return interaction.reply({ content: 'You do not have permission to start giveaways.', ephemeral: true });
            }

            const prize = interaction.options.getString('prize', true);
            const durationInput = interaction.options.getString('duration', true);
            const winnerCount = interaction.options.getInteger('winners') || 1;
            const sponsor = interaction.options.getString('sponsor');
            const sponsorInvite = interaction.options.getString('sponsor_invite');
            const pingType = interaction.options.getString('ping') || 'none';
            const pingRole = interaction.options.getRole('ping_role');

            const durationMs = giveaways.parseDuration(durationInput);
            if (!durationMs || durationMs <= 0) {
                return interaction.reply({ content: 'Please give a valid duration like `30m`, `2h`, or `1d`.', ephemeral: true });
            }

            if ((pingType === 'everyone' || pingType === 'here') && !perms.isManager(interaction.member, cfg)) {
                return interaction.reply({ content: 'Pinging @everyone or @here for a giveaway requires a manager role.', ephemeral: true });
            }
            if (pingType === 'role' && !pingRole) {
                return interaction.reply({ content: 'Pick a `ping_role` when `ping` is set to "A specific role".', ephemeral: true });
            }
            if(sponsor && !sponsorInvite){
                return interaction.reply({content:'Sponsored giveaways need a valid \`sponsor_invite\` so winners know which server to open their claim ticket in.',flags:64});
            }
            if(sponsorInvite && !sponsor){
                return interaction.reply({content:'Please set \`sponsor\` to the sponsoring server name when adding a sponsor invite.',flags:64});
            }
            if (sponsorInvite && !/^https?:\/\/(www\.)?(discord\.gg|discord\.com\/invite)\//i.test(sponsorInvite)) {
                return interaction.reply({ content: 'Please provide a valid Discord invite link for `sponsor_invite` (e.g. https://discord.gg/...).', ephemeral: true });
            }

            const target=interaction.options.getChannel('channel');
            const targetChannelId=target?.id||cfg.giveawayChannelId||interaction.channelId;
            const channel=target||await interaction.client.channels.fetch(targetChannelId).catch(()=>null);
            if(!channel?.send || (channel.guildId && channel.guildId!==guildId))
                return interaction.reply({content:'Please choose a valid text channel for the giveaway.',flags:MessageFlags.Ephemeral});
            await interaction.deferReply({flags:MessageFlags.Ephemeral});
            const giveaway=giveaways.create(guildId,{
                prize,winnerCount,hostedBy:interaction.user.id,
                endsAt:Date.now()+durationMs,sponsor:sponsor||null,
                sponsorInvite:sponsorInvite||null,pingType,pingRoleId:pingRole?.id||null
            });
            try{
                const ping=buildPing(giveaway);
                const sent=await channel.send(withFooter({
                    content:ping.content,embeds:[buildEmbed(cfg,giveaway)],
                    components:[buildRow(giveaway)],allowedMentions:ping.allowedMentions
                },cfg));
                giveaways.attachMessage(guildId,giveaway.id,sent.id,sent.channelId);
                return interaction.editReply('✅ Giveaway **#'+giveaway.id+'** posted in <#'+sent.channelId+'>: '+sent.url);
            }catch(error){
                giveaways.setWinners(guildId,giveaway.id,[]);
                console.error('[giveaway] Posting failed:',error);
                return interaction.editReply('Giveaway could not be posted to <#'+targetChannelId+'>: '+error.message.slice(0,200));
            }

        }

        if (sub === 'reroll') {
            if (!perms.isStaff(interaction.member, cfg)) {
                return interaction.reply({ content: 'You do not have permission to reroll giveaways.', ephemeral: true });
            }
            const id = interaction.options.getInteger('giveaway_id', true);
            const giveaway = giveaways.find(guildId, id);
            if (!giveaway) return interaction.reply({ content: `No giveaway found with ID \`#${id}\`.`, ephemeral: true });
            if (giveaway.status !== 'ended') return interaction.reply({ content: 'That giveaway hasn\'t ended yet.', ephemeral: true });
            if (!giveaway.entrantIds.length) return interaction.reply({ content: 'No one entered this giveaway.', ephemeral: true });

            const newWinners = giveaways.pickWinners(giveaway.entrantIds, giveaway.winnerCount);
            const updated = giveaways.setWinners(guildId, id, newWinners);

            if (updated.channelId && updated.messageId) {
                const channel = await interaction.client.channels.fetch(updated.channelId).catch(() => null);
                const message = await channel?.messages.fetch(updated.messageId).catch(() => null);
                if (message) await message.edit(withFooter({ embeds: [buildEmbed(cfg, updated)], components: [buildRow(updated)] })).catch(() => {});
            }

            return interaction.reply({ content: winnerAnnouncement(updated,newWinners,{reroll:true}), allowedMentions: { users: newWinners } });
        }
    },
};
