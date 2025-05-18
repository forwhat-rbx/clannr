import { TextChannel, User as DiscordUser } from 'discord.js';
import { GroupMember, PartialUser, User as RobloxUser } from 'bloxy/dist/structures';
import { discordClient } from '../main';
import { getLogEmbed } from './locale'; // Ensure this function is correctly defined
import { config } from '../config';
import { recordAction as recordAbuseAction } from './abuseDetection'; // Renamed to avoid confusion
import { ActivityLogger, ModAction } from '../utils/activityLogger'; // Ensure ModAction is exported

let actionLogChannel: TextChannel | null = null;

/**
 * Fetches the log channels from the Discord client and assigns them to variables.
 * Should be called once at bot startup.
 */
const getLogChannels = async () => {
    if (config.logChannels.actions) {
        try {
            const channel = await discordClient.channels.fetch(config.logChannels.actions);
            if (channel && channel.isTextBased()) {
                actionLogChannel = channel as TextChannel;
                console.log(`[LOG_INIT] Action log channel "${actionLogChannel.name}" fetched successfully.`);
            } else {
                console.error('[LOG_INIT] Failed to fetch action log channel or it is not a text channel.');
                actionLogChannel = null;
            }
        } catch (error) {
            console.error(`[LOG_INIT] Error fetching action log channel: ${error.message}`);
            actionLogChannel = null;
        }
    } else {
        console.warn('[LOG_INIT] No action log channel ID configured.');
    }
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
    actor: DiscordUser | RobloxUser | GroupMember | string,
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

    if (typeof actor === 'string') {
        actorName = actor;
        actorId = actor.replace(/\s+/g, '_').toUpperCase();
    } else if ('tag' in actor) { // DiscordUser
        actorId = actor.id;
        actorName = actor.tag;
        if (actor.id === discordClient.user?.id) {
            isBotItself = true;
        }
        if (!isBotItself) {
            recordAbuseAction(actor as DiscordUser); // Cast actor to DiscordUser
        }
    } else if ('name' in actor && 'id' in actor) { // RobloxUser or GroupMember
        actorId = actor.id.toString();
        actorName = actor.name;
    } else {
        actorId = (actor as any)?.id?.toString() || 'UNKNOWN_ACTOR';
        actorName = (actor as any)?.name || 'Unknown Actor';
        console.warn(`[LOG_ACTION] Unknown actor type for action "${actionType}":`, actor);
    }

    const timestamp = new Date();
    const logPrefix = `[${actionType.toUpperCase()}] by ${actorName}(${actorId})`;

    // Log to console (uses generalDetails)
    console.log(`${timestamp.toISOString()} ${logPrefix} - Target: ${targetRobloxUser?.name || 'N/A'} - Details: ${generalDetails || 'N/A'} - Reason: ${reason || 'N/A'}`);

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
            console.error(`${logPrefix} Failed to send Discord log embed: ${error.message}`);
        }
    } else if (sendToDiscordChannel && !actionLogChannel && (!isBotItself || actionType.startsWith("User Action"))) {
        console.warn(`${logPrefix} Discord action log channel not available. Action not logged to Discord.`);
    }

    // Log to ActivityLogger (uses generalDetails)
    const activityLogActorId = (typeof actor === 'string') ? actorId : actor.id.toString();
    const activityLogActorName = actorName;

    const modActionEntry: ModAction = {
        timestamp: timestamp,
        action: actionType,
        target: targetRobloxUser?.id?.toString(),
        targetName: targetRobloxUser?.name,
        details: generalDetails,
        reason: reason,
    };

    try {
        await ActivityLogger.logAction(activityLogActorId, activityLogActorName, modActionEntry);
    } catch (error) {
        console.error(`${logPrefix} Failed to write to ActivityLogger: ${error.message}`);
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


export { logAction, getLogChannels, logSystemAction };