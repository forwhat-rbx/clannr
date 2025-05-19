import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import {
    getNoPermissionEmbed,
    getNoRankupAvailableEmbed,
} from '../../handlers/locale';
import { config } from '../../config';
import { logAction } from '../../handlers/handleLogging';
import { provider } from '../../database';
import { robloxClient, robloxGroup } from '../../main';
import { createBaseEmbed } from '../../utils/embedUtils';
import { processInChunks } from '../../utils/processingUtils';
import { safeUpdateMember } from '../../utils/robloxUtils';
import { GroupMember } from 'bloxy/dist/structures';

// Helper function to find the eligible role based on XP
export async function findEligibleRole(member: GroupMember, roles: any[], userXp: number) {
    const sortedRoles = config.xpSystem.roles.sort((a, b) => a.xp - b.xp);

    for (const role of sortedRoles) {
        if (userXp >= role.xp && role.rank > member.role.rank) {
            return roles.find((r) => r.rank === role.rank);
        }
    }
    return null;
}

// Helper function to find the highest eligible role based on XP
export async function findHighestEligibleRole(member: GroupMember, roles: any[], userXp: number) {
    const sortedRoles = config.xpSystem.roles
        .filter(role => userXp >= role.xp && role.rank > member.role.rank)
        .sort((a, b) => b.rank - a.rank); // Sort by highest rank first

    if (sortedRoles.length === 0) return null;

    // Return the highest rank they qualify for
    const highestRole = sortedRoles[0];
    return roles.find((r) => r.rank === highestRole.rank);
}

// Helper function to get the rank name
export function getRankName(rank: number, groupRoles: any[]): string {
    const role = groupRoles.find((r) => r.rank === rank);
    return role ? role.name : 'Unknown Rank';
}

class XPRankupCommand extends Command {
    constructor() {
        super({
            trigger: 'rankup',
            description: 'Batch ranks up users based on their XP.',
            type: 'ChatInput',
            module: 'xp',
            args: [],
            permissions: [
                {
                    type: 'role',
                    ids: config.permissions.ranking,
                    value: true,
                }
            ]
        });
    }

    async run(ctx: CommandContext) {
        // Permissions check
        if (!ctx.member.roles.cache.some(role => config.permissions.ranking?.includes(role.id))) {
            return ctx.reply({ embeds: [getNoPermissionEmbed()] });
        }

        // IMPORTANT: Acknowledge the command immediately
        await ctx.defer();

        // Send initial status
        await ctx.reply({ content: "Starting rankup process. This may take a while for large groups..." });

        try {
            const groupRoles = await robloxGroup.getRoles();
            const allUsers = await provider.getAllUsers();

            let rankedUpUsers = 0;
            const rankUpDetails = [];

            // First pass: Find users eligible for rankup to reduce API calls
            const eligibleUsers = [];

            for (const userData of allUsers) {
                // Find users who are eligible for rankup based on XP config
                const userEligibleForRankup = config.xpSystem.roles.some(
                    role => userData.xp >= role.xp
                );

                if (userEligibleForRankup) {
                    eligibleUsers.push(userData);
                }
            }

            // Status update
            await ctx.reply({ content: `Found ${eligibleUsers.length} users potentially eligible for rankup. Processing...` });

            // Process rankups in chunks
            await processInChunks(
                ctx,
                eligibleUsers,
                async (userData) => {
                    try {
                        const robloxUser = await robloxClient.getUser(Number(userData.robloxId));
                        let robloxMember = await robloxGroup.getMember(robloxUser.id);

                        if (!robloxMember) {
                            console.error(`User ${robloxUser.id} is not a group member.`);
                            return null;
                        }

                        let role;
                        let rankedUp = false;

                        // Store initial rank before any changes
                        const initialRankName = getRankName(robloxMember.role.rank, groupRoles);
                        let finalRankName = initialRankName;

                        // Use findHighestEligibleRole to get the highest rank they qualify for
                        const highestEligibleRole = await findHighestEligibleRole(robloxMember, groupRoles, userData.xp);

                        if (highestEligibleRole && highestEligibleRole.rank > robloxMember.role.rank) {
                            try {
                                // Promote directly to highest eligible role
                                finalRankName = getRankName(highestEligibleRole.rank, groupRoles);

                                await safeUpdateMember(robloxUser.id, highestEligibleRole.id);
                                logAction('XP Rankup', ctx.user, null, robloxUser, `${initialRankName} → ${finalRankName}`);

                                rankedUp = true;
                            } catch (err) {
                                console.error(`Error updating role for user ${robloxUser.id}:`, err);
                            }
                        }

                        // Return result if ranked up
                        if (rankedUp) {
                            return {
                                name: robloxUser.name,
                                id: robloxUser.id,
                                initialRank: initialRankName,
                                finalRank: finalRankName
                            };
                        }
                    } catch (err) {
                        console.error(`Error processing user ${userData.robloxId}:`, err);
                    }
                    return null;
                },
                {
                    totalItems: eligibleUsers.length,
                    chunkSize: 10,
                    progressInterval: 10,
                    initialMessage: "Starting batch rank-up process...",
                    completionMessage: "Rank-up process completed."
                }
            ).then(results => {
                // Fix the typing by using a proper type assertion
                const successfulRankups = results.filter(Boolean) as Array<{
                    name: string;
                    id: number;
                    initialRank: string;
                    finalRank: string;
                }>;

                rankedUpUsers = successfulRankups.length;

                successfulRankups.forEach(result => {
                    rankUpDetails.push(`[${result.name}](https://www.roblox.com/users/${result.id}/profile) : ${result.initialRank} → ${result.finalRank}`);
                });
            });

            // The rest of the function stays the same
            if (rankedUpUsers > 0) {
                const embed = createBaseEmbed('primary')
                    .setTitle(`Batch rank-up completed by ${ctx.user.tag}`)
                    .setDescription(rankUpDetails.join('\n'));

                ctx.reply({ embeds: [embed] });
            } else {
                ctx.reply({ embeds: [getNoRankupAvailableEmbed()] });
            }

            // Log the batch rank-up action
            const logChannel = ctx.guild.channels.cache.get(config.logChannels.rankup);
            if (logChannel && logChannel.isTextBased()) {
                logChannel.send(`Batch rank-up completed by ${ctx.user.tag}. ${rankedUpUsers} users were ranked up.`);
            }
        } catch (error) {
            console.error("Error in rankup command:", error);
            return ctx.reply({ content: "An error occurred while performing the rankup operation." });
        }
    }
}

export default XPRankupCommand;