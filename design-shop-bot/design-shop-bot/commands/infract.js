const {
    SlashCommandBuilder,
    userMention,
    MessageFlags,
} = require('discord.js');
const config = require('../utils/config');
const hr = require('../utils/hr');
const perms = require('../utils/permissions');
const { buildPanel } = require('../utils/embeds');

const PUNISHMENTS = ['Notice', 'Warning', 'Strike', 'Suspension', 'Under Investigation', 'Termination', 'Staff Blacklist'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('infract')
        .setDescription('Issue or void a staff infraction.')
        .addSubcommand((sub) =>
            sub
                .setName('issue')
                .setDescription('Issue an infraction')
                .addUserOption((o) => o.setName('user').setDescription('Staff member').setRequired(true))
                .addStringOption((o) => o.setName('punishment').setDescription('Punishment').setRequired(true).addChoices(...PUNISHMENTS.map((p) => ({ name: p, value: p }))))
                .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true))
        )
        .addSubcommand((sub) =>
            sub.setName('void').setDescription('Void an infraction').addStringOption((o) => o.setName('id').setDescription('Infraction ID, e.g. #ABCXYZ').setRequired(true))
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
            const punishment = interaction.options.getString('punishment', true);
            const reason = interaction.options.getString('reason', true);

            const infraction = hr.issueInfraction(guildId, {
                userId: user.id,
                issuedBy: interaction.user.id,
                punishment,
                reason,
            });

            if (cfg.infractionsChannelId) {
                const channel = await interaction.client.channels.fetch(cfg.infractionsChannelId).catch(() => null);
                if (channel) {
                    const container = buildPanel(cfg, {
                        heading: 'Staff Punishment',
                        body: `This user has received a punishment from the HR team.\n**Staff Username** \`-\` ${userMention(user.id)}`,
                        extraBlocks: [
                            `**Punishment** \`-\` ${punishment}`,
                            `**Reason** \`-\` ${reason}`,
                            `**Issued by** \`-\` <@${interaction.user.id}>`,
                            `**Infraction ID** \`-\` ${infraction.infractionId}`,
                        ],
                    });
                    await channel.send({ flags: MessageFlags.IsComponentsV2, components: [container], allowedMentions: { parse: [] } });
                }
            }

            return interaction.reply({ content: `Successfully infracted **${user.tag}**.\nID: \`${infraction.infractionId}\``, ephemeral: true, allowedMentions: { users: [] } });
        }

        if (sub === 'void') {
            const id = interaction.options.getString('id', true).toUpperCase();
            const removed = hr.voidInfraction(guildId, id);
            if (!removed) return interaction.reply({ content: `No infraction found with ID \`${id}\`.`, ephemeral: true });
            return interaction.reply({ content: `Infraction \`${id}\` has been **voided**.`, ephemeral: true });
        }
    },
};
