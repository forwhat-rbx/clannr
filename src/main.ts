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

require('dotenv').config();

// [Ensure Setup]
if (!process.env.ROBLOX_COOKIE) {
    console.error('ROBLOX_COOKIE is not set in the .env file.');
    process.exit(1);
}

require('./database');
require('./api');

// [Initialize Globals]
declare global {
    var directAuthUser: { id: number; name: string } | null;
    var robloxCookie: string | null;
    var directGroupInfo: any | null;
}

// [Clients]
const discordClient = new QbotClient();
// Declare these at module level so they can be exported
let robloxClient: RobloxClient;
let robloxGroup: Group;
let robloxAuthenticated = false;

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

        // Initialize log channels early
        await initializeLogChannels();

        // ROBLOX AUTHENTICATION - TWO METHODS
        // --------------------------------------

        // Clean up the cookie first
        const cookie = process.env.ROBLOX_COOKIE.trim();

        // Method 1: Try Bloxy authentication first
        console.log('Attempting to login to Roblox via Bloxy...');
        try {
            robloxClient = new RobloxClient();

            // First attempt with normal login
            try {
                await robloxClient.login(cookie);

                // Verify authentication by getting user info
                const userInfo = await robloxClient.apis.usersAPI.getAuthenticatedUserInformation();
                console.log(`✅ Successfully logged in via Bloxy as: ${userInfo.name} (${userInfo.id})`);

                // Get the group and verify we can access it
                robloxGroup = await robloxClient.getGroup(config.groupId);
                const roles = await robloxGroup.getRoles();

                console.log(`✅ Found group: ${robloxGroup.name} (${robloxGroup.id}) with ${roles.length} roles`);
                robloxAuthenticated = true;
            } catch (loginErr) {
                Logger.warn('Bloxy login failed, trying alternative methods...', 'Roblox', loginErr);
            }
        } catch (bloxyErr) {
            Logger.error('Bloxy client initialization failed:', 'Roblox', bloxyErr);
        }

        // Method 2: If Bloxy failed, try direct authentication
        if (!robloxAuthenticated) {
            console.log('Attempting direct Roblox authentication...');
            try {
                // Authenticate directly using the custom util
                const directAuthUser = await directAuthenticate(cookie);

                if (directAuthUser && directAuthUser.id) {
                    console.log(`✅ Successfully authenticated directly as ${directAuthUser.name} (${directAuthUser.id})`);

                    // Store authenticated user info for global use
                    global.directAuthUser = directAuthUser;
                    global.robloxCookie = cookie;

                    // Get group info directly
                    const groupInfo = await directGetGroup(cookie, config.groupId);
                    console.log(`✅ Connected to group: ${groupInfo.name} (${groupInfo.id})`);

                    // Store group info globally
                    global.directGroupInfo = groupInfo;

                    // Verify role access
                    const roles = await directGetGroupRoles(cookie, config.groupId);
                    console.log(`✅ Authentication confirmed - found ${roles.length} group roles`);

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
            } catch (directErr) {
                Logger.error('Direct authentication failed:', 'Roblox', directErr);
                throw new Error(`All authentication methods failed: ${directErr.message}`);
            }
        }

        // Grab a CSRF token to use for future requests
        try {
            console.log('Fetching initial XSRF token...');
            const response = await fetchWithRetry('https://auth.roblox.com/v2/logout', {
                method: 'POST',
                headers: {
                    'Cookie': `.ROBLOSECURITY=${cookie}`
                }
            }, 3, 5000);
            console.log('✅ Initial XSRF token fetched successfully');
        } catch (tokenErr) {
            Logger.warn('Failed to fetch initial XSRF token, some operations may fail', 'Roblox', tokenErr);
        }

        // Initialize promotion service AFTER we've confirmed authentication
        schedulePromotionChecks();

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

        // Provide more helpful error information
        if (error.message && error.message.includes('401')) {
            console.error('\n🔑 AUTHENTICATION ERROR: Your Roblox cookie appears to be invalid or expired.');
            console.error('Please get a new cookie by:');
            console.error('1. Logging into Roblox in your browser');
            console.error('2. Opening DevTools (F12) → Application tab → Cookies → roblox.com');
            console.error('3. Copy the value of .ROBLOSECURITY cookie (without quotes)');
            console.error('4. Update your .env file with the new cookie\n');
        }

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