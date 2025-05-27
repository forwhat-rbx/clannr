import { QbotClient } from './structures/QbotClient';
import { patchBloxyLibrary, monkeyPatchBloxyLibrary } from './utils/bloxyPatch';
import { Client as RobloxClient } from 'bloxy';
import { handleInteraction } from './handlers/handleInteraction';
import { handleLegacyCommand } from './handlers/handleLegacyCommand';
import { config } from './config';
import { Group, GroupMember } from 'bloxy/dist/structures';
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
import { promiseWithTimeout } from './utils/timeoutUtil';
import { directAuthenticate, getXCSRFToken, directGetGroup, directGetGroupRoles, directGetGroupAuditLogs } from './utils/directAuth';
import { initializeDatabase } from './database/dbInit';
import { deployCommands } from './utils/deployCommands';

require('dotenv').config();

// Apply Bloxy patches immediately - BEFORE any Bloxy code runs
Logger.info('Applying Bloxy library patches...', 'Startup');
const patchSuccess = patchBloxyLibrary();
if (!patchSuccess) {
    // Fall back to monkey patching if direct patch fails
    Logger.info('Direct patch failed, applying monkey patch...', 'BloxyPatch');
    monkeyPatchBloxyLibrary();
}

// [Ensure Setup]
if (!process.env.ROBLOX_COOKIE) {
    Logger.error('ROBLOX_COOKIE is not set in the .env file.', 'Auth', null);
    process.exit(1);
}

require('./database');
initializeDatabase().catch(err => {
    Logger.error('Failed to initialize database', 'Database', err);
});
require('./api');

// [Clients]
const discordClient = new QbotClient();
discordClient.login(process.env.DISCORD_TOKEN);
discordClient.once('ready', async () => {

    try {
        await deployCommands();
        Logger.info('Commands deployed successfully', 'Discord');
    } catch (error) {
        Logger.error('Failed to deploy commands', 'Discord', error);
    }

    Logger.info(`Discord connected as ${discordClient.user.tag} (${discordClient.user.id})`, 'Discord');

    // Log guild information to verify bot is in expected servers
    Logger.info(`Connected to ${discordClient.guilds.cache.size} guilds:`, 'Discord');
    discordClient.guilds.cache.forEach(guild => {
        Logger.info(`- ${guild.name} (${guild.id}) | Members: ${guild.memberCount}`, 'Discord');
    });

    // Verify slash command registration
    Logger.info(`Bot has ${discordClient.application.commands.cache.size} global commands registered`, 'Discord');
});
const robloxClient = new RobloxClient({ credentials: { cookie: process.env.ROBLOX_COOKIE } });

try {
    // Fix requester issue at runtime if needed
    const RESTController = require('bloxy/dist/controllers/rest/RESTController').default;
    if (RESTController.prototype.requester !== undefined && typeof RESTController.prototype.requester !== 'function') {
        Logger.warn('Detected non-function requester at runtime, applying fix', 'BloxyPatch');
        RESTController.prototype.requester = function (options) {
            return this.request(options);
        };
    }
} catch (e) {
    Logger.warn('Runtime patch check failed, but continuing', 'BloxyPatch');
}

let robloxGroup: Group = null;

class DirectGroupMember {
    id: number;
    name: string;
    displayName: string;
    group: any;
    client: any;

    // Use the proper role structure that matches GroupRole
    role: {
        id: number;
        name: string;
        rank: number;
        group: any;
        client: any;
    };

    constructor(userId: number, username: string, roleData: { id: number; name: string; rank: number }) {
        this.id = userId;
        this.name = username;
        this.displayName = username;
        this.group = { id: config.groupId };
        this.client = robloxClient;

        // Create a proper role object that satisfies GroupRole requirements
        this.role = {
            id: roleData.id,
            name: roleData.name,
            rank: roleData.rank,
            group: this.group,
            client: this.client
        };
    }

    // Stub methods required by GroupMember interface
    async kick() { throw new Error('Not implemented'); }
    async setRole() { throw new Error('Not implemented'); }
    getRank() { return this.role.rank; }

    // Add other stubs for methods we might use
    async getStatus() { return ""; }
    async getAvatar() { return null; }
    async getCurrentlyWearing() { return []; }
    async kickFromGroup() { throw new Error('Not implemented'); }
}

