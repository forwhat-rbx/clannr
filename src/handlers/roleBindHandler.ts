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
 * Add a role binding with rank range
 */
export const addRoleBinding = async (
    guildId: string,
    discordRoleId: string,
    minRankId: number,
    maxRankId: number,
    robloxRankName: string
) => {
    return await prisma.roleBind.upsert({
        where: {
            guildId_discordRoleId: {
                guildId,
                discordRoleId
            }
        },
        update: {
            minRankId,
            maxRankId,
            robloxRankName
        },
        create: {
            guildId,
            discordRoleId,
            minRankId,
            maxRankId,
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
            return { success: true, message: 'No role bindings configured for this server', added: 0, removed: 0 };
        }

        // Get the user's rank in the group
        const groupMember = await robloxGroup.getMember(robloxUserId);
        if (!groupMember) {
            return { success: false, message: 'User is not in the group', added: 0, removed: 0 };
        }

        // Get the user's rank ID
        const userRankId = groupMember.role.rank;

        // Find all roles that should be assigned - check if user's rank is within the range
        const rolesToAdd = roleBindings
            .filter(binding => userRankId >= binding.minRankId && userRankId <= binding.maxRankId)
            .map(binding => binding.discordRoleId);

        // Get all bound role IDs to properly remove roles that shouldn't be assigned
        const allBoundRoleIds = roleBindings.map(binding => binding.discordRoleId);

        // Add and remove roles
        const rolesToRemove = member.roles.cache
            .filter(role => allBoundRoleIds.includes(role.id) && !rolesToAdd.includes(role.id))
            .map(role => role.id);

        // Store IDs for detailed reporting
        const addedRoleIds = [];
        const removedRoleIds = [];

        // Update the roles
        if (rolesToRemove.length > 0) {
            await member.roles.remove(rolesToRemove, 'Automatic role update from bot');
            removedRoleIds.push(...rolesToRemove);
        }

        if (rolesToAdd.length > 0) {
            // Filter out roles the user already has
            const newRoles = rolesToAdd.filter(roleId => !member.roles.cache.has(roleId));

            if (newRoles.length > 0) {
                await member.roles.add(newRoles, 'Automatic role update from bot');
                addedRoleIds.push(...newRoles);
            }
        }

        return {
            success: true,
            added: addedRoleIds.length,
            removed: removedRoleIds.length,
            addedRoleIds,
            removedRoleIds
        };
    } catch (err) {
        console.error('Error updating user roles:', err);
        return { success: false, message: 'An error occurred while updating roles', added: 0, removed: 0 };
    }
};