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
        // Get all role bindings for this guild
        const roleBindings = await getRoleBindings(guild.id);
        if (roleBindings.length === 0) {
            return { success: true, message: 'No role bindings configured for this server' };
        }

        // Get the user's rank in the group
        const groupMember = await robloxGroup.getMember(robloxUserId);
        if (!groupMember) {
            return { success: false, message: 'User is not in the group' };
        }

        // Get the user's rank ID
        const userRankId = groupMember.role.rank;

        // Find all roles that should be assigned
        const rolesToAdd = roleBindings
            .filter(binding => binding.robloxRankId <= userRankId)
            .map(binding => binding.discordRoleId);

        // Get all bound role IDs to properly remove roles that shouldn't be assigned
        const allBoundRoleIds = roleBindings.map(binding => binding.discordRoleId);

        // Add and remove roles
        const rolesToRemove = member.roles.cache
            .filter(role => allBoundRoleIds.includes(role.id) && !rolesToAdd.includes(role.id))
            .map(role => role.id);

        // Update the roles
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