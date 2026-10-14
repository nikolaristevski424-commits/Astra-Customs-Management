const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../utils/config');
const { isExecutive } = require('../utils/env');
const activity = require('../utils/activity');
const { baseEmbed } = require('../utils/embeds');

async function roleMembers(guild, roleId) {
    const members = await guild.members.fetch();
    return [...members.values()].filter((member) => !member.user.bot && member.roles.cache.has(roleId));
}

function buildEmbed(cfg, record, memberCount) {
    return baseEmbed(cfg, {
        color: 0x2d8cff,
        title: `${cfg.brandName} | Activity Check`,
        description: `React below to confirm your activity. This check is for <@&${record.roleId}> members.`,
        fields: [
            { name: 'Role', value: `<@&${record.roleId}>`, inline: true },
            { name: 'Members with role', value: `${memberCount}`, inline: true },
            { name: 'Reacted', value: `${record.voterIds.length}`, inline: true },
            { name: 'Participation', value: memberCount ? `${Math.round((record.voterIds.length / memberCount) * 100)}%` : '0%', inline: true },
            { name: 'How it works', value: 'Members who had the selected role when this was posted have 24 hours to react. Non-responders receive a Notice infraction.' },
        ],
        footer: `Activity Check #${record.id}`,
        timestamp: record.createdAt,
    });
}

function buildRow(record) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`activity_react_${record.id}`)
            .setLabel(record.status === 'completed' ? 'Check Closed' : `Reacted: ${record.voterIds.length}`)
            .setStyle(ButtonStyle.Primary)
            .setEmoji('✅')
            .setDisabled(record.status === 'completed')
    );
}

module.exports = {
    buildEmbed,
    buildRow,
    roleMembers,
    data: new SlashCommandBuilder()
        .setName('activity')
        .setDescription('Create a live role activity check.')
        .addSubcommand((sub) => sub.setName('check').setDescription('Post a live activity check for a role.').addRoleOption((option) => option.setName('role').setDescription('Role whose members should react').setRequired(true))),

    async execute(interaction) {
        const cfg = config.getConfig(interaction.guildId);
        if (!isExecutive(interaction.member)) return interaction.reply({ content: 'Only configured executives can create activity checks.', ephemeral: true });

        const role = interaction.options.getRole('role', true);
        await interaction.deferReply({ ephemeral: true });
        let members;
        try {
            members = await roleMembers(interaction.guild, role.id);
        } catch (error) {
            console.error('[activity] Failed to fetch role members:', error.message);
            return interaction.editReply('Could not load the role members for this activity check. No check was created; please try again.');
        }

        const record = activity.create(interaction.guildId, {
            roleId: role.id,
            targetIds: members.map((member) => member.id),
        });
        const memberCount = members.length;
        let message;
        try {
            message = await interaction.channel.send({ embeds: [buildEmbed(cfg, record, memberCount)], components: [buildRow(record)] });
        } catch (error) {
            activity.cancel(interaction.guildId, record.id);
            console.error(`[activity] Could not post activity check #${record.id}:`, error.message);
            return interaction.editReply('The activity check could not be posted. No infraction will be issued for this check.');
        }
        activity.attachMessage(interaction.guildId, record.id, message.id, message.channelId, message.createdTimestamp);
        return interaction.editReply(`Activity check #${record.id} posted for ${role}.`);
    },
};