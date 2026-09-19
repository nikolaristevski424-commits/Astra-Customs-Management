const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../utils/config');
const perms = require('../utils/permissions');
const pool = require('../utils/paymentPool');
const roblox = require('../utils/roblox');

function formatSince(ts) {
    return `<t:${Math.floor(ts / 1000)}:R>`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('payment')
        .setDescription('Get a payment link with an auto-picked game pass from the pool.')
        .addSubcommand((sub) =>
            sub
                .setName('request')
                .setDescription('Auto-pick a free game pass, set its price, and get the payment link')
                .addIntegerOption((o) => o.setName('price').setDescription('Price in Robux').setRequired(true).setMinValue(0))
                .addStringOption((o) => o.setName('note').setDescription('What this payment is for (shown in /payment pool)'))
        )
        .addSubcommand((sub) =>
            sub
                .setName('release')
                .setDescription('Free up a reserved game pass so it goes back in the pool')
                .addStringOption((o) => o.setName('gamepass_id').setDescription('Game pass ID').setRequired(true).setAutocomplete(true))
        )
        .addSubcommand((sub) =>
            sub
                .setName('link')
                .setDescription('Get the purchase + game links for a pool game pass without changing its price')
                .addStringOption((o) => o.setName('gamepass_id').setDescription('Game pass ID').setRequired(true).setAutocomplete(true))
        )
        .addSubcommand((sub) => sub.setName('pool').setDescription('See the status of every configured payment game pass')),

    async autocomplete(interaction) {
        const guildId = interaction.guildId;
        const cfg = config.getConfig(guildId);
        if (!perms.isManager(interaction.member, cfg)) return interaction.respond([]);

        const sub = interaction.options.getSubcommand();
        const focused = interaction.options.getFocused().toLowerCase();
        const statuses = pool.listStatus(guildId);
        const relevant = sub === 'release' ? statuses.filter((s) => s.reserved) : statuses;
        const filtered = relevant.filter((s) => s.gamePassId.includes(focused)).slice(0, 25);
        await interaction.respond(
            filtered.map((s) => ({ name: `${s.gamePassId}${s.reserved ? ` (reserved${s.note ? `: ${s.note}` : ''})` : ' (free)'}`, value: s.gamePassId }))
        );
    },

    async execute(interaction) {
        const guildId = interaction.guildId;
        const cfg = config.getConfig(guildId);

        if (!perms.isManager(interaction.member, cfg)) {
            return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        }

        const sub = interaction.options.getSubcommand();

        if (!pool.getPoolIds().length) {
            return interaction.reply({ content: 'No payment game passes are configured. Add `PAYMENT_GAMEPASS_IDS=id1,id2,...` to `.env` and restart the bot.', ephemeral: true });
        }

        if (sub === 'pool') {
            const statuses = pool.listStatus(guildId);
            const lines = statuses.map((s) => (s.reserved ? `🔒 \`${s.gamePassId}\` — reserved ${formatSince(s.reservedAt)}${s.note ? ` — ${s.note}` : ''}` : `🟢 \`${s.gamePassId}\` — free`));
            return interaction.reply({ content: lines.join('\n'), ephemeral: true });
        }

        if (sub === 'release') {
            const id = interaction.options.getString('gamepass_id', true);
            const released = pool.release(guildId, id);
            return interaction.reply({ content: released ? `Released \`${id}\` back into the pool.` : `\`${id}\` wasn't reserved.`, ephemeral: true });
        }

        if (sub === 'link') {
            const id = interaction.options.getString('gamepass_id', true);
            return interaction.reply({ content: buildLinkMessage(cfg, id), components: [buildLinkButtons(cfg, id)] });
        }

        if (sub === 'request') {
            if (!cfg.robloxUniverseId) {
                return interaction.reply({ content: 'No Roblox universe ID is configured. Set `ROBLOX_UNIVERSE_ID` in `.env` first (this is the game ID that owns your game passes).', ephemeral: true });
            }
            if (!process.env.ROBLOX_API_KEY && !process.env.ROBLOX_COOKIE) {
                return interaction.reply({ content: 'Neither `ROBLOX_API_KEY` nor `ROBLOX_COOKIE` is set in `.env`, so payment prices can\'t be changed.', ephemeral: true });
            }

            const price = interaction.options.getInteger('price', true);
            const note = interaction.options.getString('note') || `Requested by ${interaction.user.tag}`;

            const gamePassId = pool.pickAvailable(guildId, note);
            if (!gamePassId) {
                return interaction.reply({ content: 'Every payment game pass is currently reserved. Free one up with `/payment release`, or check `/payment pool`.', ephemeral: true });
            }

            await interaction.deferReply();
            const result = await roblox.updateGamePassPrice({ universeId: cfg.robloxUniverseId, gamePassId, price });

            if (!result.success) {
                pool.release(guildId, gamePassId); // don't hold a slot hostage for a failed update
                const reasons = {
                    no_credentials: 'No Roblox credentials configured.',
                    request_failed: `Roblox rejected the request${result.status ? ` (HTTP ${result.status})` : ''}: ${result.message || 'unknown error'}`,
                };
                return interaction.editReply(reasons[result.reason] || 'Failed to update the price. Check the bot console for details.');
            }

            return interaction.editReply({ content: buildLinkMessage(cfg, gamePassId, price), components: [buildLinkButtons(cfg, gamePassId)] });
        }
    },
};

function buildLinkMessage(cfg, gamePassId, price) {
    const lines = [
        price !== undefined ? `Payment link ready — price set to **R$${price}**.` : `Payment link for \`${gamePassId}\`:`,
        roblox.gamePassLink(gamePassId),
    ];
    if (cfg.gamePlaceId) {
        lines.push('', `If the buyer is under 13 and the link above doesn't work for them, have them join the game directly and buy it in-game:`, roblox.gamePlaceLink(cfg.gamePlaceId));
    }
    return lines.join('\n');
}

function buildLinkButtons(cfg, gamePassId) {
    const buttons = [new ButtonBuilder().setLabel('Payment Link').setStyle(ButtonStyle.Link).setURL(roblox.gamePassLink(gamePassId))];
    if (cfg.gamePlaceId) buttons.push(new ButtonBuilder().setLabel('Join Game').setStyle(ButtonStyle.Link).setURL(roblox.gamePlaceLink(cfg.gamePlaceId)));
    return new ActionRowBuilder().addComponents(buttons);
}
