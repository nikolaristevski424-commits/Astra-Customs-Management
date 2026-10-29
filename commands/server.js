// Singular alias for the founder-only /server leave action.
const { SlashCommandBuilder } = require('discord.js');
const servers = require('./servers');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('server')
        .setDescription('Astra Customs server access controls.')
        .addSubcommand(sub=>sub.setName('leave')
            .setDescription('Founder only: remove the bot from another Discord server.')
            .addStringOption(o=>o.setName('server_id')
                .setDescription('Other server ID from /servers list').setRequired(true))
            .addBooleanOption(o=>o.setName('confirm')
                .setDescription('Confirm removing the bot from this other server').setRequired(true))),
    execute: servers.execute,
};
