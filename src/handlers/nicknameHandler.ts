import { GuildMember, PermissionFlagsBits } from 'discord.js';
import { User } from 'bloxy/dist/structures';
import { prisma } from '../database/prisma';
import { robloxGroup } from '../main';
import { Logger } from '../utils/logger';

/**
 * Get the nickname format for a guild, creating default if none exists
 */
export const getNicknameFormat = async (guildId: string): Promise<string> => {
    try {
        // Get guild config with error handling
        let guildConfig = null;
        try {
            guildConfig = await prisma.guildConfig.findUnique({
                where: { guildId }
            });
        } catch (e) {
            Logger.error(`Error finding guild config: ${e.message}`, "NicknameHandler");
        }

        if (!guildConfig) {
            try {
                // Create default config if none exists
                Logger.info(`Creating new guild config for guild ${guildId}`, "NicknameHandler");
                const newConfig = await prisma.guildConfig.create({
                    data: {
                        id: guildId,
                        guildId,
                        nicknameFormat: '{rankPrefix} {robloxUsername}'
                    }
                });
                return newConfig.nicknameFormat;
            } catch (createErr) {
                Logger.error(`Failed to create guild config: ${createErr.message}`, "NicknameHandler");
                return '{rankPrefix} {robloxUsername}'; // Updated default format
            }
        }

        return guildConfig.nicknameFormat;
    } catch (err) {
        Logger.error(`Error in getNicknameFormat: ${err.message || err}`, "NicknameHandler");
        return '{rankPrefix} {robloxUsername}'; // Updated default format
    }
};

/**
 * Set the nickname format for a guild
 */
export const setNicknameFormat = async (guildId: string, format: string): Promise<string> => {
    try {
        Logger.info(`Setting nickname format for guild ${guildId} to: ${format}`, "NicknameHandler");

        try {
            // Use prisma.guildConfig (lowercase) as per prisma client conventions
            const guildConfig = await prisma.guildConfig.upsert({
                where: { guildId },
                update: { nicknameFormat: format },
                create: {
                    id: guildId,
                    guildId,
                    nicknameFormat: format
                }
            });

            Logger.info(`Successfully updated nickname format for guild ${guildId}`, "NicknameHandler");
            return guildConfig.nicknameFormat;
        } catch (dbError) {
            Logger.error(`Database error in setNicknameFormat: ${dbError.message}`, "NicknameHandler");
            throw new Error(`Failed to update nickname format: ${dbError.message}`);
        }
    } catch (err) {
        Logger.error(`Error setting nickname format for guild ${guildId}:`, "NicknameHandler", err as Error);
        throw err;
    }
};

/**
 * Generate a rank prefix from rank name
 */
const generateRankPrefix = (rankName: string, rankNumber?: number): string => {
    // If no valid rank info, return guest prefix
    if (!rankName || rankName === "Guest") {
        return "[-]";
    }

    // Exact rank prefix mappings
    const rankPrefixes: Record<string, string> = {
        "Overseer": "[-]",
        "Royal Council": "[X]",
        "General": "[X]",
        "Systems Engineer": "[X]",
        "Colonel": "[HC]",
        "Lieutenant": "[O3]",
        "Major": "[O2]",
        "Captain": "[O1]",
        "Warrant Officer": "[WO]",
        "Prodigy": "[X]",
        "Strategist": "[V]",
        "Sergeant": "[IV]",
        "Corporal": "[III]",
        "Operative": "[II]",
        "Private": "[I]",
        "Cadet": "[-]"
    };

    // Check for exact match first
    if (rankPrefixes[rankName]) {
        return rankPrefixes[rankName];
    }

    // Fallback for partial matches (in case rank name has additional text)
    for (const [rankKey, prefix] of Object.entries(rankPrefixes)) {
        if (rankName.includes(rankKey)) {
            return prefix;
        }
    }

    // Last resort fallback (should rarely happen with your rank structure)
    Logger.warn(`No prefix mapping found for rank: "${rankName}"`, "NicknameHandler");
    return "[-]";
};

/**
 * Update a user's nickname based on their Roblox profile
 */
