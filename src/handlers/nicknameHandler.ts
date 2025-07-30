import { GuildMember, PermissionFlagsBits } from 'discord.js';
import { User } from 'bloxy/dist/structures';
import { prisma } from '../database/prisma';
import { robloxGroup } from '../main';

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
            console.error(`Error finding guild config: ${e.message}`);
        }

        if (!guildConfig) {
            try {
                // Create default config if none exists
                console.log(`Creating new guild config for guild ${guildId}`);
                const newConfig = await prisma.guildConfig.create({
                    data: {
                        id: guildId,
                        guildId,
                        nicknameFormat: '{rankPrefix} {robloxUsername}'
                    }
                });
                return newConfig.nicknameFormat;
            } catch (createErr) {
                console.error(`Failed to create guild config: ${createErr.message}`);
                return '{rankPrefix} {robloxUsername}'; // Updated default format
            }
        }

        return guildConfig.nicknameFormat;
    } catch (err) {
        console.error(`Error in getNicknameFormat: ${err.message || err}`);
        return '{rankPrefix} {robloxUsername}'; // Updated default format
    }
};

/**
 * Set the nickname format for a guild
 */
export const setNicknameFormat = async (guildId: string, format: string): Promise<string> => {
    try {
        console.log(`Setting nickname format for guild ${guildId} to: ${format}`);

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

            console.log(`Successfully updated nickname format for guild ${guildId}`);
            return guildConfig.nicknameFormat;
        } catch (dbError) {
            console.error(`Database error in setNicknameFormat: ${dbError.message}`, dbError);
            throw new Error(`Failed to update nickname format: ${dbError.message}`);
        }
    } catch (err) {
        console.error(`Error setting nickname format for guild ${guildId}:`, err);
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
    console.log(`No prefix mapping found for rank: "${rankName}"`);
    return "[-]";
};

/**
 * Update a user's nickname based on their Roblox profile
 */
export const updateNickname = async (member: GuildMember, robloxUser: User): Promise<boolean> => {
    try {
        // Enhanced logging with user IDs
        console.log(`Attempting to update nickname for ${member.user.tag} (${member.id}) with Roblox user ${robloxUser.name} (${robloxUser.id})`);

        // Check if the bot has permission to manage nicknames
        if (!member.guild.members.me) {
            console.error(`Bot is not in guild ${member.guild.name}`);
            return false;
        }

        if (!member.guild.members.me.permissions.has(PermissionFlagsBits.ManageNicknames)) {
            console.error(`Bot lacks ManageNicknames permission in guild ${member.guild.name}`);
            return false;
        }

        // Check if bot's role is higher than the user's highest role
        const botMember = member.guild.members.me;
        if (member.roles.highest.position >= botMember.roles.highest.position) {
            console.error(`Cannot update nickname for ${member.user.tag} - their role position (${member.roles.highest.position}) is higher than or equal to bot's highest role position (${botMember.roles.highest.position})`);
            return false;
        }

        // Skip for server owner as they can't be renamed
        if (member.guild.ownerId === member.id) {
            console.log(`Skipping nickname update for ${member.user.tag} because they're the server owner`);
            return false;
        }

        // Get the nickname format
        const format = await getNicknameFormat(member.guild.id);
        console.log(`Using nickname format: "${format}" for guild ${member.guild.name}`);

        // Get the user's group role
        let rankName = "Guest";
        let rankNumber = 0;
        let rankPrefix = "[G]"; // Default guest prefix

        try {
            const groupMember = await robloxGroup.getMember(robloxUser.id);
            if (groupMember) {
                rankName = groupMember.role.name;
                rankNumber = groupMember.role.rank;
                rankPrefix = generateRankPrefix(rankName, rankNumber);
                console.log(`Found group member: ${robloxUser.name} with rank: ${rankName} (${rankPrefix})`);
            } else {
                console.log(`User ${robloxUser.name} is not a group member, using "Guest" as rank`);
            }
        } catch (err) {
            console.error(`Error getting group member for ${robloxUser.name}:`, err);
            // Continue with "Guest" rank
        }

        // Format the nickname with all placeholders
        let nickname = format
            .replace(/{robloxUsername}/g, robloxUser.name)
            .replace(/{robloxDisplayName}/g, robloxUser.displayName || robloxUser.name)
            .replace(/{rankName}/g, rankName)
            .replace(/{rankPrefix}/g, rankPrefix);

        // Add debugging to see what's happening
        console.log(`Format string: "${format}"`);
        console.log(`Generated rankPrefix: "${rankPrefix}"`);
        console.log(`After replacement: "${nickname}"`);

        // Discord nickname has 32 character limit
        if (nickname.length > 32) {
            nickname = nickname.substring(0, 32);
            console.log(`Nickname truncated to 32 chars: "${nickname}"`);
        }

        // Only update if the nickname is different
        if (member.nickname !== nickname) {
            try {
                await member.setNickname(nickname, 'Automatic nickname update from bot');
                console.log(`Successfully updated nickname for ${member.user.tag} to: ${nickname}`);
                return true;
            } catch (nickErr) {
                console.error(`Failed to set nickname for ${member.user.tag}:`, nickErr);
                return false;
            }
        } else {
            console.log(`No nickname change needed for ${member.user.tag} - already set to ${nickname}`);
            return false;
        }
    } catch (err) {
        console.error(`Error updating nickname for ${member.user.tag}:`, err);
        return false;
    }
};