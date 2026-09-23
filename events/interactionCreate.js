const {
    Events,
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionsBitField,
    AttachmentBuilder,
} = require('discord.js');

const config = require('../utils/config');
const perms = require('../utils/permissions');
const orders = require('../utils/orders');
const jobsUtil = require('../utils/jobs');
const bundlesUtil = require('../utils/bundles');
const loaUtil = require('../utils/loa');
const tickets = require('../utils/tickets');
const paymentRequests = require('../utils/paymentRequests');
const packagesUtil = require('../utils/packages');
const payoutRequestsUtil = require('../utils/payoutRequests');
const releasesUtil = require('../utils/releases');
const giveawaysUtil = require('../utils/giveaways');
const qualityControlUtil = require('../utils/qualityControl');
const { isExecutive } = require('../utils/env');
const { disableAllButtons } = require('../utils/components');

const orderCmd = require('../commands/order');
const bundleCmd = require('../commands/bundle');
const packageCmd = require('../commands/package');
const qcCmd = require('../commands/qc');
const payoutCmd = require('../commands/payout');
const releaseCmd = require('../commands/release');
const giveawayCmd = require('../commands/giveaway');
const loaCmd = require('../commands/loa');
const quoteCmd = require('../commands/quote');
const paymentRequestCmd = require('../commands/paymentrequest');
const textCmd = require('../commands/text');
const activityUtil = require('../utils/activity');
const activityCmd = require('../commands/activity');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        try {
            if (interaction.isChatInputCommand()) return await handleSlash(interaction);
            if (interaction.isAutocomplete()) return await handleAutocomplete(interaction);
            if (interaction.isButton()) return await handleButton(interaction);
            if (interaction.isStringSelectMenu()) return await handleSelect(interaction);
            if (interaction.isModalSubmit()) return await handleModal(interaction);
        } catch (err) {
            console.error('[interactionCreate] Unhandled error:', err);
            const payload = { content: 'Something went wrong handling that. Check the bot console.', flags: MessageFlags.Ephemeral };
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp(payload).catch(() => {});
            } else if (interaction.isRepliable?.()) {
                await interaction.reply(payload).catch(() => {});
            }
        }
    },
};

async function handleSlash(interaction) {
    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) return;
    await command.execute(interaction);
}

async function handleAutocomplete(interaction) {
    const command = interaction.client.commands.get(interaction.commandName);
    if (!command?.autocomplete) return;
    await command.autocomplete(interaction);
}

async function handleSelect(interaction) {
    const { customId } = interaction;

    if (customId.startsWith('quote_sel_')) {
        return quoteCmd.handleSelect(interaction);
    }
}

