const { SlashCommandBuilder } = require('discord.js');

/** "2d6" -> { count: 2, sides: 6 }. Null if unparseable or out of sane bounds. */
function parseDiceNotation(input) {
    const match = /^(\d{1,2})?d(\d{1,4})$/i.exec((input || '').trim());
    if (!match) return null;
    const count = match[1] ? Number(match[1]) : 1;
    const sides = Number(match[2]);
    if (count < 1 || count > 20 || sides < 2 || sides > 1000) return null;
    return { count, sides };
}

module.exports = {
    parseDiceNotation,

    data: new SlashCommandBuilder()
        .setName('roll')
        .setDescription('Roll some dice.')
        .addStringOption((o) => o.setName('dice').setDescription('e.g. "2d6", "d20" — defaults to 1d6').setRequired(false)),

    async execute(interaction) {
        const input = interaction.options.getString('dice') || '1d6';
        const parsed = parseDiceNotation(input);
        if (!parsed) {
            return interaction.reply({ content: 'Please use dice notation like `2d6` or `d20` (up to 20 dice, up to 1000 sides).', ephemeral: true });
        }

        const rolls = Array.from({ length: parsed.count }, () => Math.floor(Math.random() * parsed.sides) + 1);
        const total = rolls.reduce((sum, r) => sum + r, 0);
        const breakdown = parsed.count > 1 ? ` (${rolls.join(' + ')})` : '';

        return interaction.reply(`🎲 Rolling **${parsed.count}d${parsed.sides}**: **${total}**${breakdown}`);
    },
};
