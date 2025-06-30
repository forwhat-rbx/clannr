import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { Logger } from '../utils/logger';

// Load environment variables
dotenv.config();

// This is now just for reference - we'll use Command.generateAPICommand() instead
const TYPE_MAPPINGS = {
    'String': 3,
    'Number': 4,
    'Boolean': 5,
    'DiscordUser': 6,
    'DiscordChannel': 7,
    'DiscordRole': 8,
    'DiscordMentionable': 9,
    'Attachment': 11,
    'RobloxUser': 3, // Map custom types to String
    'RobloxRole': 3,  // Map custom types to String
    'Subcommand': 1,
    'SubcommandGroup': 2
};

async function main() {
    const TOKEN = process.env.DISCORD_TOKEN;
    const CLIENT_ID = process.env.CLIENT_ID || process.argv[2];
    const GUILD_ID = process.env.TEST_GUILD_ID || process.argv[3];

    if (!TOKEN) {
        console.error('Missing DISCORD_TOKEN in .env file');
        process.exit(1);
    }

    if (!CLIENT_ID) {
        console.error('Missing CLIENT_ID (your bot\'s application ID)');
        console.error('Add CLIENT_ID to .env or pass as first argument');
        process.exit(1);
    }

    // Path to your commands
    const commandsPath = path.join(__dirname, '..', 'commands');
    const commands = [];

    console.log(`Looking for commands in ${commandsPath}`);

    // Read command directories
    const commandFolders = fs.readdirSync(commandsPath);
    for (const folder of commandFolders) {
        const folderPath = path.join(commandsPath, folder);

        if (fs.statSync(folderPath).isDirectory()) {
            const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.ts') || file.endsWith('.js'));

            for (const file of commandFiles) {
                try {
                    // Import command
                    const filePath = path.join(folderPath, file);
                    delete require.cache[require.resolve(filePath)];

                    const CommandClass = require(filePath).default;
                    if (!CommandClass) {
                        console.error(`Command file ${file} does not export a default class`);
                        continue;
                    }

                    // Create an instance of the command
                    const command = new CommandClass();

                    if (command && command.enabled !== false) {
                        // Use the command's built-in method to generate API data
                        try {
                            const commandData = command.generateAPICommand();
                            commands.push(commandData);
                            console.log(`Added command: ${command.trigger}`);
                        } catch (genError) {
                            console.error(`Error generating API data for ${file}:`, genError);
                        }
                    }
                } catch (error) {
                    console.error(`Error processing command file ${file}:`, error);
                }
            }
        }
    }

    console.log(`Preparing to register ${commands.length} commands`);

    const rest = new REST({ version: '10' }).setToken(TOKEN);

    try {
        // Register commands to test guild if provided (instant updates)
        if (GUILD_ID) {
            console.log(`Registering commands to test guild ${GUILD_ID}...`);
            await rest.put(
                Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
                { body: commands }
            );
            console.log('Test guild commands registered successfully!');
        }

        // Always register globally too (takes up to an hour to update)
        console.log('Registering commands globally...');
        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands }
        );
        console.log('Global commands registered successfully!');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
}

main();