async function handleButton(interaction) {
    const { customId } = interaction;
    const guildId = interaction.guildId;
    const cfg = config.getConfig(guildId);

    if (customId.startsWith('activity_react_')) {
        const id = customId.replace('activity_react_', '');
        const record = activityUtil.find(guildId, id);
        if (!record) return interaction.reply({ content: 'This activity check no longer exists.', ephemeral: true });
        if (!interaction.member.roles.cache.has(record.roleId)) return interaction.reply({ content: 'Only members with the selected role can react to this activity check.', ephemeral: true });
        if (record.voterIds.includes(interaction.user.id)) return interaction.reply({ content: 'You have already counted your activity on this check.', ephemeral: true });

        const updated = activityUtil.addVote(guildId, id, interaction.user.id);
        const memberCount = await activityCmd.roleMemberCount(interaction.guild, record.roleId);
        await interaction.update({ embeds: [activityCmd.buildEmbed(cfg, updated, memberCount)], components: [activityCmd.buildRow(updated)] });
        return;
    }

    // ---- Order paid/void/unvoid ----
    if (customId.startsWith('order_paid_') || customId.startsWith('order_void_') || customId.startsWith('order_unvoid_')) {
        if (!perms.isStaff(interaction.member, cfg)) return interaction.reply({ content: 'You do not have permission to do that.', ephemeral: true });

        const id = customId.split('_').pop();
        const order = orders.findOrder(guildId, id);
        if (!order) return interaction.reply({ content: 'That order no longer exists.', ephemeral: true });

        const newStatus = customId.startsWith('order_paid_') ? 'Paid' : customId.startsWith('order_void_') ? 'Void' : 'Not Paid';
        const updated = orders.updateOrder(guildId, id, { status: newStatus });

        await interaction.update({ embeds: [orderCmd.orderEmbed(cfg, updated)], components: [new ActionRowBuilder().addComponents(orderCmd.orderButtons(updated))] });
        if (newStatus === 'Void') await interaction.followUp({ content: `Order **#${id}** has been marked **VOIDED** by <@${interaction.user.id}>.`, allowedMentions: { users: [interaction.user.id] } });
        return;
    }

    // ---- Job queue: Send Images / Request / Delete ----
    if (customId.startsWith('job_sendimages_') || customId.startsWith('job_request_') || customId.startsWith('job_delete_')) {
        const parts = customId.split('_');
        const instanceNum = parts.pop();
        const orderNumber = parts.pop();
        const found = jobsUtil.findInstance(guildId, orderNumber, instanceNum);
        if (!found) return interaction.reply({ content: 'That job instance no longer exists.', ephemeral: true });
        const { job, instance } = found;

        if (customId.startsWith('job_sendimages_')) {
            if (!perms.isStaff(interaction.member, cfg)) return interaction.reply({ content: 'You do not have permission to do that.', ephemeral: true });
            if (!job.images.length) return interaction.reply({ content: 'No reference images were attached to this order.', ephemeral: true });
            return interaction.reply({ content: `Reference images for Order ${job.orderNumber}:\n${job.images.join('\n')}`, ephemeral: true });
        }

        if (customId.startsWith('job_delete_')) {
            if (!perms.isStaff(interaction.member, cfg) && interaction.user.id !== job.addedBy) {
                return interaction.reply({ content: 'You do not have permission to delete this.', ephemeral: true });
            }
            jobsUtil.deleteInstance(guildId, orderNumber, instanceNum);
            return interaction.update({ content: `Instance ${instanceNum} of Order ${orderNumber} deleted.`, embeds: [], components: [] });
        }

        if (customId.startsWith('job_request_')) {
            if (job.designerRoleId && !interaction.member.roles.cache.has(job.designerRoleId)) {
                return interaction.reply({ content: `Only <@&${job.designerRoleId}>s can request this order.`, ephemeral: true });
            }
            if (instance.status !== 'open') {
                return interaction.reply({ content: 'This instance is no longer open — someone else may have just requested it.', ephemeral: true });
            }

            jobsUtil.updateInstance(guildId, orderNumber, instanceNum, { status: 'pending', requesterId: interaction.user.id });

            const targetChannelId = cfg.orderRequestsChannelId || interaction.channelId;
            const reviewChannel = await interaction.client.channels.fetch(targetChannelId).catch(() => null);
            if (reviewChannel) {
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`jobreq_accept_${orderNumber}_${instanceNum}`).setLabel('Accept').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`jobreq_deny_${orderNumber}_${instanceNum}`).setLabel('Deny').setStyle(ButtonStyle.Danger),
                );
                await reviewChannel.send({
                    content: `<@${interaction.user.id}> is requesting Order ${orderNumber} (instance ${instanceNum}/${job.instances.length}, **${job.type}**).`,
                    components: [row],
                    allowedMentions: { parse: [] },
                });
            }

            return interaction.reply({ content: `Request sent for Order ${orderNumber}. A supervisor will review it shortly.`, ephemeral: true });
        }
    }

    // ---- Job queue: supervisor accept/deny a request ----
    if (customId.startsWith('jobreq_accept_') || customId.startsWith('jobreq_deny_')) {
        if (!perms.isStaff(interaction.member, cfg)) return interaction.reply({ content: 'You do not have permission to do that.', ephemeral: true });

        const parts = customId.split('_');
        const instanceNum = parts.pop();
        const orderNumber = parts.pop();
        const found = jobsUtil.findInstance(guildId, orderNumber, instanceNum);
        if (!found) {
            const disabled = disableAllButtons(interaction.message.components);
            await interaction.update({ components: disabled });
            return interaction.followUp({ content: 'That job instance no longer exists.', ephemeral: true });
        }

        const { instance } = found;
        const approve = customId.startsWith('jobreq_accept_');
        const requesterId = instance.requesterId;

        jobsUtil.updateInstance(guildId, orderNumber, instanceNum, approve ? { status: 'claimed', designerId: requesterId } : { status: 'open', requesterId: null });

        const disabled = disableAllButtons(interaction.message.components);
        await interaction.update({ components: disabled });
        await interaction.followUp({
            content: `${approve ? 'Accepted' : 'Denied'} <@${requesterId}>'s request for Order ${orderNumber} (instance ${instanceNum}) — decided by <@${interaction.user.id}>.`,
            allowedMentions: { parse: [] },
        });
        return;
    }

    // ---- Bundle approve/deny ----
    if (customId.startsWith('bundle_approve_') || customId.startsWith('bundle_deny_')) {
        if (!perms.isManager(interaction.member, cfg)) return interaction.reply({ content: 'You do not have permission to do that.', ephemeral: true });

        const id = customId.split('_').pop();
        const record = bundlesUtil.find(guildId, id);
        if (!record) return interaction.reply({ content: 'That bundle request no longer exists.', ephemeral: true });

        const approve = customId.startsWith('bundle_approve_');
        const updated = bundlesUtil.updateStatus(guildId, id, approve ? 'Approved' : 'Denied');

        const embed = bundleCmd.buildEmbed(cfg, updated);
        const buttons = bundleCmd.buildButtons(updated);
        await interaction.update({ embeds: [embed], components: buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [] });

        return;
    }

    // ---- Package approve/deny ----
    if (customId.startsWith('package_approve_') || customId.startsWith('package_deny_')) {
        if (!perms.isManager(interaction.member, cfg)) return interaction.reply({ content: 'You do not have permission to do that.', ephemeral: true });

        const id = customId.split('_').pop();
        const pkg = packagesUtil.find(guildId, id);
        if (!pkg) return interaction.reply({ content: 'That package no longer exists.', ephemeral: true });

        const approve = customId.startsWith('package_approve_');
        const updated = packagesUtil.updateStatus(guildId, id, approve ? 'approved' : 'denied', { decidedBy: interaction.user.id });

        const container = packageCmd.buildPackageContainer(cfg, updated);
        const buttons = packageCmd.buildReviewButtons(updated);
        await interaction.update({ components: buttons.length ? [container, new ActionRowBuilder().addComponents(buttons)] : [container] });
        return;
    }

    // ---- Package: executive-only price edit (opens a modal) ----
    if (customId.startsWith('package_editprice_')) {
        if (!isExecutive(interaction.member)) {
            return interaction.reply({ content: 'Changing a package price is restricted to the executive team.', ephemeral: true });
        }
        const id = customId.replace('package_editprice_', '');
        const pkg = packagesUtil.find(guildId, id);
        if (!pkg) return interaction.reply({ content: 'That package no longer exists.', ephemeral: true });

        const modal = new ModalBuilder().setCustomId(`package_editprice_modal_${id}_${interaction.message.channelId}_${interaction.message.id}`).setTitle(`Edit price — ${pkg.name}`.slice(0, 45));
        const priceInput = new TextInputBuilder().setCustomId('price').setLabel('New price (Robux)').setStyle(TextInputStyle.Short).setRequired(true).setValue(`${pkg.price}`);
        modal.addComponents(new ActionRowBuilder().addComponents(priceInput));
        return interaction.showModal(modal);
    }

    // ---- Payout request: mark paid / deny / try auto-send ----
    if (customId.startsWith('payout_markpaid_') || customId.startsWith('payout_deny_') || customId.startsWith('payout_autosend_')) {
        if (!isExecutive(interaction.member)) {
            return interaction.reply({ content: 'This is restricted to the executive team.', ephemeral: true });
        }

        const id = customId.split('_').pop();
        const record = payoutRequestsUtil.find(guildId, id);
        if (!record) return interaction.reply({ content: 'That payout request no longer exists.', ephemeral: true });

        if (customId.startsWith('payout_markpaid_')) {
            const updated = payoutRequestsUtil.updateStatus(guildId, id, 'Paid', { paidBy: interaction.user.id, paidAt: Date.now() });
            const row = new ActionRowBuilder().addComponents(payoutCmd.buildButtons(updated));
            await interaction.update({ embeds: [payoutCmd.buildEmbed(cfg, updated)], components: payoutCmd.buildButtons(updated).length ? [row] : [] });
            return;
        }

        if (customId.startsWith('payout_deny_')) {
            const updated = payoutRequestsUtil.updateStatus(guildId, id, 'Denied', { deniedBy: interaction.user.id });
            const row = new ActionRowBuilder().addComponents(payoutCmd.buildButtons(updated));
            await interaction.update({ embeds: [payoutCmd.buildEmbed(cfg, updated)], components: payoutCmd.buildButtons(updated).length ? [row] : [] });
            return;
        }

        if (customId.startsWith('payout_autosend_')) {
            if (!cfg.robloxGroupId || !process.env.ROBLOX_COOKIE) {
                return interaction.reply({ content: 'Auto-send needs `ROBLOX_GROUP_ID` and `ROBLOX_COOKIE` set in `.env`. Send this one manually instead.', ephemeral: true });
            }
            const robloxUserId = record.robloxId;
            if (!robloxUserId) {
                return interaction.reply({ content: 'No Roblox user ID was given with this request — can\'t auto-send. Send it manually and click Mark Paid.', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });
            const roblox = require('../utils/roblox');
            const result = await roblox.payoutGroupRobux({ groupId: cfg.robloxGroupId, robloxUserId, amount: record.amount });

            if (!result.success) {
                const reasons = {
                    no_credentials: 'No Roblox cookie configured.',
                    csrf_failed: 'Could not obtain a CSRF token from Roblox — the cookie may be expired.',
                    challenge_required: result.message,
                    request_failed: `Roblox rejected the request: ${result.message || 'unknown error'}`,
                };
                return interaction.editReply(`Auto-send failed: ${reasons[result.reason] || 'unknown error'}. This request is still pending — send it manually and click Mark Paid.`);
            }

            const updated = payoutRequestsUtil.updateStatus(guildId, id, 'Paid', { paidBy: interaction.user.id, paidAt: Date.now(), autoSent: true });
            const row = new ActionRowBuilder().addComponents(payoutCmd.buildButtons(updated));
            await interaction.message.edit({ embeds: [payoutCmd.buildEmbed(cfg, updated)], components: payoutCmd.buildButtons(updated).length ? [row] : [] }).catch(() => {});
            await interaction.editReply(`Auto-sent R$${record.amount} to Roblox user \`${robloxUserId}\` and marked this request Paid.`);
            return;
        }
    }

    // ---- Release: React toward the reaction goal ----
    if (customId.startsWith('release_react_')) {
        const id = customId.replace('release_react_', '');
        const release = releasesUtil.find(guildId, id);
        if (!release) return interaction.reply({ content: 'This release no longer exists.', ephemeral: true });
        if (release.status === 'reached') return interaction.reply({ content: 'This goal has already been reached!', ephemeral: true });
        if (release.reactedUserIds.includes(interaction.user.id)) return interaction.reply({ content: 'You already reacted to this one!', ephemeral: true });

        const updated = releasesUtil.addReaction(guildId, id, interaction.user.id);

        if (updated.reactedUserIds.length >= updated.goal) {
            releasesUtil.updateStatus(guildId, id, 'reached');
            const finalRelease = releasesUtil.find(guildId, id);
            await interaction.update({ embeds: [releaseCmd.buildEmbed(cfg, finalRelease)], components: [] });

            // Re-download and re-post the file fresh so the download isn't tied to a
            // potentially-expiring original attachment URL.
            try {
                const buffer = await releaseCmd.downloadFile(finalRelease.fileUrl);
                const file = new AttachmentBuilder(buffer, { name: finalRelease.fileName });
                await interaction.channel.send({
                    content: '<@&1511583479240986674> 🎉 Goal reached! The free release is unlocked. Download below:',
                    files: [file],
                    allowedMentions: { roles: ['1511583479240986674'] },
                });
            } catch (err) {
                console.error('[release] Failed to re-post file:', err.message);
                await interaction.channel.send({
                    content: `<@&1511583479240986674> 🎉 Goal reached! Download: ${finalRelease.fileUrl}`,
                    allowedMentions: { roles: ['1511583479240986674'] },
                }).catch(() => {});
            }
            return;
        }

        await interaction.update({ embeds: [releaseCmd.buildEmbed(cfg, updated)], components: [releaseCmd.buildRow(updated)] });
        return;
    }

    // ---- Would You Rather: pick a side (no persistence, just a fun ack) ----
    if (customId === 'wyr_a' || customId === 'wyr_b') {
        return interaction.reply({ content: `You picked **Option ${customId === 'wyr_a' ? 'A' : 'B'}**! 🎉`, ephemeral: true });
    }

    // ---- Giveaway: enter ----
    if (customId.startsWith('giveaway_enter_')) {
        const id = customId.replace('giveaway_enter_', '');
        const giveaway = giveawaysUtil.find(guildId, id);
        if (!giveaway) return interaction.reply({ content: 'This giveaway no longer exists.', ephemeral: true });
        if (giveaway.status === 'ended') return interaction.reply({ content: 'This giveaway has already ended.', ephemeral: true });
        if (giveaway.entrantIds.includes(interaction.user.id)) {
            return interaction.reply({ content: 'You\'re already entered! Good luck 🍀', ephemeral: true });
        }

        const updated = giveawaysUtil.addEntrant(guildId, id, interaction.user.id);
        await interaction.reply({ content: `You're entered into the giveaway for **${giveaway.prize}**! Good luck 🍀`, ephemeral: true });
        await interaction.message.edit({ embeds: [giveawayCmd.buildEmbed(cfg, updated)], components: [giveawayCmd.buildRow(updated)] }).catch(() => {});
        return;
    }

    // ---- Payment request paid/decline ----
    if (customId.startsWith('payreq_paid_') || customId.startsWith('payreq_decline_')) {
        if (!perms.isStaff(interaction.member, cfg)) return interaction.reply({ content: 'You do not have permission to do that.', ephemeral: true });

        const id = customId.split('_').pop();
        const record = paymentRequests.find(guildId, id);
        if (!record) return interaction.reply({ content: 'That payment request no longer exists.', ephemeral: true });

        const status = customId.startsWith('payreq_paid_') ? 'Paid' : 'Declined';
        const updated = paymentRequests.updateStatus(guildId, id, status);

        const container = paymentRequestCmd.buildContainer(cfg, updated);
        const buttons = paymentRequestCmd.buildButtons(updated);
        const components = buttons.length ? [container, new ActionRowBuilder().addComponents(buttons)] : [container];
        await interaction.update({ flags: MessageFlags.IsComponentsV2, components });
        return;
    }

    // ---- LOA approve/deny ----
    if (customId.startsWith('loa_approve_') || customId.startsWith('loa_deny_')) {
        if (!perms.isHR(interaction.member, cfg)) return interaction.reply({ content: 'You do not have permission to do that.', ephemeral: true });

        const id = customId.replace('loa_approve_', '').replace('loa_deny_', '');
        const record = loaUtil.get(guildId, id);
        if (!record) return interaction.reply({ content: 'That LOA request no longer exists.', ephemeral: true });

        const approve = customId.startsWith('loa_approve_');
        loaUtil.setStatus(guildId, id, approve ? 'approved' : 'denied', { decidedBy: interaction.user.id, decidedAt: Date.now() });

        if (approve && cfg.loaRoleId) {
            const member = await interaction.guild.members.fetch(record.userId).catch(() => null);
            if (member) await member.roles.add(cfg.loaRoleId).catch(() => null);
        }

        const disabled = disableAllButtons(interaction.message.components);
        await interaction.update({ components: disabled });
        await interaction.followUp({ content: `LOA \`${id}\` ${approve ? 'approved' : 'denied'} by <@${interaction.user.id}>.`, allowedMentions: { parse: [] } });
        return;
    }

    // ---- Guidelines panel sub-buttons ----
    if (customId.startsWith('guidelines_view_')) {
        const type = customId.replace('guidelines_view_', '');
        return interaction.reply({ content: cfg.text[type] || 'Nothing has been set yet.', ephemeral: true });
    }

    // ---- Dashboard: Help (open ticket) ----
    if (customId === 'order_open') {
        const modal = new ModalBuilder().setCustomId('order_open_modal').setTitle('New Order');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('product').setLabel('What would you like designed?').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(120)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('style').setLabel('Design style / vibe').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(120)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('deadline').setLabel('Deadline / preferred finish date').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(120)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('budget').setLabel('Budget in Robux').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('references').setLabel('Any references / examples?').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('details').setLabel('Tell us more about the order').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1800)),
        );
        return interaction.showModal(modal);
    }

    if (customId === 'help_ticket_open') {
        const modal = new ModalBuilder().setCustomId('ticket_open_modal').setTitle('Open a Ticket');
        const reasonInput = new TextInputBuilder().setCustomId('reason').setLabel('What do you need help with?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000);
        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
        return interaction.showModal(modal);
    }

    // ---- Dashboard: staff/designer applications ----
    if (customId === 'application_staff_open' || customId === 'application_designer_open') {
        const type = customId === 'application_staff_open' ? 'staff' : 'designer';
        const modal = new ModalBuilder().setCustomId(`application_${type}_modal`).setTitle(`${type === 'staff' ? 'Staff' : 'Designer'} Application`);
        const questions = type === 'staff'
            ? [
                  ['why_join', 'Why should we choose you for the team?', TextInputStyle.Paragraph, 1000],
                  ['activity', 'How active can you be from 1-10?', TextInputStyle.Short, 10],
                  ['experience', 'What experience do you have?', TextInputStyle.Paragraph, 1000],
                  ['difficult_customer', 'How would you handle a difficult customer?', TextInputStyle.Paragraph, 1000],
                  ['roblox_username', 'Roblox Username', TextInputStyle.Short, 50],
              ]
            : [
                  ['why_join', 'Why do you want to join as a designer?', TextInputStyle.Paragraph, 1000],
                  ['portfolio', 'Portfolio link(s)', TextInputStyle.Short, 500],
                  ['software', 'What software do you use?', TextInputStyle.Short, 300],
                  ['specialties', 'What do you specialize in?', TextInputStyle.Paragraph, 700],
                  ['roblox_username', 'Roblox Username', TextInputStyle.Short, 50],
              ];
        modal.addComponents(...questions.map(([id, label, style, maxLength]) => new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(true).setMaxLength(maxLength))));
        return interaction.showModal(modal);
    }

    // ---- Application accept/deny ----
    if (customId.startsWith('app_accept_') || customId.startsWith('app_deny_')) {
        const parts = customId.split('_');
        const type = parts[2];
        const applicantId = parts[3];
        const canReview = perms.isAdmin(interaction.member) || interaction.member.roles.cache.has(cfg.applicationReviewerRoleId);
        if (!canReview) return interaction.reply({ content: 'Only the configured application reviewers can decide applications.', ephemeral: true });

        const accept = customId.startsWith('app_accept_');
        const applicant = await interaction.client.users.fetch(applicantId).catch(() => null);

        const acceptedRoleId = type === 'staff' ? cfg.staffApplicationAcceptRoleId : cfg.designerApplicationAcceptRoleId;
        if (accept && acceptedRoleId) {
            const member = await interaction.guild.members.fetch(applicantId).catch(() => null);
            if (member) await member.roles.add(acceptedRoleId).catch(() => null);
        }

        if (applicant) {
            await applicant
                .send(accept ? `Congratulations! Your **${type} application** to **${cfg.brandName}** was accepted by <@${interaction.user.id}>.` : `Thanks for applying to **${cfg.brandName}**. Your **${type} application** was not accepted this time. You are welcome to apply again later.`)
                .catch(() => {});
        }

        if (cfg.applicationResultsChannelId) {
            const resultsChannel = await interaction.client.channels.fetch(cfg.applicationResultsChannelId).catch(() => null);
            if (resultsChannel) {
                await resultsChannel.send({
                    embeds: [{
                        title: `${type === 'staff' ? 'Staff' : 'Designer'} Application ${accept ? 'Accepted' : 'Denied'}`,
                        color: accept ? 0x2ecc71 : 0xe74c3c,
                        fields: [
                            { name: 'Applicant', value: `<@${applicantId}>`, inline: true },
                            { name: 'Reviewed by', value: `<@${interaction.user.id}>`, inline: true },
                        ],
                        timestamp: new Date().toISOString(),
                    }],
                }).catch(() => {});
            }
        }

        const disabled = disableAllButtons(interaction.message.components);
        await interaction.update({ components: disabled });
        await interaction.followUp({ content: `${type === 'staff' ? 'Staff' : 'Designer'} application ${accept ? 'accepted' : 'denied'} by <@${interaction.user.id}>.`, allowedMentions: { parse: [] } });
        return;
    }

    // ---- Ticket claim/close ----
    if (customId.startsWith('ticket_claim_')) {
        if (!perms.isTicketStaff(interaction.member, cfg)) return interaction.reply({ content: 'You do not have permission to claim tickets.', ephemeral: true });
        const channelId = customId.replace('ticket_claim_', '');
        const ticket = tickets.get(guildId, channelId);
        if (!ticket) return interaction.reply({ content: 'This ticket is no longer tracked.', ephemeral: true });
        const updated = tickets.update(guildId, channelId, { claimedBy: interaction.user.id, claimedAt: Date.now() });
        const embed = ticket.type === 'order'
            ? {
                  title: 'New Order',
                  description: 'Please send any references in this channel. A designer will review your request as soon as possible.',
                  color: 0x2d2d31,
                  fields: [
                      { name: 'Product', value: ticket.product, inline: false },
                      { name: 'Deadline', value: ticket.deadline, inline: true },
                      { name: 'Budget', value: ticket.budget, inline: true },
                      { name: 'Order Information', value: ticket.details, inline: false },
                      { name: 'Claimed by', value: `<@${updated.claimedBy}>`, inline: true },
                  ],
                  footer: { text: `Order ticket • claimed by ${interaction.user.tag}` },
              }
            : {
                  title: 'Support Ticket',
                  description: updated.reason,
                  color: 0x2d2d31,
                  fields: [
                      { name: 'Opened by', value: `<@${updated.userId}>`, inline: true },
                      { name: 'Claimed by', value: `<@${updated.claimedBy}>`, inline: true },
                  ],
                  footer: { text: `Ticket ID: ${channelId}` },
              };
        await interaction.update({
            embeds: [embed],
            components: interaction.message.components,
        });
        return;
    }

    if (customId.startsWith('ticket_close_confirm_')) {
        const channelId = customId.replace('ticket_close_confirm_', '');
        const ticket = tickets.get(guildId, channelId);
        if (!perms.isTicketStaff(interaction.member, cfg) && interaction.user.id !== ticket?.userId) {
            return interaction.reply({ content: 'You do not have permission to close this ticket.', ephemeral: true });
        }
        await interaction.update({ content: 'Closing this ticket in 5 seconds...', components: [] });
        setTimeout(() => closeTicket(interaction, guildId, cfg, channelId), 5000);
        return;
    }

    if (customId.startsWith('ticket_close_cancel_')) {
        await interaction.update({ content: 'Close cancelled.', components: [] });
        return;
    }

    if (customId.startsWith('ticket_close_')) {
        const channelId = customId.replace('ticket_close_', '');
        const ticket = tickets.get(guildId, channelId);
        if (!perms.isTicketStaff(interaction.member, cfg) && interaction.user.id !== ticket?.userId) {
            return interaction.reply({ content: 'You do not have permission to close this ticket.', ephemeral: true });
        }
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ticket_close_confirm_${channelId}`).setLabel('Confirm Close').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`ticket_close_cancel_${channelId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
        );
        return interaction.reply({ content: 'Are you sure you want to close this ticket?', components: [row], ephemeral: true });
    }

    // ---- Quality control: accept/deny ----
    if (customId.startsWith('qc_accept_') || customId.startsWith('qc_deny_')) {
        if (!perms.isQualityControl(interaction.member, cfg)) return interaction.reply({ content: 'You do not have permission to review quality control submissions.', ephemeral: true });

        const id = customId.split('_').pop();
        const record = qualityControlUtil.find(guildId, id);
        if (!record) return interaction.reply({ content: 'That submission no longer exists.', ephemeral: true });

        const accept = customId.startsWith('qc_accept_');
        const updated = qualityControlUtil.updateStatus(guildId, id, accept ? 'accepted' : 'denied', { decidedBy: interaction.user.id });

        const embed = qcCmd.buildEmbed(cfg, updated);
        const buttons = qcCmd.buildButtons(updated);
        await interaction.update({ embeds: [embed], components: buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [] });
        return;
    }
}

