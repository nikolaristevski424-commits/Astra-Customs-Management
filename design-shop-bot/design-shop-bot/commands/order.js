const {
    SlashCommandBuilder,
    EmbedBuilder,
    ButtonBuilder,
    ActionRowBuilder,
    ButtonStyle,
    ContainerBuilder,
    TextDisplayBuilder,
    MessageFlags,
} = require('discord.js');
const config = require('../utils/config');
const orders = require('../utils/orders');
const jobs = require('../utils/jobs');
const perms = require('../utils/permissions');
const { parseColor } = require('../utils/embeds');

// ============================================================
// Sales ledger (log / status / view / history / reset) — money
// & tax bookkeeping for a completed sale. See utils/orders.js.
// ============================================================

function orderButtons(order) {
    if (order.status === 'Void') {
        return [new ButtonBuilder().setCustomId(`order_unvoid_${order.id}`).setLabel('Unvoid').setStyle(ButtonStyle.Secondary)];
    }
    if (order.status === 'Paid') {
        return [
            new ButtonBuilder().setCustomId(`order_paid_${order.id}`).setLabel('Paid').setStyle(ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId(`order_void_${order.id}`).setLabel('Void').setStyle(ButtonStyle.Danger),
        ];
    }
    return [
        new ButtonBuilder().setCustomId(`order_paid_${order.id}`).setLabel('Mark As Paid').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`order_void_${order.id}`).setLabel('Void').setStyle(ButtonStyle.Danger),
    ];
}

function orderEmbed(cfg, order) {
    const designerTag = order.designerId ? `<@${order.designerId}>` : 'Unknown';
    const customerTag = order.customerId ? `<@${order.customerId}>` : 'Unknown';
    return new EmbedBuilder()
        .setColor(parseColor(cfg.accentColor))
        .setTitle('Order Log')
        .setDescription(`Order for **${order.product}** logged by ${designerTag}.`)
        .addFields(
            { name: 'Designer', value: designerTag, inline: true },
            { name: 'Customer', value: customerTag, inline: true },
            { name: 'Product', value: order.product, inline: true },
            { name: 'Quantity', value: `${order.quantity}`, inline: true },
            { name: 'Price (with tax)', value: `R$${order.price}`, inline: true },
            { name: 'Designer Earning', value: `R$${order.designerEarning}`, inline: true },
            { name: 'Status', value: order.status, inline: true },
        )
        .setFooter({ text: `Order ID: #${order.id}` })
        .setTimestamp(order.createdAt);
}

async function refreshOrderMessage(client, cfg, order) {
    if (!order.channelId || !order.messageId) return;
    try {
        const channel = await client.channels.fetch(order.channelId);
        const message = await channel.messages.fetch(order.messageId);
        await message.edit({
            embeds: [orderEmbed(cfg, order)],
            components: [new ActionRowBuilder().addComponents(orderButtons(order))],
        });
    } catch (err) {
        console.error('[order] Failed to refresh order message:', err.message);
    }
}

// ============================================================
// Job queue (add / list / request→accept/deny / send images /
// delete) — work assignment for designers. See utils/jobs.js.
// The Request/Accept/Deny/Send Images/Delete BUTTON handlers
// live in events/interactionCreate.js (prefix `job_` / `jobreq_`).
// ============================================================

function jobInstanceButtons(job, instance) {
    return [
        new ButtonBuilder().setCustomId(`job_sendimages_${job.orderNumber}_${instance.instance}`).setLabel('Send Images').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`job_request_${job.orderNumber}_${instance.instance}`).setLabel('Request').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`job_delete_${job.orderNumber}_${instance.instance}`).setLabel('Delete').setStyle(ButtonStyle.Danger),
    ];
}

function jobInstanceEmbed(cfg, job, instance) {
    return new EmbedBuilder()
        .setColor(parseColor(cfg.accentColor))
        .addFields(
            { name: 'Order', value: `${job.orderNumber}`, inline: true },
            { name: 'Instance', value: `${instance.instance}/${job.instances.length}`, inline: true },
            { name: 'Type', value: job.type, inline: true },
            { name: 'Channel', value: job.channelId ? `<#${job.channelId}>` : '#unknown', inline: true },
            { name: 'Designer Type', value: job.designerRoleId ? `<@&${job.designerRoleId}>` : 'Any', inline: true },
            { name: 'Notes', value: job.notes || 'None' },
        );
}

