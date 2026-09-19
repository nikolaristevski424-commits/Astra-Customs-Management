const { SlashCommandBuilder } = require('discord.js');
const store = require('../utils/store');
const config = require('../utils/config');
const perms = require('../utils/permissions');

const STORE = 'affiliations';

function list(guildId) {
    return store.get(STORE, guildId, []);
}

function add(guildId, name, invite) {
    return store.update(STORE, guildId, [], (all) => {
        all.push({ name, invite, addedAt: Date.now() });
        return all;
    });
}

function remove(guildId, name) {
    let removed = null;
    store.update(STORE, guildId, [], (all) => {
        const idx = all.findIndex((a) => a.name.toLowerCase() === name.toLowerCase());
        if (idx !== -1) removed = all.splice(idx, 1)[0];
        return all;
    });
    return removed;
}

module.exports = {
    list,
    add,
    remove,

    data: new SlashCommandBuilder()
        .setName('affiliate')
        .setDescription('Manage affiliated servers.')
        .addSubcommand((sub) =>
            sub
                .setName('add')
                .setDescription('Add an affiliate')
                .addStringOption((o) => o.setName('name').setDescription('Server name').setRequired(true))
                .addStringOption((o) => o.setName('invite').setDescription('Discord invite URL').setRequired(true))
        )
        .addSubcommand((sub) => sub.setName('remove').setDescription('Remove an affiliate').addStringOption((o) => o.setName('name').setDescription('Server name').setRequired(true)))
        .addSubcommand((sub) => sub.setName('list').setDescription('List affiliates')),

    async execute(interaction) {
        const guildId = interaction.guildId;
        const cfg = config.getConfig(guildId);
        const sub = interaction.options.getSubcommand();

        if (sub === 'list') {
            const all = list(guildId);
            if (!all.length) return interaction.reply({ content: 'No current affiliations.', ephemeral: true });
            return interaction.reply({ content: all.map((a) => `**${a.name}** — ${a.invite}`).join('\n'), ephemeral: true });
        }

        if (!perms.isManager(interaction.member, cfg)) {
            return interaction.reply({ content: 'You do not have permission to manage affiliations.', ephemeral: true });
        }

        if (sub === 'add') {
            const name = interaction.options.getString('name', true);
            const invite = interaction.options.getString('invite', true);
            add(guildId, name, invite);
            return interaction.reply({ content: `Added **${name}** as an affiliate.`, ephemeral: true });
        }

        if (sub === 'remove') {
            const name = interaction.options.getString('name', true);
            const removed = remove(guildId, name);
            if (!removed) return interaction.reply({ content: `No affiliate named **${name}**.`, ephemeral: true });
            return interaction.reply({ content: `Removed **${name}**.`, ephemeral: true });
        }
    },
};
