const { Events, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../utils/config');
const { buildPanel } = require('../utils/embeds');

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

        const container = buildPanel(cfg, {
            heading: `Welcome to ${cfg.brandName}!`,
            body: `Hey <@${member.id}>, thanks for joining! Check out the dashboard below to get started.`,
        });

        const row = cfg.dashboardChannelId
            ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Go to Dashboard').setStyle(ButtonStyle.Link).setURL(`https://discord.com/channels/${member.guild.id}/${cfg.dashboardChannelId}`))]
            : [];

        const { MessageFlags } = require('discord.js');
        // Components V2 messages can't also set `content` — the @mention lives
        // inside the container's text instead (see `body` above).
        await channel
            .send({ flags: MessageFlags.IsComponentsV2, components: [container, ...row], allowedMentions: { users: [member.id] } })
            .catch((err) => console.error('[welcome] Failed to send welcome message:', err.message));
    },
};
