import { QbotClient } from './structures/QbotClient';
import { Client as RobloxClient } from 'bloxy';
import { handleInteraction } from './handlers/handleInteraction';
import { handleLegacyCommand } from './handlers/handleLegacyCommand';
import { config } from './config';
import { Group } from 'bloxy/dist/structures';
import { recordShout } from './events/shout';
import { checkSuspensions } from './events/suspensions';
import { recordAuditLogs } from './events/audit';
import { recordMemberCount } from './events/member';
import { clearActions } from './handlers/abuseDetection';
import { checkBans } from './events/bans';
import { checkWallForAds } from './events/wall';
import { handleButtonInteraction } from './handlers/handleButtonInteraction';
import { schedulePromotionChecks } from './services/promotionService';
import { fetchWithRetry } from './utils/robloxUtils';
import { handleModalSubmit } from './handlers/modalSubmitHandler';
import { getLogChannels as initializeLogChannels } from './handlers/handleLogging';
import { ActivityLogger } from './utils/activityLogger';
import { Logger } from './utils/logger';
import { directAuthenticate, directGetGroup, directGetGroupRoles } from './utils/directAuth';
import { Routes, REST } from 'discord.js';

require('dotenv').config();

// [Initialize Globals]
declare global {
    var directAuthUser: { id: number; name: string } | null;
    var robloxCookie: string | null;
    var directGroupInfo: any | null;
}

// [Clients]
const discordClient = new QbotClient();
let robloxClient: RobloxClient;
let robloxGroup: Group;
let robloxAuthenticated = false;

// ====================================
// INITIALIZATION FUNCTIONS
// ====================================

/**
 * Validates required environment variables
 */
function validateEnvironment() {
    if (!process.env.DISCORD_TOKEN) {
        throw new Error('DISCORD_TOKEN is not set in the .env file');
    }

    if (!process.env.ROBLOX_COOKIE) {
        throw new Error('ROBLOX_COOKIE is not set in the .env file');
    }

    // Add CLIENT_ID for command registration
    if (!process.env.CLIENT_ID) {
        Logger.warn('CLIENT_ID is not set in .env file. Command registration may fail.', 'Setup');
    }
}

/**
 * Initializes the Discord client and registers commands
 */
async function initializeDiscord() {
    // Load and register commands
    Logger.info('Loading Discord commands...', 'Discord');
    await discordClient.loadCommands();
    Logger.info(`Loaded ${discordClient.commands.length} commands: ${discordClient.commands.map(cmd => cmd.trigger).join(', ')}`, 'Discord');

    // Login to Discord
    Logger.info('Logging in to Discord...', 'Discord');
    await discordClient.login(process.env.DISCORD_TOKEN);
    Logger.info('Successfully logged in to Discord', 'Discord');

    // Register slash commands with Discord API
    await registerSlashCommands();

    // Initialize log channels
    await initializeLogChannels();
}

/**
 * Registers slash commands with Discord API
 */
async function registerSlashCommands() {
    try {
        Logger.info('Registering slash commands with Discord API...', 'Discord');

        if (!discordClient.application?.id) {
            Logger.error('Cannot register commands - application ID not available', 'Discord');
            return;
        }

        // Map commands to Discord API format using the new method
        const commands = discordClient.commands
            .filter(cmd => cmd.enabled !== false)
            .map(cmd => {
                try {
                    return cmd.generateAPICommand();
                } catch (err) {
                    Logger.error(`Failed to generate API command for ${cmd.trigger}:`, 'Discord', err);
                    return null;
                }
            })
            .filter(cmd => cmd !== null);

        // Log the commands for debugging
        Logger.debug(`Prepared ${commands.length} commands for registration`, 'Discord');

        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

        // First try guild-specific registration
        const testGuildId = process.env.TEST_GUILD_ID || config.testGuildId || '1297746235889025156';
        if (testGuildId) {
            try {
                const guild = await discordClient.guilds.fetch(testGuildId).catch(() => null);
                if (guild) {
                    Logger.info(`Registering commands to test guild ${testGuildId}...`, 'Discord');
                    await rest.put(
                        Routes.applicationGuildCommands(discordClient.application.id, testGuildId),
                        { body: commands }
                    );
                    Logger.info(`Registered ${commands.length} commands to test guild ${testGuildId}`, 'Discord');
                }
            } catch (guildError) {
                Logger.error(`Failed to register commands to test guild: ${guildError.message}`, 'Discord');
            }
        }

        // Then try global registration
        try {
            Logger.info('Registering commands globally...', 'Discord');
            await rest.put(
                Routes.applicationCommands(discordClient.application.id),
                { body: commands }
            );
            Logger.info(`Registered ${commands.length} commands globally`, 'Discord');
        } catch (globalError) {
            Logger.error(`Failed to register global commands: ${globalError.message}`, 'Discord');
        }
    } catch (error) {
        Logger.error(`Failed to register slash commands: ${error.message}`, 'Discord', error);
    }
}

