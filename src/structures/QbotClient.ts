import { Client, ClientOptions, GatewayIntentBits, Routes, ApplicationCommandDataResolvable } from 'discord.js';
import { readdirSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { config } from '../config';
import { Command } from './Command';
import { REST } from '@discordjs/rest';
import { Logger } from '../utils/logger';

class QbotClient extends Client {
    public commands: Command[] = [];
    public config = config;

    constructor(options?: ClientOptions) {
        super(options || {
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildPresences,
                GatewayIntentBits.GuildMessageReactions,
                GatewayIntentBits.GuildVoiceStates
            ]
        });
    }

    async loadCommands() {
        try {
            const loadedCommands: Command[] = [];
            const commandsDir = path.join(process.cwd(), 'src/commands');

            Logger.info(`Looking for commands in: ${commandsDir}`, 'CommandLoader');

            // Check if directory exists
            if (!existsSync(commandsDir)) {
                Logger.error(`Commands directory not found: ${commandsDir}`, 'CommandLoader');
                return [];
            }

            const modules = readdirSync(commandsDir);
            Logger.info(`Found ${modules.length} modules: ${modules.join(', ')}`, 'CommandLoader');

            for (const module of modules) {
                const moduleDir = path.join(commandsDir, module);
                if (existsSync(moduleDir) && !moduleDir.endsWith('.ts')) {
                    const commandFiles = readdirSync(moduleDir).filter(file => file.endsWith('.ts') && !file.endsWith('.test.ts'));

                    Logger.info(`Found ${commandFiles.length} commands in module ${module}: ${commandFiles.join(', ')}`, 'CommandLoader');

                    for (const file of commandFiles) {
                        try {
                            const commandPath = `../commands/${module}/${file.replace('.ts', '')}`;
                            Logger.debug(`Loading command from path: ${commandPath}`, 'CommandLoader');

                            // Clear cache to ensure fresh command is loaded
                            delete require.cache[require.resolve(commandPath)];

                            // Import command
                            const { default: CommandClass } = await import(commandPath);

                            if (CommandClass && typeof CommandClass === 'function') {
                                // Create an instance of the command and store it
                                const command = new CommandClass();
                                Logger.debug(`Loaded command: ${command.trigger || 'Unknown'}`, 'CommandLoader');
                                loadedCommands.push(command);
                            } else {
                                Logger.warn(`Command in ${file} does not export a valid default class`, 'CommandLoader');
                            }
                        } catch (error) {
                            Logger.error(`Error loading command in ${file}:`, 'CommandLoader', error);
                        }
                    }
                }
            }

            this.commands = loadedCommands;
            Logger.info(`Loaded ${loadedCommands.length} commands total`, 'CommandLoader');

            // Registration happens separately after login
            return loadedCommands;
        } catch (error) {
            Logger.error("Error loading commands:", 'CommandLoader', error);
            return [];
        }
    }

    async registerSlashCommands(guildId?: string) {
        if (!this.application?.id) {
            Logger.error("Cannot register commands - application ID not available", 'CommandLoader');
            return false;
        }

        try {
            // Filter out disabled commands
            const enabledCommands = this.commands.filter(cmd => cmd.enabled !== false);
            Logger.info(`Preparing to register ${enabledCommands.length} enabled commands`, 'CommandLoader');

            const slashCommands = enabledCommands.map(cmd => {
                try {
                    const apiCommand = cmd.generateAPICommand();
                    Logger.debug(`Generated API command for ${cmd.trigger}`, 'CommandLoader');
                    return apiCommand;
                } catch (err) {
                    Logger.error(`Failed to generate API command for ${cmd.trigger}:`, 'CommandLoader', err);
                    return null;
                }
            }).filter(cmd => cmd !== null) as ApplicationCommandDataResolvable[];

            // Create resources directory if it doesn't exist
            const resourcesDir = path.join(process.cwd(), 'src/resources');
            if (!existsSync(resourcesDir)) {
                mkdirSync(resourcesDir, { recursive: true });
            }

            // Save commands to file for reference
            const commandsPath = path.join(resourcesDir, 'commands.json');
            writeFileSync(commandsPath, JSON.stringify(slashCommands, null, 2), 'utf-8');

            Logger.info(`Registering ${slashCommands.length} slash commands with Discord API...`, 'CommandLoader');

            // Register commands with Discord API
            const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

            if (guildId) {
                // Register to a specific guild for testing (instant update)
                await rest.put(
                    Routes.applicationGuildCommands(this.application.id, guildId),
                    { body: slashCommands }
                );
                Logger.info(`Successfully registered ${slashCommands.length} slash commands to guild ${guildId}`, 'CommandLoader');
            } else {
                // Register globally (can take up to an hour to propagate)
                await rest.put(
                    Routes.applicationCommands(this.application.id),
                    { body: slashCommands }
                );
                Logger.info(`Successfully registered ${slashCommands.length} slash commands globally`, 'CommandLoader');
            }

            return true;
        } catch (error) {
            Logger.error("Error registering slash commands:", 'CommandLoader', error);
            console.error(error); // Log the full error for debugging
            return false;
        }
    }
}

export { QbotClient };