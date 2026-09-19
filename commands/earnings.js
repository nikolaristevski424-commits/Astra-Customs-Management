const { SlashCommandBuilder } = require('discord.js');
const config = require('../utils/config');
const perms = require('../utils/permissions');
const orders = require('../utils/orders');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('earnings')
        .setDescription('View a designer\'s total logged earnings.')
        .addUserOption((o) => o.setName('designer').setDescription('Designer (defaults to you)')),

    async execute(interaction) {
        const cfg = config.getConfig(interaction.guildId);
        const designer = interaction.options.getUser('designer') || interaction.user;

        if (designer.id !== interaction.user.id && !perms.isManager(interaction.member, cfg) && !perms.isPayoutManager(interaction.member, cfg)) {
            return interaction.reply({ content: "You don't have permission to view someone else's earnings.", ephemeral: true });
        }

        const total = orders.totalEarnings(interaction.guildId, designer.id);
        return interaction.reply({ content: `**${designer.tag}** has earned **R$${total}** from logged orders.`, ephemeral: true, allowedMentions: { users: [] } });
    },
};
