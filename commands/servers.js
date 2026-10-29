const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { isOwner } = require('../utils/ownership');
const scope = require('../utils/serverScope');

const data = new SlashCommandBuilder()
    .setName('servers')
    .setDescription('Ownership-only control over servers this Astra bot has joined.')
    .addSubcommand(sub => sub.setName('list')
        .setDescription('Privately list all Discord servers the bot is currently in.'))
    .addSubcommand(sub => sub.setName('leave')
        .setDescription('Remove this bot from another server (never from Astra Customs).')
        .addStringOption(o => o.setName('server_id')
            .setDescription('Server ID shown by /servers list').setRequired(true))
        .addBooleanOption(o => o.setName('confirm')
            .setDescription('Confirm permanently removing the bot from the selected server').setRequired(true)));

async function execute(interaction) {
    const reply = content => interaction.reply({content,flags:MessageFlags.Ephemeral});
    if (!scope.isAstraGuild(interaction.guildId) || (!isOwner(interaction) && interaction.user.id !== '1255248600850497568'))
        return reply('Only Astra Customs ownership can manage bot server access in the official server.');

    const sub = interaction.options.getSubcommand();
    if (sub === 'list') {
        const guilds = scope.joinedGuilds(interaction.client);
        const lines = guilds.map(g =>
            (g.allowed?'✅ **Official Astra Customs**':'⚠️ **Other server**')+
            '\n'+g.name.replace(/[@`*_~|]/g,'')+' — `'+g.id+'`'+
            (g.allowed?'':' (blocked from using Astra commands)'));
        return reply([
            '**Astra Customs | Connected Servers**',
            '**Servers joined:** '+guilds.length,
            '**Auto-leave other servers:** '+(scope.autoLeaveEnabled()?'ON':'OFF'),
            '',
            ...lines,
            '',
            'Use `/servers leave` with another server ID to remove this bot, or set `AUTO_LEAVE_OTHER_GUILDS=1` in Wispbyte to leave other servers on startup and when invited.',
        ].join('\n').slice(0,1950));
    }
    if (sub === 'leave') {
        // High-impact server removal is restricted to the primary founder ONLY.
        // The ID is intentionally hardcoded, not sourced from role/admin permissions.
        if (interaction.user.id !== '1255248600850497568')
            return reply('Only the Astra Customs founder can remove this bot from a server.');
        const serverId = interaction.options.getString('server_id',true).trim();
        if (!/^\d{17,22}$/.test(serverId)) return reply('Please provide a valid Discord server ID.');
        if (scope.isAstraGuild(serverId)) return reply('The bot cannot remove itself from the official Astra Customs server.');
        if (interaction.options.getBoolean('confirm',true)!==true)
            return reply('No server was removed. Set confirm to True when you are ready.');
        const target = interaction.client.guilds.cache.get(serverId);
        if (!target) return reply('The bot is not currently in that server. Run `/servers list` to see joined servers.');
        await interaction.deferReply({flags:MessageFlags.Ephemeral});
        try {
            const name = target.name;
            await target.leave();
            console.log('[servers] '+interaction.user.id+' removed bot from '+name+' ('+serverId+').');
            return interaction.editReply('✅ Left **'+name.replace(/[@`*_~|]/g,'')+'** (`'+serverId+'`). The official Astra Customs server is unchanged.');
        } catch (error) {
            console.error('[servers] Leave failed for guild '+serverId,error);
            return interaction.editReply('Could not leave server `'+serverId+'`: '+error.message.slice(0,180));
        }
    }
}
module.exports = {data,execute};