/**
 * Initializes Roblox client with authentication
 */
async function initializeRoblox() {
    // Clean up the cookie first
    const cookie = process.env.ROBLOX_COOKIE.trim();

    // Method 1: Try Bloxy authentication first
    await tryBloxyAuthentication(cookie);

    // Method 2: If Bloxy failed, try direct authentication
    if (!robloxAuthenticated) {
        await tryDirectAuthentication(cookie);
    }

    // If all authentication methods failed
    if (!robloxAuthenticated) {
        throw new Error('All Roblox authentication methods failed');
    }

    // Fetch initial XSRF token
    await fetchInitialXsrfToken(cookie);
}

/**
 * Try to authenticate with Bloxy
 */
async function tryBloxyAuthentication(cookie: string) {
    Logger.info('Attempting to login to Roblox via Bloxy...', 'Roblox');
    try {
        robloxClient = new RobloxClient();

        // Try to login
        await robloxClient.login(cookie);

        // Verify authentication by getting user info
        const userInfo = await robloxClient.apis.usersAPI.getAuthenticatedUserInformation();
        Logger.info(`Successfully logged in via Bloxy as: ${userInfo.name} (${userInfo.id})`, 'Roblox');

        // Get the group and verify we can access it
        robloxGroup = await robloxClient.getGroup(config.groupId);
        const roles = await robloxGroup.getRoles();

        Logger.info(`Found group: ${robloxGroup.name} (${robloxGroup.id}) with ${roles.length} roles`, 'Roblox');
        robloxAuthenticated = true;
    } catch (error) {
        Logger.warn('Bloxy authentication failed, will try alternative methods', 'Roblox', error);
    }
}

/**
 * Try to authenticate with direct method
 */
async function tryDirectAuthentication(cookie: string) {
    Logger.info('Attempting direct Roblox authentication...', 'Roblox');
    try {
        // Authenticate directly using the custom util
        const user = await directAuthenticate(cookie);

        if (user && user.id) {
            Logger.info(`Successfully authenticated directly as ${user.name} (${user.id})`, 'Roblox');

            // Store authenticated user info for global use
            global.directAuthUser = user;
            global.robloxCookie = cookie;

            // Get group info directly
            const groupInfo = await directGetGroup(cookie, config.groupId);
            Logger.info(`Connected to group: ${groupInfo.name} (${groupInfo.id})`, 'Roblox');

            // Store group info globally
            global.directGroupInfo = groupInfo;

            // Verify role access
            const roles = await directGetGroupRoles(cookie, config.groupId);
            Logger.info(`Authentication confirmed - found ${roles.length} group roles`, 'Roblox');

            robloxAuthenticated = true;

            // Since we're using direct auth, create a minimal group object for compatibility
            robloxGroup = {
                id: groupInfo.id,
                name: groupInfo.name,
                // Add other required properties or methods as needed
            } as any;
        } else {
            throw new Error('Direct authentication returned invalid user data');
        }
    } catch (error) {
        Logger.error('Direct authentication failed', 'Roblox', error);
        throw new Error(`All authentication methods failed: ${error.message}`);
    }
}

/**
 * Fetch initial XSRF token for future requests
 */
async function fetchInitialXsrfToken(cookie: string) {
    try {
        Logger.info('Fetching initial XSRF token...', 'Roblox');
        await fetchWithRetry('https://auth.roblox.com/v2/logout', {
            method: 'POST',
            headers: {
                'Cookie': `.ROBLOSECURITY=${cookie}`
            }
        }, 3, 5000);
        Logger.info('Initial XSRF token fetched successfully', 'Roblox');
    } catch (error) {
        Logger.warn('Failed to fetch initial XSRF token, some operations may fail', 'Roblox', error);
    }
}

