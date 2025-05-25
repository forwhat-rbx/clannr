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
        await robloxClient.login();

        // Instead of getCurrentUser (which doesn't exist), verify authentication by getting user info
        try {
            // This is the typical way to get authenticated user info in Bloxy
            const userInfo = await robloxClient.apis.usersAPI.getAuthenticatedUserInformation();
            Logger.info(`Successfully logged in as: ${userInfo.name} (${userInfo.id})`, 'Auth');
        } catch (userErr) {
            Logger.warn('Authenticated, but couldn\'t fetch user details', 'Auth', userErr);
        }

        await initializeLogChannels();

        // Get the group (this will fail if not authenticated)
        robloxGroup = await robloxClient.getGroup(config.groupId);
        Logger.info(`Found group: ${robloxGroup.name} (${robloxGroup.id})`, 'Auth');

        // Validate group access by fetching roles (crucial for ranking permissions)
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

            // Initialize promotion service AFTER we've confirmed authentication
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

        // [Events]
        checkSuspensions();
        checkBans();
        if (config.logChannels.shout) recordShout();
        if (config.recordManualActions) recordAuditLogs();
        if (config.memberCount.enabled) recordMemberCount();
        if (config.antiAbuse.enabled) clearActions();
        if (config.deleteWallURLs) checkWallForAds();
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

// [Module]
export { discordClient, robloxClient, robloxGroup };