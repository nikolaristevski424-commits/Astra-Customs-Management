const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../utils/config');
const discounts = require('../utils/discounts');
const { isExecutive } = require('../utils/env');
const { parseColor } = require('../utils/embeds');

function display(discount) {
    return discount.type === 'percent' ? `${discount.amount}% off` : `R$${discount.amount} off`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('discounts')
        .setDescription('View and manage automatic discount codes.')
        .addSubcommand((sub) => sub.setName('list').setDescription('View active discount codes'))
        .addSubcommand((sub) => sub.setName('redeem').setDescription('Check and redeem a discount code').addStringOption((o) => o.setName('code').setDescription('Discount code').setRequired(true).setMaxLength(32)).addIntegerOption((o) => o.setName('subtotal').setDescription('Order subtotal in Robux').setRequired(true).setMinValue(1)))
        .addSubcommand((sub) => sub.setName('create').setDescription('Create a discount code (executive only)').addStringOption((o) => o.setName('code').setDescription('Code customers will enter').setRequired(true).setMinLength(3).setMaxLength(32)).addStringOption((o) => o.setName('type').setDescription('Discount type').setRequired(true).addChoices({ name: 'Percentage', value: 'percent' }, { name: 'Fixed Robux', value: 'fixed' })).addIntegerOption((o) => o.setName('amount').setDescription('Percent or Robux amount').setRequired(true).setMinValue(1)).addStringOption((o) => o.setName('expires').setDescription('Expiry date in UTC, YYYY-MM-DD').setRequired(true)).addIntegerOption((o) => o.setName('uses').setDescription('Maximum total redemptions').setRequired(true).setMinValue(1).setMaxValue(100000)))
        .addSubcommand((sub) => sub.setName('disable').setDescription('Disable a discount code (executive only)').addStringOption((o) => o.setName('code').setDescription('Code to disable').setRequired(true))),

    async execute(interaction) {
        const guildId = interaction.guildId;
        const cfg = config.getConfig(guildId);
        const sub = interaction.options.getSubcommand();

        if (sub === 'list') {
            const active = discounts.list(guildId);
            if (!active.length) return interaction.reply({ content: 'There are no active discount codes right now.', ephemeral: true });
            const lines = active.map((d) => `**${d.code}** — ${display(d)} — ${d.maxUses - d.uses} use(s) left — expires <t:${Math.floor(d.expiresAt / 1000)}:R>`);
            return interaction.reply({ embeds: [new EmbedBuilder().setColor(parseColor(cfg.accentColor)).setTitle('Active Discount Codes').setDescription(lines.join('\n')).setFooter({ text: 'Discounts apply to eligible order subtotals only.' })], ephemeral: true });
        }

        if (sub === 'redeem') {
            const code = interaction.options.getString('code', true);
            const subtotal = interaction.options.getInteger('subtotal', true);
            const result = discounts.redeem(guildId, code, interaction.user.id, subtotal);
            if (!result.success) {
                const messages = { invalid: 'That discount code does not exist.', expired: 'That discount code has expired.', used_up: 'That discount code has reached its usage limit.', already_used: 'You have already redeemed that code.' };
                return interaction.reply({ content: messages[result.reason] || 'That discount cannot be used.', ephemeral: true });
            }
            return interaction.reply({ content: `✅ **${result.code}** applied.\nSubtotal: **R$${subtotal}**\nSavings: **R$${result.savings}**\nDiscounted total: **R$${result.total}**`, ephemeral: true });
        }

        if (!isExecutive(interaction.member)) return interaction.reply({ content: 'Only configured executives can create or disable discount codes.', ephemeral: true });

        if (sub === 'create') {
            const code = interaction.options.getString('code', true);
            const type = interaction.options.getString('type', true);
            const amount = interaction.options.getInteger('amount', true);
            const expires = interaction.options.getString('expires', true);
            const maxUses = interaction.options.getInteger('uses', true);
            if (type === 'percent' && amount > 100) return interaction.reply({ content: 'Percentage discounts must be between 1 and 100.', ephemeral: true });
            const expiresAt = discounts.parseExpiry(expires);
            if (!expiresAt || expiresAt <= Date.now()) return interaction.reply({ content: 'Expiry must be a future date in `YYYY-MM-DD` format.', ephemeral: true });
            const result = discounts.create(guildId, { code, type, amount, expiresAt, maxUses, createdBy: interaction.user.id });
            if (!result.success) return interaction.reply({ content: 'That discount code already exists. Disable it first or choose another code.', ephemeral: true });
            return interaction.reply({ content: `Created **${result.discount.code}** for **${display(result.discount)}**, expiring <t:${Math.floor(expiresAt / 1000)}:D>, with **${maxUses}** use(s).` });
        }

        const code = interaction.options.getString('code', true);
        return interaction.reply({ content: discounts.disable(guildId, code) ? `Disabled discount code **${discounts.normalizeCode(code)}**.` : 'No discount code with that name was found.', ephemeral: true });
    },
};