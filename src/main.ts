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
import { schedulePromotionChecks } from './services/promotionService';
import { fetchWithRetry } from './utils/robloxUtils';
import { handleModalSubmit } from './handlers/modalSubmitHandler';
import { getLogChannels as initializeLogChannels } from './handlers/handleLogging';
import { ActivityLogger } from './utils/activityLogger';
import { handleComponentInteraction } from './handlers/componentInteractionHandler';
import { Logger } from './utils/logger';

require('dotenv').config();

// [Ensure Setup]
if (!process.env.ROBLOX_COOKIE) {
    Logger.error('ROBLOX_COOKIE is not set in the .env file.', 'Auth', null);
    process.exit(1);
}

// Import database and API - database automatically initializes on import
require('./database');
require('./api');

// [Clients]
const discordClient = new QbotClient();
const robloxClient = new RobloxClient({ credentials: { cookie: process.env.ROBLOX_COOKIE } });
let robloxGroup: Group = null;

// Main initialization function
async function initialize() {
    try {
        // Login to Discord
        Logger.info('Logging in to Discord...', 'Auth');
        await discordClient.login(process.env.DISCORD_TOKEN);

        // Load commands
        await discordClient.loadCommands();

        // Login to Roblox
        Logger.info('Attempting to login to Roblox...', 'Auth');
        await robloxClient.login();

        try {
            // Verify Roblox authentication
            const userInfo = await robloxClient.apis.usersAPI.getAuthenticatedUserInformation();
            Logger.info(`Successfully logged in as: ${userInfo.name} (${userInfo.id})`, 'Auth');
        } catch (userErr) {
            Logger.warn('Authenticated, but couldn\'t fetch user details', 'Auth', userErr);
        }

        await initializeLogChannels();

        // Get the group (this will fail if not authenticated)
        robloxGroup = await robloxClient.getGroup(config.groupId);
        Logger.info(`Found group: ${robloxGroup.name} (${robloxGroup.id})`, 'Auth');

        // Validate group access by fetching roles
        const roles = await robloxGroup.getRoles();
        Logger.info(`Authentication confirmed - found ${roles.length} group roles`, 'Auth');

        // Grab a CSRF token to use for future requests
        try {
            Logger.info('Fetching initial XSRF token...', 'Auth');
            const response = await fetchWithRetry('https://auth.roblox.com/v2/logout', {
                method: 'POST',
                headers: {
                    'Cookie': `.ROBLOSECURITY=${process.env.ROBLOX_COOKIE}`
                }
            }, 3, 5000);
            Logger.info('Initial XSRF token fetched successfully', 'Auth');

            // Initialize promotion service AFTER authentication is confirmed
            schedulePromotionChecks();
        } catch (err) {
            Logger.error('Failed to fetch initial XSRF token:', 'Auth', err);
            Logger.warn('Continuing startup despite token fetch failure', 'Auth');

            // Try to initialize promotion service anyway after a delay
            setTimeout(() => {
                Logger.info('Attempting to initialize promotion service after XSRF token failure', 'Auth');
                schedulePromotionChecks();
            }, 20000);
        }

        // Start background tasks
        startBackgroundTasks();
    } catch (error) {
        Logger.error('CRITICAL ERROR during initialization', 'Auth', error);
        process.exit(1);
    }
}

// Start all background tasks with proper error handling
function startBackgroundTasks() {
    try {
        checkSuspensions();
        checkBans();
        if (config.logChannels.shout) recordShout();
        if (config.recordManualActions) recordAuditLogs();
        if (config.memberCount.enabled) recordMemberCount();
        if (config.antiAbuse.enabled) clearActions();
        if (config.deleteWallURLs) checkWallForAds();
        Logger.info('All background tasks started successfully', 'Startup');
    } catch (error) {
        Logger.error('Error starting background tasks', 'Startup', error);
    }
}

// [Handlers]
discordClient.on('interactionCreate', async (interaction) => {
    // Log minimal info about interaction type
    Logger.info(`Interaction received: ${interaction.type}`, 'Interaction');

    // Handle each interaction type
    try {
        if (interaction.isCommand()) {
            await handleInteraction(interaction);
        } else if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isRoleSelectMenu()) {
            // IMPORTANT: Use only ONE handler for component interactions
            await handleComponentInteraction(interaction);
        } else if (interaction.isModalSubmit()) {
            await handleModalSubmit(interaction);
        } else if (interaction.isAutocomplete()) {
            await handleInteraction(interaction);
        }
    } catch (error) {
        Logger.error('Error handling interaction:', 'Interaction', error);
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
                Logger.error('Failed to send error response:', 'Interaction', responseError);
            }
        }
    }
});

discordClient.on('messageCreate', handleLegacyCommand);

// Start the initialization process
initialize().catch(error => {
    Logger.error('Failed to initialize application', 'Startup', error);
    process.exit(1);
});

// [Module]
export { discordClient, robloxClient, robloxGroup };