async function closeTicket(interaction, guildId, cfg, channelId) {
    const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    if (cfg.transcriptChannelId) {
        try {
            const messages = await channel.messages.fetch({ limit: 100 });
            const sorted = [...messages.values()].reverse();
            const text = sorted.map((m) => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content}`).join('\n');
            const transcriptChannel = await interaction.client.channels.fetch(cfg.transcriptChannelId).catch(() => null);
            if (transcriptChannel) {
                const file = new AttachmentBuilder(Buffer.from(text || 'No messages.', 'utf8'), { name: `transcript-${channel.name}.txt` });
                await transcriptChannel.send({ content: `Transcript for **#${channel.name}**`, files: [file] });
            }
        } catch (err) {
            console.error('[tickets] Failed to build transcript:', err.message);
        }
    }

    tickets.remove(guildId, channelId);
    await channel.delete().catch(() => {});
}

async function handleModal(interaction) {
    const { customId } = interaction;
    const guildId = interaction.guildId;
    const cfg = config.getConfig(guildId);

    if (customId === 'order_open_modal') {
        const product = interaction.fields.getTextInputValue('product');
        const style = interaction.fields.getTextInputValue('style') || 'Not specified';
        const deadline = interaction.fields.getTextInputValue('deadline');
        const budget = interaction.fields.getTextInputValue('budget');
        const references = interaction.fields.getTextInputValue('references') || 'None provided';
        const details = interaction.fields.getTextInputValue('details');

        if (!cfg.orderCategoryId) {
            return interaction.reply({ content: 'Ordering is not configured yet. Ask an administrator to set `ORDER_CATEGORY_ID` in `.env`.', ephemeral: true });
        }

        const existing = tickets.findOpenForUser(guildId, interaction.user.id);
        if (existing) return interaction.reply({ content: `You already have an open ticket: <#${existing.channelId}>`, ephemeral: true });

        await interaction.deferReply({ ephemeral: true });
        const ticketStaffRoleIds = cfg.ticketStaffRoleIds?.length ? cfg.ticketStaffRoleIds : cfg.staffRoleIds;
        const overwrites = [
            { id: interaction.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
            ...ticketStaffRoleIds.map((roleId) => ({ id: roleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] })),
        ];
        const channel = await interaction.guild.channels.create({
            name: `order-${interaction.user.username}`.slice(0, 90),
            type: ChannelType.GuildText,
            parent: cfg.orderCategoryId,
            permissionOverwrites: overwrites,
        });

        const ticket = tickets.create(guildId, channel.id, { userId: interaction.user.id, reason: product, type: 'order', product, deadline, budget, details, style, references });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ticket_claim_${channel.id}`).setLabel('Claim').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`ticket_close_${channel.id}`).setLabel('Close').setStyle(ButtonStyle.Danger),
        );
        await channel.send({
            content: `<@${interaction.user.id}>${ticketStaffRoleIds[0] ? ` <@&${ticketStaffRoleIds[0]}>` : ''}`,
            embeds: [{
                title: 'New Order Request',
                description: 'A designer will review this request and respond in this channel as soon as possible.',
                color: 0x1e90ff,
                fields: [
                    { name: 'Product', value: product || 'Not specified', inline: false },
                    { name: 'Style / Vibe', value: style || 'Not specified', inline: true },
                    { name: 'Deadline', value: deadline || 'Not specified', inline: true },
                    { name: 'Budget', value: budget || 'Not specified', inline: true },
                    { name: 'References', value: references || 'None provided', inline: false },
                    { name: 'Details', value: details || 'No extra details provided', inline: false },
                    { name: 'Status', value: 'Open', inline: true },
                ],
                footer: { text: `Order ticket • ${ticket.createdAt ? new Date(ticket.createdAt).toLocaleString() : ''}` },
                timestamp: new Date().toISOString(),
            }],
            components: [row],
            allowedMentions: { users: [interaction.user.id], roles: ticketStaffRoleIds.slice(0, 1) },
        });
        return interaction.editReply(`Your order request is ready: <#${channel.id}>`);
    }

    if (customId === 'ticket_open_modal') {
        const reason = interaction.fields.getTextInputValue('reason');

        if (!cfg.ticketCategoryId) {
            return interaction.reply({ content: 'No ticket category is configured. Set `TICKET_CATEGORY_ID` in `.env`.', ephemeral: true });
        }

        const existing = tickets.findOpenForUser(guildId, interaction.user.id);
        if (existing) {
            return interaction.reply({ content: `You already have an open ticket: <#${existing.channelId}>`, ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const overwrites = [
            { id: interaction.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
        ];
        const ticketStaffRoleIds = cfg.ticketStaffRoleIds?.length ? cfg.ticketStaffRoleIds : cfg.staffRoleIds;
        for (const roleId of ticketStaffRoleIds) {
            overwrites.push({ id: roleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] });
        }

        const channel = await interaction.guild.channels.create({
            name: `ticket-${interaction.user.username}`.slice(0, 90),
            type: ChannelType.GuildText,
            parent: cfg.ticketCategoryId,
            permissionOverwrites: overwrites,
        });

        tickets.create(guildId, channel.id, { userId: interaction.user.id, reason, staffRoleIds: ticketStaffRoleIds });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ticket_claim_${channel.id}`).setLabel('Claim').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`ticket_close_${channel.id}`).setLabel('Close').setStyle(ButtonStyle.Danger),
        );

        await channel.send({
            content: `<@${interaction.user.id}>${ticketStaffRoleIds[0] ? ` <@&${ticketStaffRoleIds[0]}>` : ''}`,
            embeds: [
                {
                    title: 'New Support Ticket',
                    description: reason,
                    color: 0x2d2d31,
                    fields: [
                        { name: 'Opened by', value: `<@${interaction.user.id}>`, inline: true },
                        { name: 'Status', value: 'Open', inline: true },
                    ],
                    footer: { text: `Ticket ID: ${channel.id}` },
                },
            ],
            components: [row],
            allowedMentions: { users: [interaction.user.id], roles: ticketStaffRoleIds.slice(0, 1) },
        });

        await interaction.editReply(`Ticket opened: <#${channel.id}>`);
        return;
    }

    if (customId === 'application_staff_modal' || customId === 'application_designer_modal') {
        const type = customId === 'application_staff_modal' ? 'staff' : 'designer';
        const answers = Object.fromEntries(['why_join', 'activity', 'experience', 'difficult_customer', 'roblox_username', 'portfolio', 'software', 'specialties']
            .map((field) => [field, interaction.fields.fields.has(field) ? interaction.fields.getTextInputValue(field) : null]));

        await interaction.deferReply({ ephemeral: true });

        if (!cfg.applicationsChannelId) {
            return interaction.editReply('Applications are not configured yet. Ask an administrator to set `APPLICATIONS_CHANNEL_ID` in `.env`.');
        }

        const channel = await interaction.client.channels.fetch(cfg.applicationsChannelId).catch(() => null);
        if (!channel?.isTextBased?.() || channel.isDMBased?.()) {
            return interaction.editReply('The configured applications channel is not a usable server text channel. Please contact an administrator.');
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`app_accept_${type}_${interaction.user.id}`).setLabel('Accept').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`app_deny_${type}_${interaction.user.id}`).setLabel('Deny').setStyle(ButtonStyle.Danger),
        );
        const fields = [
            { name: 'Applicant', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Application type', value: type === 'staff' ? 'Staff' : 'Designer', inline: true },
            { name: 'Roblox Username', value: answers.roblox_username, inline: true },
            { name: 'Why join?', value: answers.why_join },
        ];
        if (type === 'staff') {
            fields.push(
                { name: 'Activity (1-10)', value: answers.activity, inline: true },
                { name: 'Experience', value: answers.experience },
                { name: 'Difficult customer response', value: answers.difficult_customer },
            );
        } else {
            fields.push(
                { name: 'Portfolio', value: answers.portfolio },
                { name: 'Software', value: answers.software, inline: true },
                { name: 'Specialties', value: answers.specialties },
            );
        }
        try {
            await channel.send({
                content: cfg.applicationReviewerRoleId ? `<@&${cfg.applicationReviewerRoleId}>` : undefined,
                embeds: [{ title: `${type === 'staff' ? 'Staff' : 'Designer'} Application`, color: 0x2d2d31, fields, footer: { text: 'Review the application and choose Accept or Deny.' }, timestamp: new Date().toISOString() }],
                components: [row],
                allowedMentions: { roles: cfg.applicationReviewerRoleId ? [cfg.applicationReviewerRoleId] : [] },
            });
        } catch (error) {
            console.error('[applications] Failed to send application:', error.message);
            return interaction.editReply('Your application could not be delivered. Please contact an administrator to check the applications channel permissions.');
        }

        await interaction.user.send(`Your **${type} application** was submitted to **${cfg.brandName}**. The team will review it and DM you when a decision is made.`).catch(() => {});

        return interaction.editReply('Your application has been submitted!');
    }

    if (customId.startsWith('text_edit_')) {
        if (!perms.isStaff(interaction.member, cfg)) {
            return interaction.reply({ content: 'You do not have permission to edit panel text.', ephemeral: true });
        }
        const type = customId.replace('text_edit_', '');
        const content = interaction.fields.getTextInputValue('content');
        config.setNested(guildId, 'text', { [type]: content });
        return interaction.reply({ content: `Updated **${textCmd.TYPES.find((t) => t.value === type)?.name || type}**.`, ephemeral: true });
    }

    if (customId === 'loa_request_modal') {
        const result = await loaCmd.submitRequest(interaction, {
            startInput: interaction.fields.getTextInputValue('start'),
            endInput: interaction.fields.getTextInputValue('end'),
            reason: interaction.fields.getTextInputValue('reason'),
        });
        return interaction.reply({ content: result.message, ephemeral: true });
    }

    if (customId.startsWith('package_editprice_modal_')) {
        const parts = customId.replace('package_editprice_modal_', '').split('_');
        const [id, reviewChannelId, reviewMessageId] = parts;
        if (!isExecutive(interaction.member)) {
            return interaction.reply({ content: 'Changing a package price is restricted to the executive team.', ephemeral: true });
        }
        const raw = interaction.fields.getTextInputValue('price');
        const price = Number(raw);
        if (!Number.isFinite(price) || price < 0) {
            return interaction.reply({ content: `"${raw}" isn't a valid price.`, ephemeral: true });
        }

        const updated = packagesUtil.setPrice(guildId, id, price, interaction.user.id);
        if (!updated) return interaction.reply({ content: 'That package no longer exists.', ephemeral: true });

        // Refresh the live review message so reviewers see the new price immediately.
        if (reviewChannelId && reviewMessageId) {
            const reviewChannel = await interaction.client.channels.fetch(reviewChannelId).catch(() => null);
            const reviewMessage = await reviewChannel?.messages.fetch(reviewMessageId).catch(() => null);
            if (reviewMessage) {
                const container = packageCmd.buildPackageContainer(cfg, updated);
                const buttons = packageCmd.buildReviewButtons(updated);
                await reviewMessage.edit({ components: buttons.length ? [container, new ActionRowBuilder().addComponents(buttons)] : [container] }).catch(() => {});
            }
        }

        return interaction.reply({ content: `Package \`#${id}\` price updated to R$${price}.`, ephemeral: true });
    }
}
