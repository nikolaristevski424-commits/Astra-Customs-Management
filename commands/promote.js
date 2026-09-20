const { SlashCommandBuilder, userMention, MessageFlags } = require('discord.js');
const config = require('../utils/config');
const hr = require('../utils/hr');
const perms = require('../utils/permissions');
const { buildPanel } = require('../utils/embeds');

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
            sub.setName('void').setDescription('Void a promotion').addStringOption((o) => o.setName('id').setDescription('Promotion ID, e.g. #ABCXYZ').setRequired(true))
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
                        heading: 'Staff Promotion',
                        body: `This user has been given a promotion by the HR team!\n**Staff Username** \`-\` ${userMention(user.id)}`,
                        extraBlocks: [
                            `**New Rank** \`-\` ${newRank.name}`,
                            `**Reason** \`-\` ${reason}`,
                            `**Issued by** \`-\` <@${interaction.user.id}>`,
                            `**Promotion ID** \`-\` ${promotion.promotionId}`,
                        ],
                    });
                    await channel.send({ content: `<@${user.id}>`, flags: MessageFlags.IsComponentsV2, components: [container], allowedMentions: { users: [user.id] } });
                }
            }

            return interaction.reply({ content: `Successfully promoted **${user.tag}**.\nID: \`${promotion.promotionId}\``, ephemeral: true, allowedMentions: { users: [] } });
        }

        if (sub === 'void') {
            const id = interaction.options.getString('id', true).toUpperCase();
            const removed = hr.voidPromotion(guildId, id);
            if (!removed) return interaction.reply({ content: `No promotion found with ID \`${id}\`.`, ephemeral: true });
            return interaction.reply({ content: `Promotion \`${id}\` has been **voided**.`, ephemeral: true });
        }
    },
};
