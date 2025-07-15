import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import { Logger } from './logger';
import fs from 'fs';
import path from 'path';
import { discordClient } from '../main';

export async function deployCommands() {
    try {
        Logger.info('Starting command deployment...', 'Commands');

        const commands = [];
        const commandsPath = path.join(__dirname, '..', 'commands');
        const commandFolders = fs.readdirSync(commandsPath);

        for (const folder of commandFolders) {
            const folderPath = path.join(commandsPath, folder);
            if (fs.statSync(folderPath).isDirectory()) {
                const commandFiles = fs.readdirSync(folderPath).filter(file =>
                    file.endsWith('.js') || file.endsWith('.ts'));

                for (const file of commandFiles) {
                    const filePath = path.join(folderPath, file);
                    // Delete require cache to ensure fresh import
                    delete require.cache[require.resolve(filePath)];
                    const command = require(filePath).default;
                    if (command && command.data) {
                        commands.push(command.data.toJSON());
                    }
                }
            }
        }

        Logger.info(`Found ${commands.length} commands to register`, 'Commands');

        const rest = new REST({ version: '9' }).setToken(process.env.DISCORD_TOKEN);

        // Global command registration
        await rest.put(
            Routes.applicationCommands(discordClient.user.id),
            { body: commands },
        );

        Logger.info(`Successfully registered ${commands.length} application commands globally`, 'Commands');
        return true;
    } catch (error) {
        Logger.error('Error deploying commands:', 'Commands', error);
        return false;
    }
}