export const updateNickname = async (member: GuildMember, robloxUser: User): Promise<boolean> => {
    try {
        // Enhanced logging with user IDs
        Logger.info(`Attempting to update nickname for ${member.user.tag} (${member.id}) with Roblox user ${robloxUser.name} (${robloxUser.id})`, "NicknameHandler");

        // Check if the bot has permission to manage nicknames
        if (!member.guild.members.me) {
            Logger.error(`Bot is not in guild ${member.guild.name}`, "NicknameHandler");
            return false;
        }

        if (!member.guild.members.me.permissions.has(PermissionFlagsBits.ManageNicknames)) {
            Logger.error(`Bot lacks ManageNicknames permission in guild ${member.guild.name}`, "NicknameHandler");
            return false;
        }

        // Check if bot's role is higher than the user's highest role
        const botMember = member.guild.members.me;
        if (member.roles.highest.position >= botMember.roles.highest.position) {
            Logger.error(`Cannot update nickname for ${member.user.tag} - their role position (${member.roles.highest.position}) is higher than or equal to bot's highest role position (${botMember.roles.highest.position})`, "NicknameHandler");
            return false;
        }

        // Skip for server owner as they can't be renamed
        if (member.guild.ownerId === member.id) {
            Logger.info(`Skipping nickname update for ${member.user.tag} because they're the server owner`, "NicknameHandler");
            return false;
        }

        // Get the nickname format
        const format = await getNicknameFormat(member.guild.id);
        Logger.info(`Using nickname format: "${format}" for guild ${member.guild.name}`, "NicknameHandler");

        // Get the user's group role
        let rankName = "Guest";
        let rankNumber = 0;
        let rankPrefix = "[-]"; // Default guest prefix - match what generateRankPrefix returns

        try {
            const groupMember = await robloxGroup.getMember(robloxUser.id);
            if (groupMember) {
                rankName = groupMember.role.name;
                rankNumber = groupMember.role.rank;
                rankPrefix = generateRankPrefix(rankName, rankNumber);
                Logger.info(`Found group member: ${robloxUser.name} with rank: ${rankName} (${rankPrefix})`, "NicknameHandler");
            } else {
                Logger.info(`User ${robloxUser.name} is not a group member, using "Guest" as rank`, "NicknameHandler");
            }
        } catch (err) {
            Logger.error(`Error getting group member for ${robloxUser.name}:`, "NicknameHandler", err as Error);
            // Continue with "Guest" rank
        }

        // Safely handle replacements with proper logging
        try {
            // Start with the format string
            let nickname = format;

            // Create placeholders map for easy debug
            const placeholders = [
                { key: '{robloxUsername}', value: robloxUser.name || 'Unknown' },
                { key: '{robloxDisplayName}', value: robloxUser.displayName || robloxUser.name || 'Unknown' },
                { key: '{rankName}', value: rankName },
                { key: '{rankPrefix}', value: rankPrefix }
            ];

            // Debug each value
            placeholders.forEach(ph => {
                Logger.debug(`Placeholder ${ph.key} = "${ph.value}"`, "NicknameHandler");
            });

            // Apply all replacements
            for (const { key, value } of placeholders) {
                const before = nickname;
                // Use a simple string replacement instead of regex to avoid any potential issues
                nickname = nickname.split(key).join(value);

                if (before !== nickname) {
                    Logger.debug(`Replaced "${key}" with "${value}"`, "NicknameHandler");
                } else {
                    Logger.debug(`No instances of "${key}" found in format`, "NicknameHandler");
                }
            }

            // Debug before and after
            Logger.info(`Format string: "${format}"`, "NicknameHandler");
            Logger.info(`Generated rankPrefix: "${rankPrefix}"`, "NicknameHandler");
            Logger.info(`After replacement: "${nickname}"`, "NicknameHandler");

            // Discord nickname has 32 character limit
            if (nickname.length > 32) {
                nickname = nickname.substring(0, 32);
                Logger.info(`Nickname truncated to 32 chars: "${nickname}"`, "NicknameHandler");
            }

            // Only update if the nickname is different
            if (member.nickname !== nickname) {
                try {
                    await member.setNickname(nickname, 'Automatic nickname update from bot');
                    Logger.info(`Successfully updated nickname for ${member.user.tag} to: ${nickname}`, "NicknameHandler");
                    return true;
                } catch (nickErr) {
                    Logger.error(`Failed to set nickname for ${member.user.tag}:`, "NicknameHandler", nickErr as Error);
                    return false;
                }
            } else {
                Logger.info(`No nickname change needed for ${member.user.tag} - already set to ${nickname}`, "NicknameHandler");
                return false;
            }
        } catch (formatErr) {
            Logger.error(`Error formatting nickname: ${formatErr.message}`, "NicknameHandler");
            return false;
        }
    } catch (err) {
        Logger.error(`Error updating nickname for ${member.user.tag}:`, "NicknameHandler", err as Error);
        return false;
    }
};