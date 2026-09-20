const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, userMention } = require('discord.js');
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
    const embed = baseEmbed(cfg, {
        title: ended ? 'Giveaway Ended' : giveaway.sponsor ? `Giveaway | Sponsored by ${giveaway.sponsor}` : 'Giveaway',
        bannerKey: 'giveaway',
        description: `**Prize:** ${giveaway.prize}`,
        fields: [
            { name: 'Winners', value: `${giveaway.winnerCount}`, inline: true },
            { name: 'Entrants', value: `${giveaway.entrantIds.length}`, inline: true },
            { name: 'Hosted by', value: userMention(giveaway.hostedBy), inline: true },
        ],
        footer: `Giveaway #${giveaway.id}`,
    });

    if (giveaway.sponsor) {
        embed.addFields({ name: 'Sponsored by', value: giveaway.sponsorInvite ? `[${giveaway.sponsor}](${giveaway.sponsorInvite})` : giveaway.sponsor, inline: true });
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
    if (giveaway.sponsorInvite) {
        buttons.push(new ButtonBuilder().setLabel(`Join ${giveaway.sponsor || 'Sponsor'}`).setStyle(ButtonStyle.Link).setURL(giveaway.sponsorInvite).setEmoji('🔗'));
    }
    return new ActionRowBuilder().addComponents(buttons);
}

/** Builds the message content (ping text) + allowedMentions for a giveaway announcement. */
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
            if (sponsorInvite && !/^https?:\/\/(www\.)?(discord\.gg|discord\.com\/invite)\//i.test(sponsorInvite)) {
                return interaction.reply({ content: 'Please provide a valid Discord invite link for `sponsor_invite` (e.g. https://discord.gg/...).', ephemeral: true });
            }

            const giveaway = giveaways.create(guildId, {
                prize,
                winnerCount,
                hostedBy: interaction.user.id,
                endsAt: Date.now() + durationMs,
                sponsor: sponsor || null,
                sponsorInvite: sponsorInvite || null,
                pingType,
                pingRoleId: pingRole?.id || null,
            });

            const targetChannelId = cfg.giveawayChannelId || interaction.channelId;
            const channel = await interaction.client.channels.fetch(targetChannelId).catch(() => null);
            if (!channel) {
                return interaction.reply({ content: `Giveaway \`#${giveaway.id}\` saved, but the giveaway channel isn't reachable. Set \`GIVEAWAY_CHANNEL_ID\` in \`.env\`.`, ephemeral: true });
            }

            const ping = buildPing(giveaway);
            const sent = await channel.send({ content: ping.content, embeds: [buildEmbed(cfg, giveaway)], components: [buildRow(giveaway)], allowedMentions: ping.allowedMentions });
            giveaways.attachMessage(guildId, giveaway.id, sent.id, sent.channelId);

            return interaction.reply({ content: `Giveaway \`#${giveaway.id}\` started for **${prize}**, ending <t:${Math.floor(giveaway.endsAt / 1000)}:R>.`, ephemeral: true });
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
                if (message) await message.edit({ embeds: [buildEmbed(cfg, updated)], components: [buildRow(updated)] }).catch(() => {});
            }

            return interaction.reply({ content: `Rerolled — new winner(s): ${newWinners.map((w) => userMention(w)).join(', ')}`, allowedMentions: { users: newWinners } });
        }
    },
};