module.exports = {
    orderEmbed,
    orderButtons,
    refreshOrderMessage,
    jobInstanceButtons,
    jobInstanceEmbed,

    data: new SlashCommandBuilder()
        .setName('order')
        .setDescription('Log sales, or post and claim design jobs.')
        .addSubcommand((sub) =>
            sub
                .setName('add')
                .setDescription('Post a new job for designers to claim.')
                .addStringOption((o) => o.setName('type').setDescription('Order type, e.g. "Job livery"').setRequired(true))
                .addIntegerOption((o) => o.setName('quantity').setDescription('How many designers are needed / copies to make').setRequired(true).setMinValue(1).setMaxValue(25))
                .addRoleOption((o) => o.setName('designer_type').setDescription('Which designer role this job is for').setRequired(true))
                .addStringOption((o) => o.setName('notes').setDescription('Notes for the designer'))
                .addAttachmentOption((o) => o.setName('image1').setDescription('Reference image 1'))
                .addAttachmentOption((o) => o.setName('image2').setDescription('Reference image 2'))
                .addAttachmentOption((o) => o.setName('image3').setDescription('Reference image 3'))
                .addAttachmentOption((o) => o.setName('image4').setDescription('Reference image 4'))
                .addAttachmentOption((o) => o.setName('image5').setDescription('Reference image 5'))
        )
        .addSubcommand((sub) => sub.setName('list').setDescription('Browse open jobs available to claim.'))
        .addSubcommand((sub) =>
            sub
                .setName('log')
                .setDescription('Log a completed sale.')
                .addUserOption((o) => o.setName('customer').setDescription('Customer').setRequired(true))
                .addStringOption((o) => o.setName('product').setDescription('Product / service').setRequired(true))
                .addIntegerOption((o) => o.setName('quantity').setDescription('Quantity').setRequired(true).setMinValue(1))
                .addIntegerOption((o) => o.setName('price').setDescription('Price in Robux, tax included').setRequired(true).setMinValue(0))
        )
        .addSubcommand((sub) =>
            sub
                .setName('status')
                .setDescription('Directly set a sale\'s status.')
                .addIntegerOption((o) => o.setName('order_id').setDescription('Order ID').setRequired(true))
                .addStringOption((o) =>
                    o
                        .setName('status')
                        .setDescription('New status')
                        .setRequired(true)
                        .addChoices(...orders.STATUSES.map((s) => ({ name: s, value: s })))
                )
        )
        .addSubcommand((sub) =>
            sub.setName('view').setDescription('View one logged sale.').addIntegerOption((o) => o.setName('order_id').setDescription('Order ID').setRequired(true))
        )
        .addSubcommand((sub) =>
            sub
                .setName('history')
                .setDescription('Search logged sales.')
                .addUserOption((o) => o.setName('customer').setDescription('Filter by customer'))
                .addUserOption((o) => o.setName('designer').setDescription('Filter by designer'))
                .addStringOption((o) => o.setName('status').setDescription('Filter by status').addChoices(...orders.STATUSES.map((s) => ({ name: s, value: s }))))
        )
        .addSubcommand((sub) => sub.setName('reset').setDescription('Wipe all logged sales and reset the counter.')),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guildId;
        const cfg = config.getConfig(guildId);

        // ---- Job queue: add ----
        if (sub === 'add') {
            if (!perms.isStaff(interaction.member, cfg)) {
                return interaction.reply({ content: 'You do not have permission to post jobs.', ephemeral: true });
            }

            const type = interaction.options.getString('type', true);
            const quantity = interaction.options.getInteger('quantity', true);
            const designerRole = interaction.options.getRole('designer_type', true);
            const notes = interaction.options.getString('notes') || 'None';
            const images = ['image1', 'image2', 'image3', 'image4', 'image5']
                .map((name) => interaction.options.getAttachment(name))
                .filter(Boolean)
                .map((a) => a.url);

            const job = jobs.createJob(guildId, {
                type,
                quantity,
                notes,
                designerRoleId: designerRole.id,
                addedBy: interaction.user.id,
                images,
                channelId: interaction.channelId,
            });

            const targetChannelId = cfg.orderQueueChannelId || interaction.channelId;
            const channel = await interaction.client.channels.fetch(targetChannelId).catch(() => null);
            if (channel) {
                const container = new ContainerBuilder().setAccentColor(parseColor(cfg.accentColor));
                container.addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        [
                            '## 📋 New Order Added!',
                            `> **Order number:** ${job.orderNumber}`,
                            `> **Type:** ${type}`,
                            `> **Added by:** <@${interaction.user.id}>`,
                            `> **Designer type:** <@&${designerRole.id}>`,
                            `> **References:** ${images.length}/5 images added`,
                        ].join('\n')
                    )
                );
                await channel.send({
                    content: `<@&${designerRole.id}> <@${interaction.user.id}>`,
                    flags: MessageFlags.IsComponentsV2,
                    components: [container],
                    allowedMentions: { roles: [designerRole.id], users: [interaction.user.id] },
                });
            }

            return interaction.reply({ content: `Job \`${job.orderNumber}\` posted with ${quantity} open instance(s).`, ephemeral: true });
        }

        // ---- Job queue: list (browse open instances) ----
        if (sub === 'list') {
            const open = jobs.listOpenInstances(guildId);
            if (!open.length) return interaction.reply({ content: 'No open jobs right now.', ephemeral: true });

            await interaction.reply({ content: `Found ${open.length} open job instance(s):`, ephemeral: true });
            for (const item of open.slice(0, 10)) {
                const job = jobs.findJob(guildId, item.orderNumber);
                const instance = job.instances.find((i) => i.instance === item.instance);
                const row = new ActionRowBuilder().addComponents(jobInstanceButtons(job, instance));
                await interaction.followUp({ embeds: [jobInstanceEmbed(cfg, job, instance)], components: [row], ephemeral: true });
            }
            return;
        }

        // ---- Sales ledger ----
        if (sub === 'log') {
            if (!perms.isStaff(interaction.member, cfg)) {
                return interaction.reply({ content: 'You do not have permission to log orders.', ephemeral: true });
            }

            const customer = interaction.options.getUser('customer', true);
            const product = interaction.options.getString('product', true);
            const quantity = interaction.options.getInteger('quantity', true);
            const price = interaction.options.getInteger('price', true);

            const rate = perms.commissionRate(interaction.member, cfg);
            const afterTax = price * 0.7;
            const designerEarning = Math.round(afterTax * (rate / 100));

            const created = orders.createOrder(guildId, {
                designerId: interaction.user.id,
                customerId: customer.id,
                product,
                quantity,
                price,
                designerEarning,
            });

            const targetChannelId = cfg.orderLogChannelId || interaction.channelId;
            const channel = await interaction.client.channels.fetch(targetChannelId).catch(() => null);
            if (!channel) {
                return interaction.reply({ content: 'Order saved, but the order-log channel is not set or not reachable. Set `ORDER_LOG_CHANNEL_ID` in `.env`.', ephemeral: true });
            }

            const row = new ActionRowBuilder().addComponents(orderButtons(created));
            const sent = await channel.send({ embeds: [orderEmbed(cfg, created)], components: [row] });
            orders.updateOrder(guildId, created.id, { channelId: sent.channelId, messageId: sent.id });

            return interaction.reply({ content: `Order \`#${created.id}\` logged. Designer earning: R$${designerEarning}.`, ephemeral: true });
        }

        if (sub === 'status') {
            if (!perms.isStaff(interaction.member, cfg)) {
                return interaction.reply({ content: 'You do not have permission to edit order status.', ephemeral: true });
            }
            const id = interaction.options.getInteger('order_id', true);
            const status = interaction.options.getString('status', true);
            const order = orders.findOrder(guildId, id);
            if (!order) return interaction.reply({ content: `No order found with ID \`#${id}\`.`, ephemeral: true });

            const updated = orders.updateOrder(guildId, id, { status });
            await refreshOrderMessage(interaction.client, cfg, updated);
            return interaction.reply({ content: `Order \`#${id}\` status set to **${status}**.`, embeds: [orderEmbed(cfg, updated)], ephemeral: true });
        }

        if (sub === 'view') {
            const id = interaction.options.getInteger('order_id', true);
            const order = orders.findOrder(guildId, id);
            if (!order) return interaction.reply({ content: `No order found with ID \`#${id}\`.`, ephemeral: true });
            return interaction.reply({ embeds: [orderEmbed(cfg, order)], ephemeral: true });
        }

        if (sub === 'history') {
            const customer = interaction.options.getUser('customer');
            const designer = interaction.options.getUser('designer');
            const status = interaction.options.getString('status');
            const results = orders.listOrders(guildId, {
                customerId: customer?.id,
                designerId: designer?.id,
                status,
            });

            if (results.length === 0) return interaction.reply({ content: 'No matching orders found.', ephemeral: true });

            const lines = results
                .slice(-25)
                .reverse()
                .map((o) => `\`#${o.id}\` **${o.product}** ×${o.quantity} — R$${o.price} — ${o.status}`);

            const embed = new EmbedBuilder()
                .setColor(parseColor(cfg.accentColor))
                .setTitle('Orders')
                .setDescription(lines.join('\n'))
                .setFooter({ text: `Showing ${lines.length} of ${results.length} matching orders` });

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (sub === 'reset') {
            if (!perms.isPayoutManager(interaction.member, cfg)) {
                return interaction.reply({ content: 'You do not have permission to reset orders.', ephemeral: true });
            }
            orders.resetOrders(guildId);
            return interaction.reply({ content: 'All orders deleted and the order counter reset.', ephemeral: true });
        }
    },
};
