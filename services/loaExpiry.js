// Periodically checks every guild for approved LOAs whose end date has
// passed, removes the LOA role, and marks them ended.

const config = require('../utils/config');
const loa = require('../utils/loa');

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

function start(client) {
    setInterval(async () => {
        for (const [guildId, guild] of client.guilds.cache) {
            try {
                const cfg = config.getConfig(guildId);
                const expired = loa.findExpired(guildId);

                for (const record of expired) {
                    loa.setStatus(guildId, record.id, 'ended', { endedAt: Date.now(), endedEarly: false });

                    if (cfg.loaRoleId) {
                        const member = await guild.members.fetch(record.userId).catch(() => null);
                        if (member) await member.roles.remove(cfg.loaRoleId).catch(() => {});
                    }

                    if (cfg.loaChannelId) {
                        const channel = await client.channels.fetch(cfg.loaChannelId).catch(() => null);
                        if (channel) {
                            await channel
                                .send({ content: `<@${record.userId}>'s LOA (\`${record.id}\`) has ended.`, allowedMentions: { users: [record.userId] } })
                                .catch(() => {});
                        }
                    }
                }
            } catch (err) {
                console.error(`[loaExpiry] Failed processing guild ${guildId}:`, err.message);
            }
        }
    }, CHECK_INTERVAL_MS);
}

module.exports = { start };
