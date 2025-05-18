import { GuildMember } from 'discord.js';
import { User } from 'bloxy/dist/structures';
import { prisma } from '../database/prisma';
import { robloxGroup } from '../main';

/**
 * Get the nickname format for a guild, creating default if none exists
 */
export const getNicknameFormat = async (guildId: string): Promise<string> => {
    const guildConfig = await prisma.guildConfig.findUnique({
        where: { guildId }
    });

    if (!guildConfig) {
        // Create default config if none exists
        const newConfig = await prisma.guildConfig.create({
            data: {
                id: guildId,
                guildId,
                nicknameFormat: '{robloxUsername}'
            }
        });
        return newConfig.nicknameFormat;
    }

    return guildConfig.nicknameFormat;
};

/**
 * Set the nickname format for a guild
 */
export const setNicknameFormat = async (guildId: string, format: string): Promise<string> => {
    const guildConfig = await prisma.guildConfig.upsert({
        where: { guildId },
        update: { nicknameFormat: format },
        create: {
            id: guildId,
            guildId,
            nicknameFormat: format
        }
    });

    return guildConfig.nicknameFormat;
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

        // Update nickname
        await member.setNickname(nickname, 'Automatic nickname update from bot');
        return true;
    } catch (err) {
        console.error('Error updating nickname:', err);
        return false;
    }
};