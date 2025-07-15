import { createBaseEmbed } from '../../utils/embedUtils';
import { CommandContext } from '../../structures/addons/CommandAddons';
import Command from '../../structures/Command';
import { config } from '../../config';
import { provider } from '../../database';
import { robloxClient, robloxGroup } from '../../main';
import { getNoPermissionEmbed } from '../../handlers/locale';
import { processInChunks, ProcessingOptions } from '../../utils/processingUtils';

interface DatabaseUser {
    robloxId: string;
    xp?: number;
    raids?: number;
    defenses?: number;
    scrims?: number;
    trainings?: number;
    lastActivity?: Date | string;
    lastRaid?: Date | string;
    lastDefense?: Date | string;
    lastScrim?: Date | string;
    lastTraining?: Date | string;
    suspendedUntil?: Date | string;
    unsuspendRank?: number;
    isBanned?: boolean;
}

function parseDate(value: Date | string | undefined): Date | null {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
}

class LastActiveCommand extends Command {
    constructor() {
        super({
            trigger: 'lastactive',
            description: 'Shows users who haven\'t been active in the specified number of days',
            type: 'ChatInput',
            module: 'information',
            args: [
                {
                    trigger: 'days',
                    description: 'How many days of inactivity to check for',
                    type: 'Number',
                    required: false,
                },
                {
                    trigger: 'rank',
                    description: 'Filter by specific rank (name, ID or rank number)',
                    type: 'String',
                    required: false,
                    autocomplete: true
                }
            ],
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
        // Check permissions
        if (!ctx.member.roles.cache.some(r => config.permissions.ranking?.includes(r.id))) {
            return ctx.reply({ embeds: [getNoPermissionEmbed()], ephemeral: true });
        }

        // IMPORTANT: Acknowledge the command immediately
        await ctx.defer();

        // Get days parameter (default: 30)
        const days = ctx.args['days'] ? Number(ctx.args['days']) : 30;
        if (isNaN(days) || days <= 0) {
            return ctx.reply({ content: 'Please provide a valid positive number for days.' });
        }

        try {
            // Get rank filter if provided
            const rankFilter = ctx.args['rank'] ? String(ctx.args['rank']).toLowerCase() : null;
            let filteredRankIds: any[] = [];

            if (rankFilter) {
                try {
                    // Get all group roles to filter by
                    const groupRoles = await robloxGroup.getRoles();

                    // Find roles that match the filter (by name, ID or rank number) with proper null handling
                    filteredRankIds = groupRoles
                        .filter(role => {
                            if (!role) return false;

                            const nameMatch = role.name ? role.name.toLowerCase().includes(rankFilter) : false;
                            const idMatch = role.id ? role.id.toString() === rankFilter : false;
                            const rankMatch = role.rank ? role.rank.toString() === rankFilter : false;

                            return nameMatch || idMatch || rankMatch;
                        })
                        .map(role => role.id);

                    if (filteredRankIds.length === 0) {
                        return ctx.reply({ content: `No ranks found matching "${ctx.args['rank']}".` });
                    }
                } catch (error) {
                    console.error("Error fetching group roles:", error);
                    return ctx.reply({ content: "An error occurred while fetching group roles. Please try again later." });
                }
            }

            // Get all XP logs to track activity
            const xpLogs = await provider.getXpLogs(1000); // Get last 1000 logs

            // Create cutoff date
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);

            // Get all users
            const allUsers = await provider.getAllUsers() as DatabaseUser[];

            // Track users who've received XP recently (pre-filter)
            const recentlyActiveUserIds = new Set();
            xpLogs.forEach(log => {
                if (new Date(log.timestamp) >= cutoffDate) {
                    recentlyActiveUserIds.add(log.robloxId);
                }
            });

            // Pre-filter inactive users to reduce processing
            const potentiallyInactiveUsers = allUsers.filter(user => !recentlyActiveUserIds.has(user.robloxId));

            // Notify about the number of users being checked
            await ctx.reply({
                content: `Checking ${potentiallyInactiveUsers.length} potentially inactive users...`
            });

            // Find inactive users with chunked processing
            const inactiveUsers: any[] = [];

            await processInChunks<any>(
                ctx,
                potentiallyInactiveUsers,
                async (user) => {
                    try {
                        // Try to get Roblox user info and group membership
                        const robloxUser = await robloxClient.getUser(Number(user.robloxId));
                        let robloxMember;

                        try {
                            robloxMember = await robloxGroup.getMember(robloxUser.id);
                            if (!robloxMember) throw new Error();
                        } catch (err) {
                            // User is not in group, skip
                            return null;
                        }

                        // Skip if we're filtering by rank and this user's rank doesn't match
                        if (filteredRankIds.length > 0 && !filteredRankIds.includes(robloxMember.role.id)) {
                            return null;
                        }

                        // Check if user has attended any events - using the date fields
                        const hasRecentActivity = (
                            (parseDate(user.lastActivity) && parseDate(user.lastActivity)! >= cutoffDate) ||
                            (parseDate(user.lastRaid) && parseDate(user.lastRaid)! >= cutoffDate) ||
                            (parseDate(user.lastDefense) && parseDate(user.lastDefense)! >= cutoffDate) ||
                            (parseDate(user.lastScrim) && parseDate(user.lastScrim)! >= cutoffDate) ||
                            (parseDate(user.lastTraining) && parseDate(user.lastTraining)! >= cutoffDate)
                        );

                        if (!hasRecentActivity) {
                            // Find the most recent activity date from any event
                            const lastEventDates = [
                                parseDate(user.lastActivity),
                                parseDate(user.lastRaid),
                                parseDate(user.lastDefense),
                                parseDate(user.lastScrim),
                                parseDate(user.lastTraining)
                            ].filter((d): d is Date => d !== null);

                            const lastEvent = lastEventDates.length > 0
                                ? new Date(Math.max(...lastEventDates.map(d => d.getTime())))
                                : null;

                            return {
                                name: robloxUser.name,
                                id: robloxUser.id,
                                rank: robloxMember.role.name,
                                xp: user.xp,
                                lastActive: lastEvent
                            };
                        }
                    } catch (err) {
                        console.error(`Error processing user ${user.robloxId}:`, err);
                    }
                    return null;
                },
                {
                    totalItems: potentiallyInactiveUsers.length,
                    chunkSize: 20,
                    progressInterval: 10
                } as ProcessingOptions
            ).then(results => {
                inactiveUsers.push(...results.filter(Boolean));
            });

            // Sort by last active date
            inactiveUsers.sort((a, b) => {
                // Put null dates (no activity) at the top
                if (!a.lastActive) return -1;
                if (!b.lastActive) return 1;
                return a.lastActive.getTime() - b.lastActive.getTime(); // Oldest first
            });

            // Create an embed with the results
            const embed = createBaseEmbed('primary')
                .setTitle(`Inactive Users (${days}+ days)`)
                .setDescription(
                    inactiveUsers.length > 0
                        ? 'The following users have not been active in the specified timeframe:'
                        : 'No inactive users found for the specified timeframe.'
                )

            // If we have results, add them to the embed
            if (inactiveUsers.length > 0) {
                // Format the date for easier reading
                const formatDate = (date: Date | null) => {
                    if (!date) return 'Never active';
                    const now = new Date();
                    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
                    return `${date.toLocaleDateString()} (${diffDays} days ago)`;
                };

                // Limit to 25 entries to avoid Discord embed limits
                const displayUsers = inactiveUsers.slice(0, 25);

                // Add fields for each user, showing their last activity date
                displayUsers.forEach((user, index) => {
                    embed.addFields({
                        name: `${index + 1}. ${user.name} (${user.rank})`,
                        value: `Last Active: ${formatDate(user.lastActive)}\nXP: ${user.xp || 0}\nID: ${user.id}`,
                        inline: false
                    });
                });

                // Show a message if there are more users than shown
                if (inactiveUsers.length > 25) {
                    embed.setFooter({
                        text: `Showing 25/${inactiveUsers.length} inactive users. Use a rank filter to see more specific results.`
                    });
                }
            }

            // Send the embed
            return ctx.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in lastactive command:', error);
            return ctx.reply({
                content: 'An error occurred while processing the command. Please try again later.',
                ephemeral: true
            });
        }
    }
}

export default LastActiveCommand;