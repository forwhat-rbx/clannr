import { Guild, GuildMember } from 'discord.js';
import { prisma } from '../database/prisma';
import { robloxGroup } from '../main';

/**
 * Get all role bindings for a guild
 */
export const getRoleBindings = async (guildId: string) => {
    return await prisma.roleBind.findMany({
        where: { guildId }
    });
};

/**
 * Add a role binding
 */
export const addRoleBinding = async (guildId: string, discordRoleId: string, robloxRankId: number, robloxRankName: string) => {
    return await prisma.roleBind.upsert({
        where: {
            guildId_discordRoleId: {
                guildId,
                discordRoleId
            }
        },
        update: {
            robloxRankId,
            robloxRankName
        },
        create: {
            guildId,
            discordRoleId,
            robloxRankId,
            robloxRankName
        }
    });
};

/**
 * Remove a role binding
 */
export const removeRoleBinding = async (guildId: string, discordRoleId: string) => {
    return await prisma.roleBind.delete({
        where: {
            guildId_discordRoleId: {
                guildId,
                discordRoleId
            }
        }
    });
};

/**
 * Update a user's roles based on their Roblox rank
 */
export const updateUserRoles = async (guild: Guild, member: GuildMember, robloxUserId: number) => {
    try {
        // Rest of the function remains the same
        const roleBindings = await getRoleBindings(guild.id);
        if (roleBindings.length === 0) {
            return { success: true, message: 'No role bindings configured for this server' };
        }

        const groupMember = await robloxGroup.getMember(robloxUserId);
        if (!groupMember) {
            return { success: false, message: 'User is not in the group' };
        }

        const userRankId = groupMember.role.rank;

        const rolesToAdd = roleBindings
            .filter(binding => binding.robloxRankId <= userRankId)
            .map(binding => binding.discordRoleId);

        const allBoundRoleIds = roleBindings.map(binding => binding.discordRoleId);

        const rolesToRemove = member.roles.cache
            .filter(role => allBoundRoleIds.includes(role.id) && !rolesToAdd.includes(role.id))
            .map(role => role.id);

        if (rolesToRemove.length > 0) {
            await member.roles.remove(rolesToRemove, 'Automatic role update from bot');
        }

        if (rolesToAdd.length > 0) {
            await member.roles.add(rolesToAdd, 'Automatic role update from bot');
        }

        return { success: true, added: rolesToAdd.length, removed: rolesToRemove.length };
    } catch (err) {
        console.error('Error updating user roles:', err);
        return { success: false, message: 'An error occurred while updating roles' };
    }
};