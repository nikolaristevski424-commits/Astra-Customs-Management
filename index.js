require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');

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

process.on('unhandledRejection', (err) => console.error('[index] Unhandled promise rejection:', err));

client.login(process.env.BOT_TOKEN);
