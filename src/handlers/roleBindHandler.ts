import { Guild, GuildMember } from 'discord.js';
import { prisma } from '../database/prisma';
import { robloxGroup } from '../main';

function parseRolesToRemove(jsonStr: string | null): string[] {
    if (!jsonStr) return [];
    try {
        return JSON.parse(jsonStr);
    } catch {
        console.error('Error parsing rolesToRemoveJson:', jsonStr);
        return [];
    }
}

// Ensure stringifyRolesToRemove handles empty arrays correctly:
function stringifyRolesToRemove(roles: string[] | undefined | null): string {
    return JSON.stringify(roles || []);
}

export const addRoleBinding = async (
    guildId: string,
    discordRoleId: string,
    minRankId: number,
    maxRankId: number,
    robloxRankName: string,
    rolesToRemove: string[] = []
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
            robloxRankName,
            rolesToRemoveJson: stringifyRolesToRemove(rolesToRemove)
        },
        create: {
            guildId,
            discordRoleId,
            minRankId,
            maxRankId,
            robloxRankName,
            rolesToRemoveJson: stringifyRolesToRemove(rolesToRemove)
        }
    });
};

export const getRoleBindings = async (guildId: string) => {
    const bindings = await prisma.roleBind.findMany({
        where: {
            guildId
        }
    });

    // Add rolesToRemove field to each binding by parsing the JSON
    return bindings.map(binding => ({
        ...binding,
        rolesToRemove: parseRolesToRemove(binding.rolesToRemoveJson)
    }));
};

export const updateUserRoles = async (guild: Guild, member: GuildMember, robloxUserId: number) => {
    try {
        // Get all role bindings for this guild
        const roleBindings = await getRoleBindings(guild.id);
        if (roleBindings.length === 0) {
            return {
                success: true,
                message: 'No role bindings configured for this server',
                added: 0,
                removed: 0,
                addedRoleIds: [],
                removedRoleIds: []
            };
        }

        // Get the user's rank in the group
        const groupMember = await robloxGroup.getMember(robloxUserId);
        if (!groupMember) {
            return {
                success: false,
                message: 'User is not in the group',
                added: 0,
                removed: 0,
                addedRoleIds: [],
                removedRoleIds: []
            };
        }

        // Get the user's rank ID
        const userRankId = groupMember.role.rank;

        // Find bindings that apply to this user
        const applicableBindings = roleBindings.filter(binding =>
            userRankId >= binding.minRankId && userRankId <= binding.maxRankId
        );

        // Roles to add based on rank
        const rolesToAdd = applicableBindings.map(binding => binding.discordRoleId);

        // Collect all roles to remove from applicable bindings
        const rolesToRemoveSet = new Set<string>();
        applicableBindings.forEach(binding => {
            if (binding.rolesToRemove && binding.rolesToRemove.length > 0) {
                binding.rolesToRemove.forEach(roleId => rolesToRemoveSet.add(roleId));
            }
        });

        // Get all bound roles that should be removed (roles that are bound but no longer applicable, 
        // or roles explicitly set to be removed)
        const boundRoleIds = roleBindings.map(binding => binding.discordRoleId);
        const rolesToRemove = member.roles.cache
            .filter(role =>
                (boundRoleIds.includes(role.id) && !rolesToAdd.includes(role.id)) ||
                rolesToRemoveSet.has(role.id)
            )
            .map(role => role.id);

        // Track role changes
        const addedRoleIds: string[] = [];
        const removedRoleIds: string[] = [];

        // Remove roles
        if (rolesToRemove.length > 0) {
            try {
                await member.roles.remove(rolesToRemove, 'Automatic role update from bot');
                removedRoleIds.push(...rolesToRemove);
                console.log(`Removed roles from ${member.user.tag}: ${rolesToRemove.join(', ')}`);
            } catch (removeErr) {
                console.error(`Error removing roles from ${member.user.tag}:`, removeErr);
            }
        }

        // Add roles the user doesn't already have
        const newRoles = rolesToAdd.filter(roleId => !member.roles.cache.has(roleId));
        if (newRoles.length > 0) {
            try {
                await member.roles.add(newRoles, 'Automatic role update from bot');
                addedRoleIds.push(...newRoles);
                console.log(`Added roles to ${member.user.tag}: ${newRoles.join(', ')}`);
            } catch (addErr) {
                console.error(`Error adding roles to ${member.user.tag}:`, addErr);
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
        return {
            success: false,
            message: 'An error occurred while updating roles',
            added: 0,
            removed: 0,
            addedRoleIds: [],
            removedRoleIds: []
        };
    }
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
