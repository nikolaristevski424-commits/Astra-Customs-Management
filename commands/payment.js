const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../utils/config');
const perms = require('../utils/permissions');
const pool = require('../utils/paymentPool');
const roblox = require('../utils/roblox');
const discounts = require('../utils/discounts');
const packages = require('../utils/packages');

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
                .addIntegerOption((o) => o.setName('package_id').setDescription('Approved package to deliver after payment').setAutocomplete(true))
                .addUserOption((o) => o.setName('customer').setDescription('Discord customer who should receive the files'))
                .addStringOption((o) => o.setName('discount_code').setDescription('Optional discount code').setMaxLength(32))
                .addStringOption((o) => o.setName('note').setDescription('What this payment is for (shown in /payment pool)'))
        )
        .addSubcommand((sub) =>
            sub
                .setName('release')
                .setDescription('Free up a reserved game pass so it goes back in the pool')
                .addStringOption((o) => o.setName('gamepass_id').setDescription('Game pass ID').setRequired(true).setAutocomplete(true))
        )
        .addSubcommand((sub) => sub.setName('pool').setDescription('See the status of every configured payment game pass'))
        .addSubcommandGroup((group) =>
            group
                .setName('link')
                .setDescription('Create or verify Roblox payment links')
                .addSubcommand((sub) =>
                    sub
                        .setName('get')
                        .setDescription('Get a configured payment game pass link')
                        .addStringOption((o) => o.setName('gamepass_id').setDescription('Game pass ID').setRequired(true).setAutocomplete(true))
                )
                .addSubcommand((sub) =>
                    sub
                        .setName('check')
                        .setDescription('Check whether a Roblox user owns an asset')
                        .addStringOption((o) => o.setName('asset_type').setDescription('Roblox asset type').setRequired(true).addChoices({ name: 'Game Pass', value: 'gamepass' }, { name: 'Shirt', value: 'shirt' }))
                        .addStringOption((o) => o.setName('asset_id').setDescription('Game Pass or Shirt asset ID').setRequired(true).setMaxLength(20))
                        .addStringOption((o) => o.setName('username').setDescription('Roblox username to check').setRequired(true).setMaxLength(20))
                )
        ),

    async autocomplete(interaction) {
        const guildId = interaction.guildId;
        const cfg = config.getConfig(guildId);
        const group = interaction.options.getSubcommandGroup(false);
        const sub = interaction.options.getSubcommand();
        if (group === 'link' && sub === 'check') return interaction.respond([]);
        if (!perms.isManager(interaction.member, cfg)) return interaction.respond([]);

        const focused = interaction.options.getFocused().toLowerCase();
        if (sub === 'request' && interaction.options.getFocused(true).name === 'package_id') {
            const approved = packages.list(guildId, 'approved')
                .filter((pkg) => pkg.files?.length && (`${pkg.id}`.includes(focused) || pkg.name.toLowerCase().includes(focused)))
                .slice(0, 25);
            return interaction.respond(approved.map((pkg) => ({ name: `#${pkg.id} ${pkg.name} (${pkg.files.length} files)`, value: pkg.id })));
        }
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

        const sub = interaction.options.getSubcommand();
        const group = interaction.options.getSubcommandGroup(false);
        const isOwnershipCheck = group === 'link' && sub === 'check';
        if (isOwnershipCheck ? !perms.isStaff(interaction.member, cfg) : !perms.isManager(interaction.member, cfg)) {
            return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        }

        if (isOwnershipCheck) {
            const assetType = interaction.options.getString('asset_type', true);
            const assetId = interaction.options.getString('asset_id', true).trim();
            const username = interaction.options.getString('username', true).trim();
            if (!/^\d+$/.test(assetId)) return interaction.reply({ content: 'Asset ID must contain numbers only.', ephemeral: true });

            await interaction.deferReply({ ephemeral: true });
            const user = await roblox.resolveUsername(username);
            if (!user.success) return interaction.editReply(user.reason === 'user_not_found' ? `No Roblox user was found for **${username}**.` : 'Roblox could not resolve that username right now. Try again shortly.');

            const ownership = await roblox.checkAssetOwnership({ userId: user.id, assetId, assetType });
            if (!ownership.success) {
                return interaction.editReply(ownership.reason === 'inventory_private' ? `Roblox did not allow an ownership check for **${user.name}**. The inventory may be private.` : 'Roblox could not complete the ownership check right now. Try again shortly.');
            }
            if (!ownership.owned) return interaction.editReply(`**${user.name}** does not own that ${assetType === 'gamepass' ? 'Game Pass' : 'Shirt'}. No payment link was sent.`);

            const link = roblox.assetLink(assetId, assetType);
            return interaction.editReply(`**${user.name}** owns that ${assetType === 'gamepass' ? 'Game Pass' : 'Shirt'}.\n${link}`);
        }

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

        if (group === 'link' && sub === 'get') {
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
            const packageId = interaction.options.getInteger('package_id');
            const customer = interaction.options.getUser('customer');
            let packageRecord = null;
            if (packageId) {
                packageRecord = packages.find(guildId, packageId);
                if (!packageRecord || packageRecord.status !== 'approved') {
                    return interaction.reply({ content: 'That package does not exist or is not approved yet.', ephemeral: true });
                }
                if (!packageRecord.files?.length) {
                    return interaction.reply({ content: 'That package has no delivery files attached. Edit the package and add its files before creating a payment link.', ephemeral: true });
                }
            }
            const discountCode = interaction.options.getString('discount_code');
            const note = interaction.options.getString('note') || `Requested by ${interaction.user.tag}`;

            let discount = null;
            let finalPrice = price;
            if (discountCode) {
                discount = discounts.preview(guildId, discountCode, price);
                if (!discount.success) {
                    const messages = { invalid: 'That discount code does not exist.', expired: 'That discount code has expired.', used_up: 'That discount code has reached its usage limit.' };
                    return interaction.reply({ content: messages[discount.reason] || 'That discount code cannot be used.', ephemeral: true });
                }
                finalPrice = discount.total;
                if (finalPrice < 1) return interaction.reply({ content: 'That discount makes the payment price less than R$1. Use a smaller discount or a higher subtotal.', ephemeral: true });
            }

            const gamePassId = pool.pickAvailable(guildId, note, undefined, {
                packageId: packageRecord?.id || null,
                customerDiscordId: customer?.id || null,
            });
            if (!gamePassId) {
                return interaction.reply({ content: 'Every payment game pass is currently reserved. Free one up with `/payment release`, or check `/payment pool`.', ephemeral: true });
            }

            await interaction.deferReply();
            const result = await roblox.updateGamePassPrice({ universeId: cfg.robloxUniverseId, gamePassId, price: finalPrice });

            if (!result.success) {
                pool.release(guildId, gamePassId); // don't hold a slot hostage for a failed update
                const reasons = {
                    no_credentials: 'No Roblox credentials configured.',
                    request_failed: `Roblox rejected the request${result.status ? ` (HTTP ${result.status})` : ''}: ${result.message || 'unknown error'}`,
                };
                return interaction.editReply(reasons[result.reason] || 'Failed to update the price. Check the bot console for details.');
            }

            if (discount) {
                const redeemed = discounts.redeem(guildId, discount.code, interaction.user.id, price);
                if (!redeemed.success) {
                    return interaction.editReply('The payment link was created, but the discount could not be recorded because it was redeemed by someone else or reached its limit. Ask an executive to verify the order.');
                }
            }

            return interaction.editReply({ content: buildLinkMessage(cfg, gamePassId, finalPrice, discount ? { original: price, savings: discount.savings, code: discount.code } : null), components: [buildLinkButtons(cfg, gamePassId)] });
        }
    },
};

function buildLinkMessage(cfg, gamePassId, price, discount = null) {
    const lines = [
        price !== undefined ? `Payment link ready — price set to **R$${price}**.` : `Payment link for \`${gamePassId}\`:`,
        discount ? `Discount **${discount.code}** applied: R$${discount.original} → R$${price} (saved R$${discount.savings}).` : null,
        roblox.gamePassLink(gamePassId),
    ].filter(Boolean);
    if (cfg.gamePlaceId) {
        lines.push('', 'If you are under 13 and the purchase link is locked, request access from staff. Do not join the game to bypass the purchase restriction.');
    }
    return lines.join('\n');
}

function buildLinkButtons(cfg, gamePassId) {
    const buttons = [new ButtonBuilder().setLabel('Payment Link').setStyle(ButtonStyle.Link).setURL(roblox.gamePassLink(gamePassId))];
    return new ActionRowBuilder().addComponents(buttons);
}
