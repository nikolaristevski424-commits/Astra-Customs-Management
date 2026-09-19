const { SlashCommandBuilder, EmbedBuilder, userMention } = require('discord.js');
const config = require('../utils/config');
const hr = require('../utils/hr');
const perms = require('../utils/permissions');
const { parseColor } = require('../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('logs')
        .setDescription('View a user\'s promotion or infraction history.')
        .addUserOption((o) => o.setName('user').setDescription('Username to view logs of').setRequired(true))
        .addStringOption((o) =>
            o
                .setName('type')
                .setDescription('Type of log to view')
                .setRequired(true)
                .addChoices({ name: 'Promotions', value: 'promotions' }, { name: 'Infractions', value: 'infractions' })
        ),

    async execute(interaction) {
        const guildId = interaction.guildId;
        const cfg = config.getConfig(guildId);
        const user = interaction.options.getUser('user', true);
        const type = interaction.options.getString('type', true);

        // Staff/HR can view anyone's logs; everyone else can only view their own.
        if (user.id !== interaction.user.id && !perms.isHR(interaction.member, cfg)) {
            return interaction.reply({ content: "You don't have permission to view someone else's logs.", ephemeral: true });
        }

        const list = type === 'infractions' ? hr.listInfractions(guildId, user.id) : hr.listPromotions(guildId, user.id);

        if (!list.length) {
            return interaction.reply({ content: `No ${type} found for ${user.username}.`, ephemeral: true });
        }

        const embeds = list.slice(-10).map((log, i) => {
            const embed = new EmbedBuilder().setColor(parseColor(cfg.accentColor)).setTitle(`${type === 'infractions' ? 'Infraction' : 'Promotion'} Log #${i + 1}`);
            if (type === 'infractions') {
                embed.addFields(
                    { name: 'User', value: userMention(log.userId), inline: true },
                    { name: 'Issued by', value: `<@${log.issuedBy}>`, inline: true },
                    { name: 'Punishment', value: log.punishment },
                    { name: 'Reason', value: log.reason },
                    { name: 'ID', value: log.infractionId },
                );
            } else {
                embed.addFields(
                    { name: 'User', value: userMention(log.userId), inline: true },
                    { name: 'Issued by', value: `<@${log.issuedBy}>`, inline: true },
                    { name: 'New Rank', value: `<@&${log.newRankId}>` },
                    { name: 'Reason', value: log.reason },
                    { name: 'ID', value: log.promotionId },
                );
            }
            return embed;
        });

        return interaction.reply({ embeds, ephemeral: true, allowedMentions: { users: [] } });
    },
};
