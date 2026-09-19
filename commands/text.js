const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const config = require('../utils/config');
const perms = require('../utils/permissions');

const TYPES = [
    { name: 'Guidelines', value: 'guidelines' },
    { name: 'Order Regulations', value: 'orderRegulations' },
    { name: 'Careers', value: 'careers' },
    { name: 'Dashboard Intro', value: 'dashboardIntro' },
    { name: 'Affiliations Intro', value: 'affiliationsIntro' },
];

module.exports = {
    TYPES,

    data: new SlashCommandBuilder()
        .setName('text')
        .setDescription('Edit the free-text content shown on panels.')
        .addSubcommand((sub) =>
            sub
                .setName('edit')
                .setDescription('Open an editor for a text block')
                .addStringOption((o) => o.setName('type').setDescription('Which block to edit').setRequired(true).addChoices(...TYPES))
        ),

    async execute(interaction) {
        const cfg = config.getConfig(interaction.guildId);
        if (!perms.isStaff(interaction.member, cfg)) {
            return interaction.reply({ content: 'You do not have permission to edit panel text.', ephemeral: true });
        }

        const type = interaction.options.getString('type', true);
        const modal = new ModalBuilder().setCustomId(`text_edit_${type}`).setTitle(`Edit: ${TYPES.find((t) => t.value === type)?.name || type}`);

        const input = new TextInputBuilder()
            .setCustomId('content')
            .setLabel('Content (markdown supported)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(3900)
            .setValue((cfg.text[type] || '').slice(0, 3900));

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
    },
};
