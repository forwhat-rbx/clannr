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
import { promiseWithTimeout } from './utils/timeoutUtil'; // Fixed import path

require('dotenv').config();

// [Ensure Setup]
if (!process.env.ROBLOX_COOKIE) {
    Logger.error('ROBLOX_COOKIE is not set in the .env file.', 'Auth', null);
    process.exit(1);
}

require('./database');
require('./api');

// [Clients]
const discordClient = new QbotClient();
discordClient.login(process.env.DISCORD_TOKEN);
const robloxClient = new RobloxClient({ credentials: { cookie: process.env.ROBLOX_COOKIE } });
let robloxGroup: Group = null;

(async () => {
    try {
        Logger.info('Attempting to login to Roblox...', 'Auth');

        // Add timeout to login
        await promiseWithTimeout(
            robloxClient.login(),
            30000, // 30 second timeout for login
            'Roblox login timed out'
        );

        Logger.info('Roblox login completed, fetching user info...', 'Auth');

        // Add timeout to user info fetch
        try {
            const userInfo = await promiseWithTimeout(
                robloxClient.apis.usersAPI.getAuthenticatedUserInformation(),
                15000, // 15 second timeout
                'User info fetch timed out'
            );
            Logger.info(`Successfully logged in as: ${userInfo.name} (${userInfo.id})`, 'Auth');
        } catch (userErr) {
            Logger.warn('Authenticated, but couldn\'t fetch user details', 'Auth', userErr);
            // Continue anyway
        }

        Logger.info('Initializing log channels...', 'Auth');

        // Add timeout to log channel initialization
        await promiseWithTimeout(
            initializeLogChannels(),
            10000, // 10 second timeout
            'Log channel initialization timed out'
        );

        Logger.info('Log channels initialized, fetching group...', 'Auth');

        // Get the group with timeout
        robloxGroup = await promiseWithTimeout(
            robloxClient.getGroup(config.groupId),
            20000, // 20 second timeout
            'Group fetch timed out'
        );

        Logger.info(`Found group: ${robloxGroup.name} (${robloxGroup.id})`, 'Auth');

        // Validate group access by fetching roles with timeout
        const roles = await promiseWithTimeout(
            robloxGroup.getRoles(),
            15000, // 15 second timeout
            'Group roles fetch timed out'
        );

        Logger.info(`Authentication confirmed - found ${roles.length} group roles`, 'Auth');

        // Grab a CSRF token to use for future requests
        try {
            Logger.info('Fetching initial XSRF token...', 'Auth');

            const response = await promiseWithTimeout(
                fetchWithRetry('https://auth.roblox.com/v2/logout', {
                    method: 'POST',
                    headers: {
                        'Cookie': `.ROBLOSECURITY=${process.env.ROBLOX_COOKIE}`
                    }
                }, 3, 5000),
                15000, // 15 second timeout
                'XSRF token fetch timed out'
            );

            Logger.info('Initial XSRF token fetched successfully', 'Auth');

            // Initialize promotion service AFTER we've confirmed authentication
            Logger.info('Initializing promotion service...', 'Auth');
            schedulePromotionChecks();
            Logger.info('Promotion service initialized', 'Auth');
        } catch (err) {
            Logger.error('Failed to fetch initial XSRF token:', 'Auth', err);
            Logger.warn('Continuing startup despite token fetch failure', 'Auth');

            // Try to initialize promotion service anyway after a delay
            setTimeout(() => {
                Logger.info('Attempting to initialize promotion service after XSRF token failure', 'Auth');
                schedulePromotionChecks();
            }, 20000);
        }

        // [Events]
        Logger.info('Setting up event handlers...', 'Auth');

        // Initialize each event handler with better error handling
        try {
            checkSuspensions();
            Logger.info('Suspension checks initialized', 'Events');
        } catch (e) {
            Logger.error('Failed to initialize suspension checks:', 'Events', e);
        }

        try {
            checkBans();
            Logger.info('Ban checks initialized', 'Events');
        } catch (e) {
            Logger.error('Failed to initialize ban checks:', 'Events', e);
        }

        if (config.logChannels.shout) {
            try {
                recordShout();
                Logger.info('Shout recording initialized', 'Events');
            } catch (e) {
                Logger.error('Failed to initialize shout recording:', 'Events', e);
            }
        }

        if (config.recordManualActions) {
            try {
                recordAuditLogs();
                Logger.info('Audit log recording initialized', 'Events');
            } catch (e) {
                Logger.error('Failed to initialize audit log recording:', 'Events', e);
            }
        }

        if (config.memberCount.enabled) {
            try {
                recordMemberCount();
                Logger.info('Member count recording initialized', 'Events');
            } catch (e) {
                Logger.error('Failed to initialize member count recording:', 'Events', e);
            }
        }

        if (config.antiAbuse.enabled) {
            try {
                clearActions();
                Logger.info('Anti-abuse system initialized', 'Events');
            } catch (e) {
                Logger.error('Failed to initialize anti-abuse system:', 'Events', e);
            }
        }

        if (config.deleteWallURLs) {
            try {
                checkWallForAds();
                Logger.info('Wall URL checker initialized', 'Events');
            } catch (e) {
                Logger.error('Failed to initialize wall URL checker:', 'Events', e);
            }
        }

        Logger.info('All systems initialized successfully', 'Auth');
    } catch (error) {
        Logger.error('AUTHENTICATION FAILED - Your Roblox cookie may be invalid or expired', 'Auth', error);
        process.exit(1);
    }
})();

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
ActivityLogger.testLogging();

// Log successful startup
Logger.info('Bot initialization complete', 'Startup');

// [Module]
export { discordClient, robloxClient, robloxGroup };