(async () => {
    try {
        Logger.info('Attempting to login to Roblox...', 'Auth');

        // First, try direct authentication (which is much more reliable)
        try {
            const authResult = await promiseWithTimeout(
                directAuthenticate(process.env.ROBLOX_COOKIE),
                15000,
                'Direct authentication timed out'
            );

            Logger.info(`Successfully logged in as: ${authResult.name} (${authResult.id})`, 'Auth');

            // Try to get a CSRF token since we bypassed the normal login
            try {
                const token = await promiseWithTimeout(
                    getXCSRFToken(process.env.ROBLOX_COOKIE),
                    10000,
                    'CSRF token fetch timed out'
                );
                Logger.info('CSRF token acquired successfully', 'Auth');
            } catch (tokenErr) {
                Logger.warn('Failed to get CSRF token, some operations may fail', 'Auth', tokenErr);
            }
        } catch (directAuthError) {
            Logger.warn('Direct authentication failed, falling back to Bloxy login', 'Auth', directAuthError);

            // Fall back to original login method
            await promiseWithTimeout(
                robloxClient.login(),
                30000,
                'Roblox login timed out'
            );

            Logger.info('Fallback login succeeded', 'Auth');
        }

        // Continue with the rest of your initialization
        Logger.info('Initializing log channels...', 'Auth');

        // Add timeout to log channel initialization
        try {
            await promiseWithTimeout(
                initializeLogChannels(),
                30000, // Increased from 10 to 30 seconds
                'Log channel initialization timed out'
            );
            Logger.info('Log channels initialized successfully', 'Auth');
        } catch (logChannelError) {
            // Continue even if log channels fail to initialize
            Logger.warn(`Log channel initialization issue: ${logChannelError.message}`, 'Auth');
            Logger.warn('Continuing startup with limited logging capabilities', 'Auth');
        }

        Logger.info('Proceeding with group initialization...', 'Auth');

        Logger.info('Log channels initialized, fetching group...', 'Auth');

        try {
            Logger.info('Fetching group information...', 'Auth');

            // Use our direct methods that don't rely on Bloxy
            const groupData = await promiseWithTimeout(
                directGetGroup(process.env.ROBLOX_COOKIE, config.groupId),
                15000,
                'Group fetch timed out'
            );

            // Create a mock Group object with the minimum functionality we need
            robloxGroup = {
                id: groupData.id,
                name: groupData.name,
                client: robloxClient,

                // Add essential methods needed by your bot
                getRoles: async () => {
                    return await directGetGroupRoles(process.env.ROBLOX_COOKIE, config.groupId);
                },

                getMember: async (userId: number): Promise<GroupMember> => {
                    try {
                        const response = await fetch(`https://groups.roblox.com/v2/users/${userId}/groups/roles`, {
                            method: 'GET',
                            headers: {
                                'Cookie': `.ROBLOSECURITY=${process.env.ROBLOX_COOKIE}`,
                                'Content-Type': 'application/json'
                            }
                        });

                        if (!response.ok) throw new Error(`Failed to get member with status: ${response.status}`);

                        // Type the response
                        interface GroupRolesResponse {
                            data: Array<{
                                group: { id: number; name: string };
                                role: { id: number; name: string; rank: number };
                                user: { userId: number; username: string };
                            }>;
                        }

                        const data = await response.json() as GroupRolesResponse;
                        const groupMembership = data.data.find(g => g.group.id === config.groupId);

                        if (!groupMembership) return null;

                        // Fetch additional user information if needed
                        const userResponse = await fetch(`https://users.roblox.com/v1/users/${userId}`, {
                            method: 'GET',
                            headers: {
                                'Cookie': `.ROBLOSECURITY=${process.env.ROBLOX_COOKIE}`,
                                'Content-Type': 'application/json'
                            }
                        });

                        if (!userResponse.ok) {
                            Logger.warn(`Failed to get additional user info for ${userId}`, 'DirectAuth');
                        }

                        // Create a DirectGroupMember that implements the required interface
                        const member = new DirectGroupMember(
                            userId,
                            groupMembership.user.username,
                            groupMembership.role
                        );

                        // Double cast to avoid TypeScript errors
                        return member as unknown as GroupMember;
                    } catch (err) {
                        Logger.error(`Failed to get member ${userId}:`, 'DirectAuth', err);
                        return null;
                    }
                },

                // Add other required methods as needed
                getAuditLogs: async (params = {}) => {
                    try {
                        const data = await directGetGroupAuditLogs(process.env.ROBLOX_COOKIE, config.groupId, params);
                        return data;
                    } catch (err) {
                        Logger.error(`Failed to get audit logs: ${err.message}`, 'DirectAuth');
                        return { data: [] }; // Return empty data on error
                    }
                },
                getSettings: async () => { return { isLocked: false }; },
                getJoinRequests: async () => { return []; },

                // Any other methods you need can be added here
            } as unknown as Group; // Cast to Group type

            Logger.info(`Found group: ${groupData.name} (${groupData.id})`, 'Auth');

            // Get roles directly
            const roles = await promiseWithTimeout(
                directGetGroupRoles(process.env.ROBLOX_COOKIE, config.groupId),
                15000,
                'Group roles fetch timed out'
            );

            Logger.info(`Authentication confirmed - found ${roles.length} group roles`, 'Auth');

        } catch (error) {
            Logger.error('Failed to fetch group information:', 'Auth', error);
            throw error; // Let the outer catch handle this
        }

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

        // Patch the canvas module if it's available - DO NOT modify xpcard.ts directly
        try {
            const originalRequire = module.require;
            // @ts-ignore
            module.require = function (path) {
                if (path === 'canvas') {
                    try {
                        return originalRequire(path);
                    } catch (err) {
                        Logger.warn('Canvas module not available, using mock implementation', 'Canvas');
                        return require('./utils/canvasMock');
                    }
                }
                return originalRequire(path);
            };

            Logger.info('Canvas module patched for compatibility', 'Startup');
        } catch (e) {
            Logger.warn('Failed to patch canvas module, image generation may not work', 'Startup', e);
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