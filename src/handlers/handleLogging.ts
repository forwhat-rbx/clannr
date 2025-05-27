import { TextChannel, User as DiscordUser, EmbedBuilder } from 'discord.js';
import { GroupMember, PartialUser, User as RobloxUser } from 'bloxy/dist/structures';
import { discordClient } from '../main';
import { getLogEmbed } from './locale'; // Ensure this function is correctly defined
import { config } from '../config';
import { recordAction as recordAbuseAction } from './abuseDetection'; // Renamed to avoid confusion
import { ActivityLogger, ModAction } from '../utils/activityLogger'; // Ensure ModAction is exported
import { embedColors, createBaseEmbed } from '../utils/embedUtils';
import { Logger } from '../utils/logger';

let actionLogChannel: TextChannel | null = null;
let verificationLogChannel: TextChannel | null = null;

/**
 * Fetches the log channels from the Discord client and assigns them to variables.
 * Should be called once at bot startup.
 */
const getLogChannels = async () => {
    let initSuccessful = false;

    // For action log channel
    if (config.logChannels && config.logChannels.actions) {
        try {
            const channel = await discordClient.channels.fetch(config.logChannels.actions);
            if (channel && channel.isTextBased()) {
                actionLogChannel = channel as TextChannel;
                Logger.info(`Action log channel "${actionLogChannel.name}" fetched successfully.`, 'LogInit');
                initSuccessful = true;
            } else {
                Logger.error('Failed to fetch action log channel or it is not a text channel.', 'LogInit');
                actionLogChannel = null;
            }
        } catch (error) {
            Logger.error(`Error fetching action log channel: ${error.message}`, 'LogInit', error);
            actionLogChannel = null;
        }
    } else {
        Logger.warn('No action log channel ID configured.', 'LogInit');
    }

    // For verification log channel
    if (config.logChannels && config.logChannels.verification) {
        try {
            const channel = await discordClient.channels.fetch(config.logChannels.verification);
            if (channel && channel.isTextBased()) {
                verificationLogChannel = channel as TextChannel;
                Logger.info(`Verification log channel "${verificationLogChannel.name}" fetched successfully.`, 'LogInit');
                initSuccessful = true;
            } else {
                Logger.error('Failed to fetch verification log channel or it is not a text channel.', 'LogInit');
                verificationLogChannel = null;
            }
        } catch (error) {
            Logger.error(`Error fetching verification log channel: ${error.message}`, 'LogInit', error);
            verificationLogChannel = null;
        }
    } else {
        Logger.warn('No verification log channel ID configured.', 'LogInit');
    }

    // Check other channels like shout and rankup
    // These are non-critical, so we don't fail if they're not available
    if (config.logChannels && config.logChannels.shout) {
        try {
            await discordClient.channels.fetch(config.logChannels.shout);
            // No need to store this channel, just validate it exists
            Logger.info('Shout log channel fetched successfully.', 'LogInit');
        } catch (error) {
            Logger.warn(`Shout log channel not available: ${error.message}`, 'LogInit');
        }
    }

    if (config.logChannels && config.logChannels.rankup) {
        try {
            await discordClient.channels.fetch(config.logChannels.rankup);
            // No need to store this channel, just validate it exists
            Logger.info('Rankup log channel fetched successfully.', 'LogInit');
        } catch (error) {
            Logger.warn(`Rankup log channel not available: ${error.message}`, 'LogInit');
        }
    }

    // As long as at least one channel was initialized, consider it successful
    if (!initSuccessful) {
        Logger.warn('No log channels were initialized successfully', 'LogInit');
    }

    return { actionLogChannel, verificationLogChannel };
};

