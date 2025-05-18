import { GuildMember } from 'discord.js';
import { User } from 'bloxy/dist/structures';
import { prisma } from '../database/prisma';
import { robloxGroup } from '../main';

/**
 * Get the nickname format for a guild, creating default if none exists
 */
export const getNicknameFormat = async (guildId: string): Promise<string> => {
    try {
        // Use the correct case for the model name (GuildConfig)
        const guildConfig = await prisma.GuildConfig.findUnique({
            where: { guildId }
        });

        if (!guildConfig) {
            // Create default config if none exists
            const newConfig = await prisma.GuildConfig.create({
                data: {
                    id: guildId,
                    guildId,
                    nicknameFormat: '{robloxUsername}'
                }
            });
            return newConfig.nicknameFormat;
        }

        return guildConfig.nicknameFormat;
    } catch (err) {
        console.error("Error getting nickname format:", err);
        return '{robloxUsername}'; // Return default if error
    }
};

/**
 * Set the nickname format for a guild
 */
export const setNicknameFormat = async (guildId: string, format: string): Promise<string> => {
    try {
        const guildConfig = await prisma.GuildConfig.upsert({
            where: { guildId },
            update: { nicknameFormat: format },
            create: {
                id: guildId,
                guildId,
                nicknameFormat: format
            }
        });

        return guildConfig.nicknameFormat;
    } catch (err) {
        console.error("Error setting nickname format:", err);
        throw err;
    }
};

/**
 * Update a user's nickname based on their Roblox profile
 */
export const updateNickname = async (member: GuildMember, robloxUser: User): Promise<boolean> => {
    try {
        // Skip for server owner as they can't be renamed
        if (member.guild.ownerId === member.id) {
            return false;
        }

        // Get the nickname format
        const format = await getNicknameFormat(member.guild.id);

        // Get the user's group role
        let rankName = "Guest";
        try {
            const groupMember = await robloxGroup.getMember(robloxUser.id);
            if (groupMember) {
                rankName = groupMember.role.name;
            }
        } catch (err) {
            console.error('Error getting group member:', err);
        }

        // Format the nickname
        let nickname = format
            .replace('{robloxUsername}', robloxUser.name)
            .replace('{robloxDisplayName}', robloxUser.displayName || robloxUser.name)
            .replace('{rankName}', rankName);

        // Discord nickname has 32 character limit
        if (nickname.length > 32) {
            nickname = nickname.substring(0, 32);
        }

        // Only update if the nickname is different
        if (member.nickname !== nickname) {
            await member.setNickname(nickname, 'Automatic nickname update from bot');
            console.log(`Updated nickname for ${member.user.tag} to: ${nickname}`);
            return true;
        } else {
            console.log(`No nickname change needed for ${member.user.tag}`);
            return false;
        }
    } catch (err) {
        console.error(`Error updating nickname for ${member.user.tag}:`, err);
        return false;
    }
};