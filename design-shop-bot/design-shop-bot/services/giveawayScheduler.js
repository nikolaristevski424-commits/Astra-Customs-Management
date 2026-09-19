// Periodically checks every guild for giveaways whose timer has run
// out, picks winners, and edits the original message to show them.

const config = require('../utils/config');
const giveaways = require('../utils/giveaways');
const giveawayCmd = require('../commands/giveaway');

const CHECK_INTERVAL_MS = 30_000;

function start(client) {
    setInterval(async () => {
        for (const [guildId] of client.guilds.cache) {
            try {
                const cfg = config.getConfig(guildId);
                const expired = giveaways.findExpired(guildId);

                for (const giveaway of expired) {
                    const winners = giveaways.pickWinners(giveaway.entrantIds, giveaway.winnerCount);
                    const updated = giveaways.setWinners(guildId, giveaway.id, winners);

                    if (!updated.channelId || !updated.messageId) continue;
                    try {
                        const channel = await client.channels.fetch(updated.channelId);
                        const message = await channel.messages.fetch(updated.messageId);
                        await message.edit({ embeds: [giveawayCmd.buildEmbed(cfg, updated)], components: [giveawayCmd.buildRow(updated)] });

                        if (winners.length) {
                            await channel.send({
                                content: `🎉 Congratulations ${winners.map((id) => `<@${id}>`).join(', ')} — you won **${giveaway.prize}**!`,
                                allowedMentions: { users: winners },
                            });
                        } else {
                            await channel.send(`No one entered giveaway \`#${giveaway.id}\` for **${giveaway.prize}**.`);
                        }
                    } catch (err) {
                        console.error(`[giveawayScheduler] Failed to finish giveaway ${giveaway.id} for guild ${guildId}:`, err.message);
                    }
                }
            } catch (err) {
                console.error(`[giveawayScheduler] Failed processing guild ${guildId}:`, err.message);
            }
        }
    }, CHECK_INTERVAL_MS);
}

module.exports = { start };
