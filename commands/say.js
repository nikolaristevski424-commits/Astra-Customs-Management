const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../utils/config');
const perms = require('../utils/permissions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('Send a staff message to a channel.')
        .addStringOption((o) => o.setName('message').setDescription('Message to send').setRequired(true).setMaxLength(2000))
        .addChannelOption((o) => o.setName('channel').setDescription('Channel to send it to').addChannelTypes(0, 5))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction) {
        const guildId = interaction.guildId;
        const cfg = config.getConfig(guildId);
        if (!perms.isStaff(interaction.member, cfg)) {
            return interaction.reply({ content: 'Only staff can use `/say`.', ephemeral: true });
        }

        const message = interaction.options.getString('message', true);
        const channel = interaction.options.getChannel('channel') || interaction.channel;

        await channel.send({ content: message, allowedMentions: { parse: [] } });
        return interaction.reply({ content: `Message sent in ${channel}.`, ephemeral: true });
    },
};