const logVerificationEvent = async (
    discordUser: DiscordUser,
    eventType: 'Verification Started' | 'Verification Success' | 'Verification Failed' | 'Account Unlinked',
    robloxInfo: { id: string | number, username: string } | null,
    details?: string
): Promise<void> => {
    if (!verificationLogChannel) {
        Logger.warn(`Verification log channel not available. Event not logged.`, 'VerificationLog');
        return;
    }

    // Choose color based on event type
    let colorType: keyof typeof embedColors;
    switch (eventType) {
        case 'Verification Success':
            colorType = 'verificationSuccess';
            break;
        case 'Verification Failed':
            colorType = 'verificationFailed';
            break;
        case 'Account Unlinked':
            colorType = 'accountUnlinked';
            break;
        default:
            colorType = 'verificationPending';
    }

    // Create base embed with appropriate color
    const embed = createBaseEmbed(colorType)
        .setTitle(`Account ${eventType}`)
        .addFields(
            { name: 'Discord User', value: `<@${discordUser.id}> (${discordUser.tag})`, inline: true }
        )
        .setFooter({ text: `User ID: ${discordUser.id}` });

    // Add Roblox information if available
    if (robloxInfo) {
        embed.addFields({
            name: 'Roblox Account',
            value: `[${robloxInfo.username}](https://www.roblox.com/users/${robloxInfo.id}/profile) (ID: ${robloxInfo.id})`,
            inline: true
        });

        // Add thumbnail for Roblox avatar if we have an ID
        embed.setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${robloxInfo.id}&width=420&height=420&format=png`);
    }

    // Add details if provided
    if (details) {
        embed.addFields({ name: 'Details', value: details });
    }

    try {
        await verificationLogChannel.send({ embeds: [embed] });
    } catch (error) {
        Logger.error(`Failed to send verification log to Discord: ${error.message}`, 'VerificationLog', error);
    }

    // Also log to console for backup
    Logger.info(`${eventType} | Discord: ${discordUser.tag} (${discordUser.id}) | Roblox: ${robloxInfo?.username || 'N/A'} (${robloxInfo?.id || 'N/A'}) | ${details || ''}`, 'VerificationEvent');
};

/**
 * Internal logging function for standardized logging to console, Discord, and ActivityLogger.
 *
 * @param actionType - The type of action performed.
 * @param actor - The user, system component, or entity performing the action.
 * @param reason - Optional reason for the action.
 * @param targetRobloxUser - Optional Roblox user being acted upon.
 * @param generalDetails - General details for console, ActivityLogger, and potentially as a fallback.
 * @param endDate - Optional end date for time-bound actions.
 * @param sendToDiscordChannel - Whether to attempt sending this log to the Discord log channel.
 * @param discordRankChange - Specific rank change detail for Discord embed.
 * @param discordBody - Specific body detail for Discord embed.
 * @param discordXpChange - Specific XP change detail for Discord embed.
 */
const _internalLog = async (
    actionType: string,
    actor: DiscordUser | RobloxUser | GroupMember | any,
    reason?: string,
    targetRobloxUser?: RobloxUser | PartialUser,
    generalDetails?: string,
    endDate?: Date,
    sendToDiscordChannel: boolean = true,
    discordRankChange?: string,
    discordBody?: string,
    discordXpChange?: string
): Promise<void> => {
    let actorId: string = 'SYSTEM';
    let actorName: string = 'System';
    let isBotItself = false;

    // Handle different actor types safely
    if (typeof actor === 'string') {
        // String actor (like "System" or "Promotion Service")
        actorName = actor;
        actorId = actor.replace(/\s+/g, '_').toUpperCase();
    } else if (actor && typeof actor === 'object') {
        if ('tag' in actor) {
            // Discord User
            actorId = actor.id;
            actorName = actor.tag;
            if (actor.id === discordClient.user?.id) {
                isBotItself = true;
            }
            if (!isBotItself) {
                recordAbuseAction(actor as DiscordUser);
            }
        } else if ('name' in actor && 'id' in actor) {
            // Standard Roblox User or GroupMember object
            actorId = String(actor.id);
            actorName = actor.name;
        } else if ('username' in actor || 'displayName' in actor) {
            // Handle alternative Roblox user formats
            if ('userId' in actor) {
                actorId = String(actor.userId);
                actorName = actor.username || actor.displayName || 'Unknown Roblox User';
            } else if ('user_id' in actor) {
                actorId = String(actor.user_id);
                actorName = actor.username || actor.displayName || 'Unknown Roblox User';
            } else {
                // Try to extract any ID-like field
                actorId = String(actor.id || actor.userId || actor.user_id || 'UNKNOWN_ID');
                actorName = actor.username || actor.displayName || actor.name || 'Unknown Roblox User';
            }
        } else {
            // Unknown object format - extract what we can
            actorId = String(actor.id || actor.userId || actor.user_id || 'UNKNOWN_ID');
            actorName = actor.name || actor.username || actor.displayName || 'Unknown Actor';

            // Log the unexpected structure for debugging
            Logger.warn(`Unknown actor structure for action "${actionType}": ${JSON.stringify(actor)}`, 'Logging');
        }
    } else {
        // If actor is null/undefined or an unexpected type
        Logger.warn(`Invalid actor type for action "${actionType}": ${typeof actor}`, 'Logging');
    }

    const timestamp = new Date();
    const logPrefix = `[${actionType.toUpperCase()}] by ${actorName}(${actorId})`;

    // Log to console (uses generalDetails)
    Logger.info(`${logPrefix} - Target: ${targetRobloxUser?.name || 'N/A'} - Details: ${generalDetails || 'N/A'} - Reason: ${reason || 'N/A'}`, 'ActionLog');

    // Log to Discord channel
    if (sendToDiscordChannel && actionLogChannel && (!isBotItself || actionType.startsWith("User Action"))) {
        try {
            // Assuming getLogEmbed signature: (actionType, actor, reason, target, rankChange, endDate, body, xpChange)
            const logEmbed = await getLogEmbed(
                actionType,
                actor,
                reason,
                targetRobloxUser,
                discordRankChange, // Use specific rankChange for embed
                endDate,
                discordBody,       // Use specific body for embed
                discordXpChange    // Use specific xpChange for embed
            );
            await actionLogChannel.send({ embeds: [logEmbed] });
        } catch (error) {
            Logger.error(`${logPrefix} Failed to send Discord log embed: ${error.message}`, 'LogAction', error);
        }
    } else if (sendToDiscordChannel && !actionLogChannel && (!isBotItself || actionType.startsWith("User Action"))) {
        Logger.warn(`${logPrefix} Discord action log channel not available. Action not logged to Discord.`, 'LogAction');
    }

    // Log to ActivityLogger (uses generalDetails) - handle this safely
    try {
        // Safely get actorId for ActivityLogger
        let activityLogActorId = actorId;

        // Create mod action entry with safe values
        const modActionEntry: ModAction = {
            timestamp: timestamp,
            action: actionType,
            target: targetRobloxUser?.id ? String(targetRobloxUser.id) : undefined,
            targetName: targetRobloxUser?.name,
            details: generalDetails,
            reason: reason,
        };

        await ActivityLogger.logAction(activityLogActorId, actorName, modActionEntry);
    } catch (error) {
        Logger.error(`${logPrefix} Failed to write to ActivityLogger: ${error.message}`, 'ActivityLogger', error);
    }
};

/**
 * Logs an action to the designated action log channel. (Backward compatible)
 * This function will now call _internalLog.
 */
const logAction = async (
    action: string,
    moderator: DiscordUser | RobloxUser | GroupMember | any,
    reason?: string,
    target?: RobloxUser | PartialUser,
    rankChange?: string, // Original distinct field
    endDate?: Date,
    body?: string,       // Original distinct field
    xpChange?: string    // Original distinct field
) => {
    // Construct a general details string for console and ActivityLogger.
    // This can be simpler now as distinct fields are passed for the embed.
    let generalDetailsString = "";
    if (rankChange) generalDetailsString += `Rank Change: ${rankChange}. `;
    if (body) generalDetailsString += `Body: ${body}. `;
    if (xpChange) generalDetailsString += `XP Change: ${xpChange}. `;
    // If the specific action primarily conveys its meaning through one of these,
    // ensure generalDetailsString captures it. For "Promotion Execution Start",
    // rankChange holds the main message.
    if (!generalDetailsString && rankChange) generalDetailsString = rankChange;
    if (!generalDetailsString && body) generalDetailsString = body;
    if (!generalDetailsString && xpChange) generalDetailsString = xpChange;
    if (generalDetailsString.trim() === "") generalDetailsString = undefined;


    const isBotItself = moderator && discordClient.user && moderator.id === discordClient.user.id;

    await _internalLog(
        action,
        moderator,
        reason,
        target,
        generalDetailsString, // Pass the general/composite details for console/file
        endDate,
        !isBotItself,         // sendToDiscordChannel
        rankChange,           // Pass original rankChange for Discord embed
        body,                 // Pass original body for Discord embed
        xpChange              // Pass original xpChange for Discord embed
    );
};

/**
 * A new logging function for system-initiated actions or actions where more control over Discord logging is needed.
 */
const logSystemAction = async (
    actionType: string,
    actor: string,
    reason?: string,
    targetRobloxUser?: RobloxUser | PartialUser,
    details?: string, // This is generalDetails
    sendToDiscord: boolean = false
): Promise<void> => {
    // System actions provide a single 'details' string for generalDetails.
    // Pass undefined for the Discord-specific legacy fields.
    await _internalLog(
        actionType,
        actor,
        reason,
        targetRobloxUser,
        details, // generalDetails
        undefined, // endDate
        sendToDiscord,
        undefined, // discordRankChange
        undefined, // discordBody
        undefined  // discordXpChange
    );
};


export { logAction, getLogChannels, logSystemAction, logVerificationEvent };