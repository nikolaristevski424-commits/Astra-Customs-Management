const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../utils/config');
const perms = require('../utils/permissions');
const { parseColor } = require('../utils/embeds');
const { sendAsPanel } = require('../utils/respond');

function buildAdEmbed(cfg) {
    return new EmbedBuilder()
        .setColor(parseColor(cfg.accentColor))
        .setTitle('✨ Astra Customs')
        .setDescription([
            '**Astra Customs** is a fast-growing design community dedicated to high-quality graphics and assets for **ER:LC**.',
            'We focus on fast turnaround times, professional service, and designs that help your community stand out.',
            '',
            '*Inspired by creativity. Driven by design.*',
        ].join('\n'))
        .addFields(
            { name: '🎨 What We Offer', value: '🆓 Free releases\n📢 Free advertising channels\n🛒 Professional ordering system\n🎯 Custom design services\n💰 Designers earn 70% of completed orders, subject to rank.' },
            { name: '📌 We\'re Looking For', value: '🎨 Talented designers\n✅ Quality control staff\n🎧 Support team members\n🤝 Partnership opportunities\n📈 And many more positions!' },
            { name: '💸 Payouts', value: 'Designer payouts are typically processed every Sunday.' },
            { name: '🚀 Join Astra Customs Today', value: 'Whether you need high-quality designs or want to join our growing team, we would love to have you. We are proud to offer some of the most affordable design services available.' },
        )
        .setFooter({ text: 'Astra Customs • Inspired by creativity. Driven by design.' })
        .setTimestamp();
}

module.exports = {
    buildAdEmbed,
    data: new SlashCommandBuilder().setName('ad').setDescription('Post the Astra Customs advertisement.'),

    async execute(interaction) {
        const cfg = config.getConfig(interaction.guildId);
        if (!perms.isStaff(interaction.member, cfg)) return interaction.reply({ content: 'You do not have permission to post advertisements.', ephemeral: true });

        const buttons = [
            new ButtonBuilder().setCustomId('order_open').setLabel('Order Now').setStyle(ButtonStyle.Success).setEmoji('🛒'),
            new ButtonBuilder().setCustomId('application_staff_open').setLabel('Staff Application').setStyle(ButtonStyle.Primary).setEmoji('🧑‍💼'),
            new ButtonBuilder().setCustomId('application_designer_open').setLabel('Designer Application').setStyle(ButtonStyle.Primary).setEmoji('🎨'),
        ];
        if (cfg.discordInviteUrl) buttons.push(new ButtonBuilder().setLabel('Join Discord').setStyle(ButtonStyle.Link).setURL(cfg.discordInviteUrl).setEmoji('🔗'));

        return sendAsPanel(interaction, { embeds: [buildAdEmbed(cfg)], components: [new ActionRowBuilder().addComponents(buttons)] });
    },
};