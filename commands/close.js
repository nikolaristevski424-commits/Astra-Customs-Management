const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../utils/config');
const perms = require('../utils/permissions');
const tickets = require('../utils/tickets');
const { CLOSE_REQUEST_DURATION_MS } = require('../services/ticketCloseRequests');

function canManageTicket(member, ticket, cfg, userId) {
    return userId === ticket.userId
        || perms.isTicketStaff(member, cfg);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('close')
        .setDescription('Manage the current ticket.')
        .addSubcommand((sub) => sub.setName('request').setDescription('Request closure after 24 hours without an objection.')),

    async execute(interaction) {
        const ticket = tickets.get(interaction.guildId, interaction.channelId);
        if (!ticket || ticket.closedAt) {
            return interaction.reply({ content: 'This command can only be used in an open ticket channel.', ephemeral: true });
        }

        const cfg = config.getConfig(interaction.guildId);
        if (!canManageTicket(interaction.member, ticket, cfg, interaction.user.id)) {
            return interaction.reply({ content: 'Only the ticket opener or ticket staff can request closure.', ephemeral: true });
        }
        if (ticket.closeRequest?.status === 'pending') {
            return interaction.reply({ content: 'A close request is already active in this ticket.', ephemeral: true });
        }

        const requestedAt = Date.now();
        const deadlineAt = requestedAt + CLOSE_REQUEST_DURATION_MS;
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`ticket_close_now_${interaction.channelId}`)
                .setLabel('Close Ticket Now')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`ticket_keep_open_${interaction.channelId}`)
                .setLabel('Keep Ticket Open')
                .setStyle(ButtonStyle.Secondary),
        );
        await interaction.reply({
            content: `A ticket close request was opened by <@${interaction.user.id}>. Choose an option below; if no one responds, this ticket will automatically close <t:${Math.floor(deadlineAt / 1000)}:R>.`,
            components: [row],
            allowedMentions: { users: [interaction.user.id] },
        });
        const message = await interaction.fetchReply();
        tickets.update(interaction.guildId, interaction.channelId, {
            closeRequest: {
                status: 'pending',
                requestedBy: interaction.user.id,
                requestedAt,
                deadlineAt,
                messageId: message.id,
            },
        });
    },
};
