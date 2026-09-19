const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, userMention } = require('discord.js');
const config = require('../utils/config');
const loa = require('../utils/loa');
const perms = require('../utils/permissions');
const { parseColor } = require('../utils/embeds');

function parseDate(str) {
    const ms = Date.parse(str.includes('T') ? str : `${str}T00:00:00Z`);
    return Number.isNaN(ms) ? null : ms;
}

/**
 * Shared by /loa request and the dashboard's "Request LOA" button/modal.
 * Returns a user-facing result message; the caller decides how to reply.
 */
async function submitRequest(interaction, { startInput, endInput, reason }) {
    const guildId = interaction.guildId;
    const cfg = config.getConfig(guildId);

    if (!perms.isStaff(interaction.member, cfg)) {
        return { ok: false, message: 'Leave of Absence requests are for staff members.' };
    }

    const startDate = parseDate(startInput);
    const endDate = parseDate(endInput);

    if (!startDate || !endDate) return { ok: false, message: 'Please provide valid dates in `YYYY-MM-DD` format.' };
    if (endDate <= startDate) return { ok: false, message: 'The end date must be after the start date.' };

    const record = loa.request(guildId, { userId: interaction.user.id, startDate, endDate, reason });

    if (!cfg.loaChannelId) {
        return { ok: true, message: `LOA request \`${record.id}\` saved, but no LOA channel is configured. Set \`LOA_CHANNEL_ID\` in \`.env\`.` };
    }

    const channel = await interaction.client.channels.fetch(cfg.loaChannelId).catch(() => null);
    const embed = new EmbedBuilder()
        .setColor(parseColor(cfg.accentColor))
        .setTitle('Leave of Absence Request')
        .addFields(
            { name: 'User', value: userMention(interaction.user.id), inline: true },
            { name: 'Start', value: `<t:${Math.floor(startDate / 1000)}:D>`, inline: true },
            { name: 'End', value: `<t:${Math.floor(endDate / 1000)}:D>`, inline: true },
            { name: 'Reason', value: reason },
        )
        .setFooter({ text: `LOA ID: ${record.id}` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`loa_approve_${record.id}`).setLabel('Approve').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`loa_deny_${record.id}`).setLabel('Deny').setStyle(ButtonStyle.Danger),
    );

    if (channel) await channel.send({ embeds: [embed], components: [row], allowedMentions: { parse: [] } });
    return { ok: true, message: `LOA request submitted. ID: \`${record.id}\`` };
}

module.exports = {
    submitRequest,

    data: new SlashCommandBuilder()
        .setName('loa')
        .setDescription('Request or manage a Leave of Absence.')
        .addSubcommand((sub) =>
            sub
                .setName('request')
                .setDescription('Request a leave of absence')
                .addStringOption((o) => o.setName('start').setDescription('Start date, YYYY-MM-DD').setRequired(true))
                .addStringOption((o) => o.setName('end').setDescription('End date, YYYY-MM-DD').setRequired(true))
                .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true))
        )
        .addSubcommand((sub) => sub.setName('return').setDescription('End your active LOA early'))
        .addSubcommand((sub) => sub.setName('list').setDescription('List LOA history').addUserOption((o) => o.setName('user').setDescription('User (defaults to you)'))),

    async execute(interaction) {
        const guildId = interaction.guildId;
        const cfg = config.getConfig(guildId);
        const sub = interaction.options.getSubcommand();

        if (sub === 'request') {
            const result = await submitRequest(interaction, {
                startInput: interaction.options.getString('start', true),
                endInput: interaction.options.getString('end', true),
                reason: interaction.options.getString('reason', true),
            });
            return interaction.reply({ content: result.message, ephemeral: true });
        }

        if (sub === 'return') {
            const active = loa.findActiveForUser(guildId, interaction.user.id);
            if (!active) return interaction.reply({ content: 'You do not have an active LOA.', ephemeral: true });

            loa.setStatus(guildId, active.id, 'ended', { endedAt: Date.now(), endedEarly: true });
            if (cfg.loaRoleId) {
                const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
                if (member) await member.roles.remove(cfg.loaRoleId).catch(() => null);
            }
            return interaction.reply({ content: 'Welcome back! Your LOA has been ended.', ephemeral: true });
        }

        if (sub === 'list') {
            const user = interaction.options.getUser('user') || interaction.user;
            if (user.id !== interaction.user.id && !perms.isHR(interaction.member, cfg)) {
                return interaction.reply({ content: "You don't have permission to view someone else's LOA history.", ephemeral: true });
            }
            const records = loa.list(guildId, user.id);
            if (!records.length) return interaction.reply({ content: `No LOA history for ${user.username}.`, ephemeral: true });

            const lines = records
                .slice(-10)
                .reverse()
                .map((l) => `\`${l.id}\` — ${new Date(l.startDate).toLocaleDateString()} → ${new Date(l.endDate).toLocaleDateString()} — **${l.status}**`);
            return interaction.reply({ content: lines.join('\n'), ephemeral: true });
        }
    },
};
