const { Events, MessageFlags } = require('discord.js');
const config = require('../utils/config');
const perms = require('../utils/permissions');
const panelCmd = require('../commands/panel');
const pricelistCmd = require('../commands/pricelist');

const SHORTCUTS = {
    dashboard: 'dashboard',
    guidelines: 'guidelines',
    orderstatus: 'order-status',
    tickets: 'tickets',
    ticketpanel: 'tickets',
    portfolio: 'portfolio',
    affiliations: 'affiliations',
    honeypot: 'honeypot',
    pricelist: 'pricelist',
};

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot || !message.guild) return;

        const guildId = message.guild.id;
        const cfg = config.getConfig(guildId);

        // ---- Honeypot trap ----
        if (cfg.honeypotChannelId && message.channelId === cfg.honeypotChannelId) {
            await message.delete().catch(() => {});
            try {
                await message.guild.members.ban(message.author.id, { deleteMessageSeconds: 3600, reason: 'Posted in the honeypot channel.' });
                await message.guild.members.unban(message.author.id, 'Honeypot softban — auto-unbanned.').catch(() => {});
            } catch (err) {
                console.error('[honeypot] Failed to softban:', err.message);
            }

            const newCount = (cfg.honeypot?.count || 0) + 1;
            config.setNested(guildId, 'honeypot', { count: newCount });

            if (cfg.honeypot?.channelId && cfg.honeypot?.messageId) {
                const panelChannel = await message.client.channels.fetch(cfg.honeypot.channelId).catch(() => null);
                const panelMessage = await panelChannel?.messages.fetch(cfg.honeypot.messageId).catch(() => null);
                if (panelMessage) {
                    const updatedCfg = config.getConfig(guildId);
                    const payload = panelCmd.BUILDERS.honeypot(updatedCfg);
                    await panelMessage.edit({ flags: MessageFlags.IsComponentsV2, ...payload }).catch(() => {});
                }
            }
            return;
        }

        // ---- Prefix panel shortcuts (staff only) ----
        if (!message.content.startsWith(cfg.prefix)) return;
        const command = message.content.slice(cfg.prefix.length).trim().toLowerCase();
        const type = SHORTCUTS[command];
        if (!type) return;

        const member = await message.guild.members.fetch(message.author.id).catch(() => null);
        if (!member || !perms.isStaff(member, cfg)) return;

        await message.delete().catch(() => {});

        if (type === 'pricelist' || command === 'pricelist') {
            return message.channel.send({ embeds: [pricelistCmd.buildPricelistEmbed({ ...cfg, _guildId: guildId })] });
        }

        const builder = panelCmd.BUILDERS[type];
        if (!builder) return;
        const payload = builder(cfg, guildId);
        return message.channel.send({ flags: MessageFlags.IsComponentsV2, ...payload });
    },
};
