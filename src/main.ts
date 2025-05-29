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
// Declare these at module level so they can be exported
let robloxClient: RobloxClient;
let robloxGroup: Group;

// [Initialization]
(async () => {
    try {
        // Load and register commands BEFORE logging in
        console.log('Loading Discord commands...');
        await discordClient.loadCommands();
        console.log(`✅ Loaded ${discordClient.commands.length} commands`);

        // Log available commands for debugging
        console.log(`Available commands: ${discordClient.commands.map(cmd => cmd.trigger).join(', ')}`);

        // Now login to Discord with commands ready
        console.log('Logging in to Discord...');
        await discordClient.login(process.env.DISCORD_TOKEN);
        console.log('✅ Successfully logged in to Discord');

        // Initialize Roblox client
        console.log('Attempting to login to Roblox...');
        robloxClient = new RobloxClient({ credentials: { cookie: process.env.ROBLOX_COOKIE } });
        await robloxClient.login();

        // Verify authentication by getting user info
        try {
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
        console.error('❌ INITIALIZATION FAILED:', error);
        // Hard fail on critical errors
        process.exit(1);
    }
})();

// [Handlers]
discordClient.on('interactionCreate', async (interaction) => {
    // More detailed logging
    Logger.info(`Interaction received: ${interaction.type}`, 'Interaction');
    console.log(`Interaction details: ${interaction.isButton() ? interaction.customId :
        interaction.isCommand() ? interaction.commandName : 'other'}`);

    // Handle each interaction type
    try {
        // Add more detailed logging
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
            // Add this block to handle role select interactions
            Logger.debug(`Select menu interaction: ${interaction.customId}`, 'Interaction');
            // Import this function from componentInteractionHandler
            const { handleComponentInteraction } = require('./handlers/componentInteractionHandler');
            await handleComponentInteraction(interaction);
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
                Logger.error('Failed to send error message:', 'Interaction', responseError);
            }
        }
    }
});

discordClient.on('messageCreate', handleLegacyCommand);
ActivityLogger.testLogging();

// [Module]
// Export everything that needs to be used elsewhere
export { discordClient, robloxClient, robloxGroup };