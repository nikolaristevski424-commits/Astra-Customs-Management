const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../utils/config');
const { isExecutive } = require('../utils/env');
const activity = require('../utils/activity');
const { baseEmbed } = require('../utils/embeds');

async function roleMemberCount(guild, roleId) {
    await guild.members.fetch().catch(() => {});
    return guild.members.cache.filter((member) => member.roles.cache.has(roleId)).size;
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
            { name: 'How it works', value: 'Only members with the selected role should react. Each member can count once.' },
        ],
        footer: `Activity Check #${record.id}`,
        timestamp: record.createdAt,
    });
}

function buildRow(record) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`activity_react_${record.id}`).setLabel(`Reacted: ${record.voterIds.length}`).setStyle(ButtonStyle.Primary).setEmoji('✅')
    );
}

module.exports = {
    buildEmbed,
    buildRow,
    roleMemberCount,
    data: new SlashCommandBuilder()
        .setName('activity')
        .setDescription('Create a live role activity check.')
        .addSubcommand((sub) => sub.setName('check').setDescription('Post a live activity check for a role.').addRoleOption((option) => option.setName('role').setDescription('Role whose members should react').setRequired(true))),

    async execute(interaction) {
        const cfg = config.getConfig(interaction.guildId);
        if (!isExecutive(interaction.member)) return interaction.reply({ content: 'Only configured executives can create activity checks.', ephemeral: true });

        const role = interaction.options.getRole('role', true);
        await interaction.deferReply({ ephemeral: true });
        const record = activity.create(interaction.guildId, { roleId: role.id });
        const memberCount = await roleMemberCount(interaction.guild, role.id);
        const message = await interaction.channel.send({ embeds: [buildEmbed(cfg, record, memberCount)], components: [buildRow(record)] });
        activity.attachMessage(interaction.guildId, record.id, message.id, message.channelId);
        return interaction.editReply(`Activity check #${record.id} posted for ${role}.`);
    },
};