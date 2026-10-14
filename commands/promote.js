const { SlashCommandBuilder, userMention, MessageFlags } = require('discord.js');
const config = require('../utils/config');
const hr = require('../utils/hr');
const perms = require('../utils/permissions');
const { buildPanel } = require('../utils/embeds');
const { sendWithAttachments } = require('../utils/respond');
const { updateStatusPanel } = require('../utils/statusPanel');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('promote')
        .setDescription('Issue or void a staff promotion.')
        .addSubcommand((sub) =>
            sub
                .setName('issue')
                .setDescription('Issue a promotion')
                .addUserOption((o) => o.setName('user').setDescription('Staff member').setRequired(true))
                .addRoleOption((o) => o.setName('new_rank').setDescription('New rank').setRequired(true))
                .addStringOption((o) => o.setName('reason').setDescription('Reason for promotion').setRequired(true))
        )
        .addSubcommand((sub) =>
            sub.setName('void').setDescription('Void a promotion')
                .addStringOption((o) => o.setName('id').setDescription('Promotion ID, e.g. #ABCXYZ').setRequired(true))
                .addStringOption((o) => o.setName('reason').setDescription('Why the promotion is being voided'))
        ),

    async execute(interaction) {
        const guildId = interaction.guildId;
        const cfg = config.getConfig(guildId);

        if (!perms.isHR(interaction.member, cfg)) {
            return interaction.reply({ content: "You don't have permission to use this command.", ephemeral: true });
        }

        const sub = interaction.options.getSubcommand();

        if (sub === 'issue') {
            const user = interaction.options.getUser('user', true);
            const newRank = interaction.options.getRole('new_rank', true);
            const reason = interaction.options.getString('reason', true);
            await interaction.deferReply({ ephemeral: true });

            const promotion = hr.issuePromotion(guildId, {
                userId: user.id,
                issuedBy: interaction.user.id,
                newRankId: newRank.id,
                reason,
            });

            // Best-effort: give them the role too.
            const member = await interaction.guild.members.fetch(user.id).catch(() => null);
            if (member) await member.roles.add(newRank).catch(() => null);

            if (cfg.promotionsChannelId) {
                const channel = await interaction.client.channels.fetch(cfg.promotionsChannelId).catch(() => null);
                if (channel) {
                    const container = buildPanel(cfg, {
                        bannerKey: 'promotion',
                        accentColor: 0x2ecc71,
                        mention: `<@${user.id}>`,
                        heading: 'Staff Promotion',
                        body: `This user has been given a promotion by the HR team!\n**Staff Username** \`-\` ${userMention(user.id)}`,
                        extraBlocks: [
                            `**New Rank** \`-\` ${newRank.name}\n**Reason** \`-\` ${reason}`,
                            `**Issued by** \`-\` <@${interaction.user.id}>\n**Promotion ID** \`-\` ${promotion.promotionId}\n**Status** \`-\` PROMOTED`,
                        ],
                    });
                    const announcement = await sendWithAttachments(channel, { flags: MessageFlags.IsComponentsV2, components: [container], allowedMentions: { users: [user.id] } });
                    hr.updatePromotion(guildId, promotion.promotionId, { announcementChannelId: announcement.channelId, announcementMessageId: announcement.id });
                }
            }

            return interaction.editReply({ content: `Successfully promoted **${user.tag}**.\nID: \`${promotion.promotionId}\``, allowedMentions: { users: [] } });
        }

        if (sub === 'void') {
            const id = interaction.options.getString('id', true).toUpperCase();
            const reason = interaction.options.getString('reason')?.trim() || 'No reason provided.';
            const promotion = hr.voidPromotion(guildId, id, interaction.user.id, reason);
            if (!promotion) {
                const existing = hr.listPromotions(guildId).find((entry) => entry.promotionId === id);
                return interaction.reply({ content: existing ? `Promotion \`${id}\` has already been voided.` : `No promotion found with ID \`${id}\`.`, ephemeral: true });
            }

            let announcementMessage = '';
            if (promotion.announcementChannelId && promotion.announcementMessageId) {
                try {
                    const channel = await interaction.client.channels.fetch(promotion.announcementChannelId);
                    const message = await channel.messages.fetch(promotion.announcementMessageId);
                    await updateStatusPanel(message, {
                        color: 0xe74c3c,
                        heading: 'Promotion Voided',
                        details: `Promotion \`${id}\` for <@${promotion.userId}> has been voided.\n**Reason:** ${reason}`,
                    });
                    announcementMessage = ' The promotion announcement has been updated.';
                } catch (error) {
                    console.error(`[promote] Promotion ${id} was voided, but its announcement could not be updated:`, error);
                    announcementMessage = ' The promotion was voided in the audit history, but its announcement could not be updated.';
                }
            }
            return interaction.reply({ content: `Promotion \`${id}\` has been **voided** and retained in the audit history.${announcementMessage}`, ephemeral: true });
        }
    },
};
