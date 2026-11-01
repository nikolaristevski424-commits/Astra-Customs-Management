require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, Collection, REST, Routes } = require('discord.js');
const {startGateway}=require('./utils/discordStartup');

if (!process.env.BOT_TOKEN) {
    console.error('Missing BOT_TOKEN in .env — copy .env.example to .env and fill it in.');
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
});

client.on('error', error=>console.error('[index] Discord client error:',error?.message||error));
client.on('shardError',error=>console.error('[index] Discord gateway shard error:',error?.message||error));
client.on('shardDisconnect',(event,shardId)=>console.warn(
    '[index] Discord gateway disconnected (shard '+shardId+', code '+event?.code+').'));
client.on('shardReconnecting',shardId=>console.log('[index] Reconnecting Discord gateway shard '+shardId+'...'));

// ---- Load commands ----
client.commands = new Collection();
const commandsDir = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js'))) {
    const command = require(path.join(commandsDir, file));
    if (command?.data?.name && typeof command.execute === 'function') {
        client.commands.set(command.data.name, command);
    } else {
        console.warn(`[index] Skipping commands/${file} — missing "data" or "execute" export.`);
    }
}
console.log(`[index] Loaded ${client.commands.size} command(s).`);

// ---- Load events ----
const eventsDir = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsDir).filter((f) => f.endsWith('.js'))) {
    const event = require(path.join(eventsDir, file));
    if (event.once) client.once(event.name, (...args) => event.execute(...args));
    else client.on(event.name, (...args) => event.execute(...args));
}
console.log(`[index] Loaded event handlers.`);

async function deployGuildCommands() {
    if (!process.env.CLIENT_ID || !process.env.GUILD_ID ||
        process.env.CLIENT_ID === 'your_application_id_here' ||
        process.env.GUILD_ID === 'your_test_server_id_here') {
        console.error('[index] Slash commands NOT registered: CLIENT_ID or GUILD_ID is missing/placeholder in Wispbyte .env.');
        return;
    }

    // Prevent registering commands under a *different* application, a frequent
    // cause of Discord showing stale slash commands with no working handlers.
    if (client.user?.id && String(process.env.CLIENT_ID)!==String(client.user.id)) {
        console.error('[index] Slash commands NOT registered: CLIENT_ID does not match the logged-in bot application. Verify CLIENT_ID in Wispbyte .env.');
        return;
    }
    const commands=[...client.commands.values()].map(command=>command.data.toJSON());
    console.log('[index] Syncing '+commands.length+' slash commands with Discord (guild '+process.env.GUILD_ID+')...');
    // Explicit timeout and limited retries keep Discord API outages from
    // hanging this sync forever. The gateway is already live either way.
    const rest=new REST({timeout:15000,retries:1}).setToken(process.env.BOT_TOKEN);
    try {
        await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID,process.env.GUILD_ID),{
            body:commands
        });
        console.log('[index] Slash commands deployed successfully: '+commands.length+' registered to guild '+process.env.GUILD_ID+'.');
    } catch (error) {
        console.error('[index] Slash-command deployment FAILED (bot stays online): '+
            (error?.message||'Discord API error')+
            (error?.status?' | HTTP '+error.status:'')+
            '. Check CLIENT_ID, GUILD_ID, bot application permissions and Discord API access.');
    }
}

process.on('unhandledRejection', (err) => console.error('[index] Unhandled promise rejection:', err));

// Never wait on Discord's REST command sync before connecting the bot.
// Discord must accept the login even if command registration is delayed.
const readyWatchdog=setTimeout(()=>{
    if(!client.isReady())console.error(
        '[startup] Still not connected to Discord after 45 seconds. Check BOT_TOKEN, '+
        'the Discord gateway connection, Server Members Intent, and hosting network. '+
        'This is not proof slash commands were registered.');
},45000);
readyWatchdog.unref?.();
client.once('clientReady',()=>clearTimeout(readyWatchdog));
startGateway({client,token:process.env.BOT_TOKEN,deployCommands:deployGuildCommands})
    .catch(error=>{
        console.error('[startup] Discord LOGIN FAILED: '+(error?.message||'Unknown gateway error'));
        process.exitCode=1;
        // Wispbyte must not show a permanently running bot after login fails.
        client.destroy();
        process.exit(1);
    });
