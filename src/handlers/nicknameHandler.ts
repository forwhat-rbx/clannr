import { GuildMember, PermissionFlagsBits } from 'discord.js';
import { User } from 'bloxy/dist/structures';
import { prisma } from '../database/prisma';
import { robloxGroup } from '../main';

/**
 * Get the nickname format for a guild, creating default if none exists
 */
export const getNicknameFormat = async (guildId: string): Promise<string> => {
    try {
        // Try both cases for model name - PascalCase first, then regular
        let guildConfig;
        try {
            guildConfig = await prisma.guildConfig.findUnique({
                where: { guildId }
            });
        } catch (err) {
            console.log('error')
        }

        if (!guildConfig) {
            // Create default config if none exists
            console.log(`Creating new guild config for guild ${guildId}`);
            let newConfig;
            try {
                newConfig = await prisma.guildConfig.create({
                    data: {
                        id: guildId,
                        guildId,
                        nicknameFormat: '{robloxUsername}'
                    }
                });
            } catch (err) {
                newConfig = await prisma.guildConfig.create({
                    data: {
                        id: guildId,
                        guildId,
                        nicknameFormat: '{robloxUsername}'
                    }
                });
            }
            return newConfig.nicknameFormat;
        }

        return guildConfig.nicknameFormat;
    } catch (err) {
        console.error("Error getting nickname format:", err);
        return '{robloxUsername}'; // Return default if error
    }
};

// Add this function after getNicknameFormat and before updateNickname

/**
 * Set the nickname format for a guild
 */
export const setNicknameFormat = async (guildId: string, format: string): Promise<string> => {
    try {
        console.log(`Setting nickname format for guild ${guildId} to: ${format}`);

        // Only use camelCase version of the model name
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
    } catch (err) {
        console.error(`Error setting nickname format for guild ${guildId}:`, err);
        throw err;
    }
};

/**
 * Update a user's nickname based on their Roblox profile
 */
export const updateNickname = async (member: GuildMember, robloxUser: User): Promise<boolean> => {
    try {
        // Enhanced logging
        console.log(`Attempting to update nickname for ${member.user.tag} (${member.id})`);

        // Check if bot has permission to change nicknames
        if (!member.guild.members.me.permissions.has(PermissionFlagsBits.ManageNicknames)) {
            console.error(`Bot lacks permission to manage nicknames in guild ${member.guild.name}`);
            return false;
        }

        // Check if bot's role is higher than the user's highest role
        const botMember = member.guild.members.me;
        if (member.roles.highest.position >= botMember.roles.highest.position) {
            console.error(`Cannot update nickname for ${member.user.tag} - their role is higher than or equal to bot's highest role`);
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
        try {
            const groupMember = await robloxGroup.getMember(robloxUser.id);
            if (groupMember) {
                rankName = groupMember.role.name;
                console.log(`Found group member: ${robloxUser.name} with rank: ${rankName}`);
            } else {
                console.log(`User ${robloxUser.name} is not a group member, using "Guest" as rank`);
            }
        } catch (err) {
            console.error(`Error getting group member for ${robloxUser.name}:`, err);
        }

        // Format the nickname
        let nickname = format
            .replace('{robloxUsername}', robloxUser.name)
            .replace('{robloxDisplayName}', robloxUser.displayName || robloxUser.name)
            .replace('{rankName}', rankName);

        console.log(`Formatted nickname: "${nickname}" for ${member.user.tag}`);

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