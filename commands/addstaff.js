const { SlashCommandBuilder } = require('discord.js');
const config = require('../utils/config');
const perms = require('../utils/permissions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addstaff')
        .setDescription('Give a member the first configured staff role.')
        .addUserOption((o) => o.setName('user').setDescription('User to make staff').setRequired(true)),

    async execute(interaction) {
        const cfg = config.getConfig(interaction.guildId);
        if (!perms.isManager(interaction.member, cfg)) {
            return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        }
        if (!cfg.staffRoleIds.length) {
            return interaction.reply({ content: 'No staff role is configured. Set `STAFF_ROLE_IDS` in `.env` first.', ephemeral: true });
        }

        const user = interaction.options.getUser('user', true);
        await interaction.deferReply({ ephemeral: true });
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!member) return interaction.editReply('Could not find that member in this server.');

        await member.roles.add(cfg.staffRoleIds[0]);
        return interaction.editReply({ content: `Gave <@&${cfg.staffRoleIds[0]}> to ${user}.`, allowedMentions: { users: [] } });
    },
};
