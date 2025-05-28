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
import { QbotClient } from './structures/QbotClient';

require('dotenv').config();

// [Ensure Setup]
if (!process.env.ROBLOX_COOKIE) {
    console.error('ROBLOX_COOKIE is not set in the .env file.');
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
        console.log('Attempting to login to Roblox...');
        await robloxClient.login();

        // Instead of getCurrentUser (which doesn't exist), verify authentication by getting user info
        try {
            // This is the typical way to get authenticated user info in Bloxy
            const userInfo = await robloxClient.apis.usersAPI.getAuthenticatedUserInformation();
            console.log(`✅ Successfully logged in as: ${userInfo.name} (${userInfo.id})`);
        } catch (userErr) {
            console.log('⚠️ Authenticated, but couldn\'t fetch user details');
        }

        await initializeLogChannels();

        // Get the group (this will fail if not authenticated)
        robloxGroup = await robloxClient.getGroup(config.groupId);
        console.log(`✅ Found group: ${robloxGroup.name} (${robloxGroup.id})`);

        // Validate group access by fetching roles (crucial for ranking permissions)
        const roles = await robloxGroup.getRoles();
        console.log(`✅ Authentication confirmed - found ${roles.length} group roles`);

        // Grab a CSRF token to use for future requests
        try {
            console.log('Fetching initial XSRF token...');
            const response = await fetchWithRetry('https://auth.roblox.com/v2/logout', {
                method: 'POST',
                headers: {
                    'Cookie': `.ROBLOSECURITY=${process.env.ROBLOX_COOKIE}`
                }
            }, 3, 5000);
            console.log('✅ Initial XSRF token fetched successfully');

            // Initialize promotion service AFTER we've confirmed authentication
            schedulePromotionChecks();
        } catch (err) {
            console.error('❌ Failed to fetch initial XSRF token:', err);
            console.log('⚠️ Continuing startup despite token fetch failure');

            // Try to initialize promotion service anyway after a delay
            setTimeout(() => {
                console.log('Attempting to initialize promotion service after XSRF token failure');
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
        console.error('❌ AUTHENTICATION FAILED - Your Roblox cookie may be invalid or expired');
        console.error(error);
        // Consider adding process.exit(1) here if you want to fail hard on auth issues
    }
})();

// [Handlers]
discordClient.on('interactionCreate', async (interaction) => {
    // Log minimal info about interaction type
    console.log('Interaction received:', interaction.type);

    // Handle each interaction type
    try {
        if (interaction.isCommand()) {
            await handleInteraction(interaction);
        } else if (interaction.isButton()) {
            await handleButtonInteraction(interaction);
        } else if (interaction.isModalSubmit()) {
            await handleModalSubmit(interaction);
        } else if (interaction.isAutocomplete()) {
            await handleInteraction(interaction);
        }
    } catch (error) {
        console.error('Error handling interaction:', error);
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
                console.error('Failed to send error message:', responseError);
            }
        }
    }
});

discordClient.on('messageCreate', handleLegacyCommand);
ActivityLogger.testLogging();

// [Module]
export { discordClient, robloxClient, robloxGroup };