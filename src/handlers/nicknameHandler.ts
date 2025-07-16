import { GuildMember, PermissionFlagsBits } from 'discord.js';
import { User } from 'bloxy/dist/structures';
import { prisma } from '../database/prisma';
import { robloxGroup } from '../main';

/**
 * Get the nickname format for a guild, creating default if none exists
 */
export const getNicknameFormat = async (guildId: string): Promise<string> => {
    try {
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
                console.log(`Creating new guild config for guild ${guildId}`);
                const newConfig = await prisma.guildConfig.create({
                    data: {
                        id: guildId,
                        guildId,
                        nicknameFormat: '[{rankNumber}] {robloxUsername}' // More universal default
                    }
                });
                return newConfig.nicknameFormat;
            } catch (createErr) {
                console.error(`Failed to create guild config: ${createErr.message}`);
                return '[{rankNumber}] {robloxUsername}';
            }
        }

        return guildConfig.nicknameFormat;
    } catch (err) {
        console.error(`Error in getNicknameFormat: ${err.message || err}`);
        return '[{rankNumber}] {robloxUsername}';
    }
};

/**
 * Set the nickname format for a guild
 */
export const setNicknameFormat = async (guildId: string, format: string): Promise<string> => {
    try {
        console.log(`Setting nickname format for guild ${guildId} to: ${format}`);

        try {
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
 * Get or create rank prefix mappings for a guild
 */
export const getRankPrefixMappings = async (guildId: string): Promise<Record<string, string>> => {
    try {
        const guildConfig = await prisma.guildConfig.findUnique({
            where: { guildId }
        });

        if (guildConfig?.rankPrefixMappings) {
            return JSON.parse(guildConfig.rankPrefixMappings);
        }

        // Return empty object if no custom mappings exist
        return {};
    } catch (err) {
        console.error(`Error getting rank prefix mappings: ${err.message}`);
        return {};
    }
};

/**
 * Set rank prefix mappings for a guild
 */
export const setRankPrefixMappings = async (guildId: string, mappings: Record<string, string>): Promise<void> => {
    try {
        await prisma.guildConfig.upsert({
            where: { guildId },
            update: { rankPrefixMappings: JSON.stringify(mappings) },
            create: {
                id: guildId,
                guildId,
                nicknameFormat: '[{rankNumber}] {robloxUsername}',
                rankPrefixMappings: JSON.stringify(mappings)
            }
        });
        console.log(`Updated rank prefix mappings for guild ${guildId}`);
    } catch (err) {
        console.error(`Error setting rank prefix mappings: ${err.message}`);
        throw err;
    }
};

/**
 * Generate a rank prefix 
 */
const generateRankPrefix = async (rankName: string, rankNumber: number, guildId: string): Promise<string> => {
    // Get custom mappings for this guild
    const customMappings = await getRankPrefixMappings(guildId);

    // Check for exact rank name match first
    if (customMappings[rankName]) {
        return customMappings[rankName];
    }

    // Check for rank number match (useful for consistent prefixes across rank changes)
    const rankNumberKey = `rank_${rankNumber}`;
    if (customMappings[rankNumberKey]) {
        return customMappings[rankNumberKey];
    }

    // No custom mapping found - log and return empty string
    console.warn(`No rank prefix mapping found for rank "${rankName}" (${rankNumber}) in guild ${guildId}. Consider setting up custom rank prefix mappings.`);
    return '';
};

/**
 * Generate a rank abbreviation from rank name (fallback option)
 */
const generateRankAbbreviation = (rankName: string): string => {
    if (!rankName || rankName === "Guest") return "G";

    // Take first letter of each word, max 3 characters
    const words = rankName.split(' ');
    let abbreviation = '';

    for (const word of words) {
        if (abbreviation.length >= 3) break;
        if (word.length > 0) {
            abbreviation += word[0].toUpperCase();
        }
    }

    return abbreviation || 'M'; // Default to 'M' for Member
};

/**
 * Update a user's nickname based on their Roblox profile
 */
export const updateNickname = async (member: GuildMember, robloxUser: User): Promise<boolean> => {
    try {
        console.log(`Attempting to update nickname for ${member.user.tag} (${member.id}) with Roblox user ${robloxUser.name} (${robloxUser.id})`);

        // Check bot permissions
        if (!member.guild.members.me) {
            console.error(`Bot is not in guild ${member.guild.name}`);
            return false;
        }

        if (!member.guild.members.me.permissions.has(PermissionFlagsBits.ManageNicknames)) {
            console.error(`Bot lacks ManageNicknames permission in guild ${member.guild.name}`);
            return false;
        }

        // Check role hierarchy
        const botMember = member.guild.members.me;
        if (member.roles.highest.position >= botMember.roles.highest.position) {
            console.error(`Cannot update nickname for ${member.user.tag} - role hierarchy issue`);
            return false;
        }

        // Skip server owner
        if (member.guild.ownerId === member.id) {
            console.log(`Skipping nickname update for ${member.user.tag} because they're the server owner`);
            return false;
        }

        // Get nickname format
        const format = await getNicknameFormat(member.guild.id);
        console.log(`Using nickname format: "${format}" for guild ${member.guild.name}`);

        // Get user's group role
        let rankName = "Guest";
        let rankNumber = 0;

        try {
            const groupMember = await robloxGroup.getMember(robloxUser.id);
            if (groupMember) {
                rankName = groupMember.role.name;
                rankNumber = groupMember.role.rank;
                console.log(`Found group member: ${robloxUser.name} with rank: ${rankName} (${rankNumber})`);
            } else {
                console.log(`User ${robloxUser.name} is not a group member, using "Guest" as rank`);
            }
        } catch (err) {
            console.error(`Error getting group member for ${robloxUser.name}:`, err);
        }

        // Generate dynamic values
        let rankPrefix = '';
        try {
            rankPrefix = await generateRankPrefix(rankName, rankNumber, member.guild.id);
        } catch (err) {
            console.error(`Error generating rank prefix for ${rankName} (${rankNumber}):`, err);
            rankPrefix = ''; // Continue with empty prefix
        }

        const rankAbbr = generateRankAbbreviation(rankName);

        // Format nickname with all available placeholders
        let nickname = format
            .replace(/{robloxUsername}/g, robloxUser.name)
            .replace(/{robloxDisplayName}/g, robloxUser.displayName || robloxUser.name)
            .replace(/{rankName}/g, rankName)
            .replace(/{rankNumber}/g, rankNumber.toString())
            .replace(/{rankPrefix}/g, rankPrefix)
            .replace(/{rankAbbr}/g, rankAbbr)
            .replace(/{rankAbbrv}/g, rankAbbr); // Alternative spelling

        console.log(`Formatted nickname: "${nickname}" for ${member.user.tag}`);

        // Check if nickname format contains unsupported placeholders
        if (nickname.includes('{rankPrefix}') && rankPrefix === '') {
            console.warn(`Nickname format contains {rankPrefix} but no mapping exists for rank "${rankName}" in guild ${member.guild.name}. Consider setting up rank prefix mappings or using a different format.`);
        }

        // Discord nickname limit
        if (nickname.length > 32) {
            nickname = nickname.substring(0, 32);
            console.log(`Nickname truncated to 32 chars: "${nickname}"`);
        }

        // Update if different
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