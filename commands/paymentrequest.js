const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require('discord.js');
const config = require('../utils/config');
const perms = require('../utils/permissions');
const paymentRequests = require('../utils/paymentRequests');
const { receiveForPay } = require('../utils/tax');
const { parseColor } = require('../utils/embeds');
const { disableAllButtons } = require('../utils/components');

function buildContainer(cfg, record) {
    const container = new ContainerBuilder().setAccentColor(parseColor(cfg.accentColor));

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            [
                '## Payment Request',
                `**From:** <@${record.requestedBy}>`,
                '',
                `**Order Type**\n${record.orderType}`,
                `**Payment Link**\n${record.paymentLink}`,
                `**Customer Username**\n${record.customerUsername}`,
                `**Order Channel**\n<#${record.orderChannelId}>`,
                `**Payment Request Date**\n<t:${Math.floor(record.createdAt / 1000)}:R>`,
                `**Designer Roblox Username**\n${record.designerRobloxUsername}`,
                '',
                `**Status**\n${record.status}`,
            ].join('\n')
        )
    );

    container.addSeparatorComponents(new SeparatorBuilder());

    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            [
                '## Price calculations',
                `**Price on payment link:** R$${record.price}`,
                `**After Roblox TAX:** R$${record.afterTax}`,
                `**Robux to payout:** R$${record.payout}`,
            ].join('\n')
        )
    );

    return container;
}

function buildButtons(record) {
    if (record.status !== 'Awaiting Payment') return [];
    return [
        new ButtonBuilder().setCustomId(`payreq_paid_${record.id}`).setLabel('Paid').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`payreq_decline_${record.id}`).setLabel('Decline').setStyle(ButtonStyle.Danger),
    ];
}

module.exports = {
    buildContainer,
    buildButtons,
    disableAllButtons,

    data: new SlashCommandBuilder()
        .setName('paymentrequest')
        .setDescription('Create a payment request for an order.')
        .addStringOption((o) => o.setName('order_type').setDescription('e.g. "Staff liveryx2"').setRequired(true))
        .addStringOption((o) => o.setName('payment_link').setDescription('Roblox game pass payment link').setRequired(true))
        .addStringOption((o) => o.setName('customer_username').setDescription('Customer\'s Roblox username').setRequired(true))
        .addStringOption((o) => o.setName('designer_roblox_username').setDescription('Designer\'s Roblox username').setRequired(true))
        .addIntegerOption((o) => o.setName('price').setDescription('Price on the payment link, in Robux').setRequired(true).setMinValue(1)),

    async execute(interaction) {
        const guildId = interaction.guildId;
        const cfg = config.getConfig(guildId);

        if (!perms.isStaff(interaction.member, cfg)) {
            return interaction.reply({ content: 'You do not have permission to create payment requests.', ephemeral: true });
        }

        const orderType = interaction.options.getString('order_type', true);
        const paymentLink = interaction.options.getString('payment_link', true);
        const customerUsername = interaction.options.getString('customer_username', true);
        const designerRobloxUsername = interaction.options.getString('designer_roblox_username', true);
        const price = interaction.options.getInteger('price', true);

        const afterTax = receiveForPay(price);
        const rate = perms.commissionRate(interaction.member, cfg);
        const payout = Math.round(afterTax * (rate / 100));

        const record = paymentRequests.create(guildId, {
            requestedBy: interaction.user.id,
            orderType,
            paymentLink,
            customerUsername,
            designerRobloxUsername,
            orderChannelId: interaction.channelId,
            price,
            afterTax,
            payout,
        });

        const container = buildContainer(cfg, record);
        const row = new ActionRowBuilder().addComponents(buildButtons(record));

        const targetChannelId = cfg.orderLogChannelId || interaction.channelId;
        const channel = await interaction.client.channels.fetch(targetChannelId).catch(() => null);
        if (!channel) return interaction.reply({ content: 'Payment request saved, but the order-log channel is not reachable. Set `ORDER_LOG_CHANNEL_ID` in `.env`.', ephemeral: true });

        const sent = await channel.send({ flags: MessageFlags.IsComponentsV2, components: [container, row] });
        paymentRequests.attachMessage(guildId, record.id, sent.id, sent.channelId);

        return interaction.reply({ content: `Payment request \`#${record.id}\` created.`, ephemeral: true });
    },
};
