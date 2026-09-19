// Registers all slash commands with Discord. Run this once after adding
// or changing any command, and again any time you edit one.
//
//   node deploy-commands.js            → registers guild-only (instant, good for testing — needs GUILD_ID in .env)
//   node deploy-commands.js --global   → registers globally (takes up to an hour to propagate)

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

if (!process.env.BOT_TOKEN || !process.env.CLIENT_ID) {
    console.error('Missing BOT_TOKEN or CLIENT_ID in .env.');
    process.exit(1);
}

const commands = [];
const commandsDir = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js'))) {
    const command = require(path.join(commandsDir, file));
    if (command?.data) commands.push(command.data.toJSON());
}

const rest = new REST().setToken(process.env.BOT_TOKEN);
const isGlobal = process.argv.includes('--global');

(async () => {
    try {
        console.log(`Deploying ${commands.length} command(s) ${isGlobal ? 'globally' : 'to your test guild'}...`);

        if (isGlobal) {
            await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
        } else {
            if (!process.env.GUILD_ID) {
                console.error('GUILD_ID is required in .env for guild deployment (or pass --global).');
                process.exit(1);
            }
            await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
        }

        console.log('Done.');
    } catch (err) {
        console.error('Failed to deploy commands:', err);
        process.exit(1);
    }
})();
