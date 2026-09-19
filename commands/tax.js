const { SlashCommandBuilder } = require('discord.js');
const config = require('../utils/config');
const { sendAsPanel } = require('../utils/respond');
const { receiveForPay, payForReceive } = require('../utils/tax');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tax')
        .setDescription('Calculate Roblox\'s 30% marketplace tax both ways for an amount.')
        .addIntegerOption((o) => o.setName('amount').setDescription('Amount in Robux').setRequired(true).setMinValue(1)),

    async execute(interaction) {
        const cfg = config.getConfig(interaction.guildId);
        const amount = interaction.options.getInteger('amount', true);

        const mustBePaid = payForReceive(amount);
        const willReceive = receiveForPay(amount);

        const lines = [
            '📢 **Tax Calculated!**',
            '',
            `> To get **R$${amount}** you need to be paid **R$${mustBePaid}**`,
            `> While being paid **R$${amount}** you will receive **R$${willReceive}**`,
        ];

        if (cfg.bannerUrl) {
            lines.push('', cfg.bannerUrl);
        }

        return sendAsPanel(interaction, { content: lines.join('\n') });
    },
};
