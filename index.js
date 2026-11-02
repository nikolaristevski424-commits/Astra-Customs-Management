require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, Collection, REST, Routes } = require('discord.js');

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

client.on('error', (error) => console.error('[index] Discord client error:', error));

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
    if (!process.env.CLIENT_ID || !process.env.GUILD_ID || process.env.CLIENT_ID === 'your_application_id_here' || process.env.GUILD_ID === 'your_test_server_id_here') {
        console.warn('[index] CLIENT_ID/GUILD_ID missing or still placeholder; slash commands were not deployed.');
        return;
    }

    const rest = new REST().setToken(process.env.BOT_TOKEN);
    try {
        await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), {
            body: [...client.commands.values()].map((command) => command.data.toJSON()),
        });
        console.log(`[index] Deployed ${client.commands.size} slash command(s) to guild ${process.env.GUILD_ID}.`);
    } catch (error) {
        console.error('[index] Slash-command deployment failed:', error.message);
    }
}

process.on('unhandledRejection', (err) => console.error('[index] Unhandled promise rejection:', err));

deployGuildCommands().finally(() => client.login(process.env.BOT_TOKEN));
