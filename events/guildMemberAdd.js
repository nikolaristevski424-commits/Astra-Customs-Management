const { Events, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const config = require('../utils/config');
const { PANEL_CHANNELS } = require('../commands/panel');

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member) {
        const cfg = config.getConfig(member.guild.id);

        if (cfg.welcomeRoleId) {
            await member.roles.add(cfg.welcomeRoleId).catch((err) => console.error('[welcome] Failed to add welcome role:', err.message));
        }

        if (!cfg.welcomeChannelId) return;
        const channel = await member.guild.channels.fetch(cfg.welcomeChannelId).catch(() => null);
        if (!channel) return;

        const channelUrl = (channelId) => `https://discord.com/channels/${member.guild.id}/${channelId}`;
        const embed = new EmbedBuilder()
            .setColor(0x2d8cff)
            .setTitle(`Welcome to ${cfg.brandName}`)
            .setDescription(`Hey <@${member.id}>! Use the links below to find your way around the server.`)
            .addFields({ name: 'Start here', value: 'Read the guidelines, explore the dashboard, ask for assistance, or submit an order.' })
            .setFooter({ text: cfg.brandName });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('Guidelines').setStyle(ButtonStyle.Link).setURL(channelUrl(PANEL_CHANNELS.guidelines)),
            new ButtonBuilder().setLabel('Dashboard').setStyle(ButtonStyle.Link).setURL(channelUrl(PANEL_CHANNELS.dashboard)),
            new ButtonBuilder().setLabel('Assistance').setStyle(ButtonStyle.Link).setURL(channelUrl(PANEL_CHANNELS.tickets)),
            new ButtonBuilder().setLabel('Order Here').setStyle(ButtonStyle.Link).setURL(channelUrl(PANEL_CHANNELS.order)),
        );
        await channel
            .send({ embeds: [embed], components: [row], allowedMentions: { users: [member.id] } })
            .catch((err) => console.error('[welcome] Failed to send welcome message:', err.message));
    },
};
