const { SlashCommandBuilder, OverwriteType } = require('discord.js');
const config = require('../utils/config');
const perms = require('../utils/permissions');
const tickets = require('../utils/tickets');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('add')
        .setDescription('Add a member to the current ticket.')
        .addUserOption((option) => option.setName('user').setDescription('Member to add to this ticket').setRequired(true)),

    async execute(interaction) {
        const ticket = tickets.get(interaction.guildId, interaction.channelId);
        if (!ticket || ticket.closedAt) {
            return interaction.reply({ content: 'This command can only be used in an open ticket channel.', ephemeral: true });
        }

        const cfg = config.getConfig(interaction.guildId);
        if (!perms.isTicketStaff(interaction.member, cfg) && ticket.userId !== interaction.user.id) {
            return interaction.reply({ content: 'Only ticket staff or the ticket opener can add members.', ephemeral: true });
        }

        const user = interaction.options.getUser('user', true);
        if (user.bot) return interaction.reply({ content: 'Bots cannot be added to tickets.', ephemeral: true });

        await interaction.deferReply({ ephemeral: true });
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!member) return interaction.editReply('That user is not a member of this server.');

        await interaction.channel.permissionOverwrites.edit(member, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
        }, { type: OverwriteType.Member, reason: `Added to ticket by ${interaction.user.tag}` });

        const addedUserIds = [...new Set([...(ticket.addedUserIds || []), user.id])];
        tickets.update(interaction.guildId, interaction.channelId, { addedUserIds });

        await interaction.editReply(`${user} has been added to this ticket.`);
        try {
            await interaction.channel.send({
                content: `${user} was added to this ticket by <@${interaction.user.id}>.`,
                allowedMentions: { users: [user.id, interaction.user.id] },
            });
        } catch (error) {
            console.error(`[ticket] Added user ${user.id} to ${interaction.channelId}, but could not post an announcement:`, error.message);
            return interaction.editReply(`${user} has ticket access, but the bot could not post an announcement in the channel.`);
        }
    },
};
