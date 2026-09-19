const { SlashCommandBuilder } = require('discord.js');

/** Deterministic 0-100 score from two user IDs, so the same pair always gets the same result. */
function compatibilityScore(idA, idB) {
    const combined = [idA, idB].sort().join('-');
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
        hash = (hash * 31 + combined.charCodeAt(i)) >>> 0;
    }
    return hash % 101;
}

function barFor(score) {
    const filled = Math.round(score / 10);
    return '💗'.repeat(filled) + '🤍'.repeat(10 - filled);
}

function verdictFor(score) {
    if (score >= 90) return "It's meant to be! 💍";
    if (score >= 70) return 'Pretty great match! 💕';
    if (score >= 50) return 'There could be something here. 😊';
    if (score >= 25) return "It's... complicated. 😅";
    return 'Maybe just friends. 😬';
}

module.exports = {
    compatibilityScore,

    data: new SlashCommandBuilder()
        .setName('ship')
        .setDescription('Calculate compatibility between two people.')
        .addUserOption((o) => o.setName('user1').setDescription('First person').setRequired(true))
        .addUserOption((o) => o.setName('user2').setDescription('Second person (defaults to you)')),

    async execute(interaction) {
        const userA = interaction.options.getUser('user1', true);
        const userB = interaction.options.getUser('user2') || interaction.user;

        const score = compatibilityScore(userA.id, userB.id);
        return interaction.reply({
            content: `💘 **${userA.username}** + **${userB.username}** = **${score}%**\n${barFor(score)}\n${verdictFor(score)}`,
            allowedMentions: { parse: [] },
        });
    },
};