/**
 * Initialize services and event listeners
 */
function initializeServices() {
    // Initialize promotion service
    schedulePromotionChecks();

    // Set up event listeners
    checkSuspensions();
    checkBans();
    if (config.logChannels.shout) recordShout();
    if (config.recordManualActions) recordAuditLogs();
    if (config.memberCount.enabled) recordMemberCount();
    if (config.antiAbuse.enabled) clearActions();
    if (config.deleteWallURLs) checkWallForAds();

    Logger.info('All services initialized successfully', 'Services');
}

/**
 * Set up Discord event handlers
 */
function setupDiscordEvents() {
    // Interaction handler
    discordClient.on('interactionCreate', handleDiscordInteraction);

    // Message handler for legacy commands
    discordClient.on('messageCreate', handleLegacyCommand);

    // Test logging
    ActivityLogger.testLogging();
}

/**
 * Handle Discord interactions
 */
async function handleDiscordInteraction(interaction) {
    // Log interaction details
    Logger.info(`Interaction received: ${interaction.type}`, 'Interaction');
    Logger.debug(`Interaction details: ${interaction.isButton() ? interaction.customId :
        interaction.isCommand() ? interaction.commandName : 'other'}`, 'Interaction');

    try {
        if (interaction.isCommand()) {
            Logger.debug(`Command interaction: ${interaction.commandName}`, 'Interaction');
            await handleInteraction(interaction);
        } else if (interaction.isButton()) {
            Logger.debug(`Button interaction: ${interaction.customId}`, 'Interaction');
            await handleButtonInteraction(interaction);
        } else if (interaction.isModalSubmit()) {
            Logger.debug(`Modal interaction: ${interaction.customId}`, 'Interaction');
            await handleModalSubmit(interaction);
        } else if (interaction.isAutocomplete()) {
            Logger.debug(`Autocomplete interaction for: ${interaction.commandName}`, 'Interaction');
            await handleInteraction(interaction);
        } else if (interaction.isRoleSelectMenu() || interaction.isStringSelectMenu()) {
            Logger.debug(`Select menu interaction: ${interaction.customId}`, 'Interaction');
            const { handleComponentInteraction } = require('./handlers/componentInteractionHandler');
            await handleComponentInteraction(interaction);
        }
    } catch (error) {
        Logger.error('Error handling interaction', 'Interaction', error);

        // Try to respond to the user if possible
        if (!('replied' in interaction && interaction.replied) && !('deferred' in interaction && interaction.deferred)) {
            try {
                if ('reply' in interaction) {
                    await interaction.reply({
                        content: 'An error occurred while processing your request.',
                        ephemeral: true
                    });
                }
            } catch (responseError) {
                Logger.error('Failed to send error message', 'Interaction', responseError);
            }
        }
    }
}

// ====================================
// MAIN EXECUTION FLOW
// ====================================

// Start the bot
(async () => {
    try {
        // Load dependencies
        require('./database');
        require('./api');

        // Validate environment
        validateEnvironment();

        // Initialize Discord
        await initializeDiscord();

        // Initialize Roblox
        await initializeRoblox();

        // Initialize services and events
        initializeServices();

        // Set up Discord event handlers
        setupDiscordEvents();

        Logger.info('✅ Bot startup complete', 'Startup');
    } catch (error) {
        Logger.error('❌ INITIALIZATION FAILED', 'Startup', error);

        // Provide more helpful error information for common issues
        if (error.message && error.message.includes('401')) {
            console.error('\n🔑 AUTHENTICATION ERROR: Your Roblox cookie appears to be invalid or expired.');
            console.error('Please get a new cookie by:');
            console.error('1. Logging into Roblox in your browser');
            console.error('2. Opening DevTools (F12) → Application tab → Cookies → roblox.com');
            console.error('3. Copy the value of .ROBLOSECURITY cookie (without quotes)');
            console.error('4. Update your .env file with the new cookie\n');
        } else if (error.message && error.message.includes('DISCORD_TOKEN')) {
            console.error('\n🔑 DISCORD TOKEN ERROR: Your Discord bot token is missing or invalid.');
            console.error('Please check your .env file and ensure DISCORD_TOKEN is properly set.\n');
        }

        // Hard fail on critical errors
        process.exit(1);
    }
})();

// Export everything that needs to be used elsewhere
export { discordClient, robloxClient, robloxGroup };