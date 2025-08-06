import { CommandContext } from '../../structures/addons/CommandAddons';
import Command from '../../structures/Command';
import { isUserVerified, getLinkedRobloxUser } from '../../handlers/accountLinks';
import { createBaseEmbed } from '../../utils/embedUtils';
import { config } from '../../config';
import { Collection, GuildMember, Role } from 'discord.js';
import { Logger } from '../../utils/logger';
import { prisma } from '../../database/prisma';

class NotVerifiedCommand extends Command {
    constructor() {
        super({
            trigger: 'notverified',
            description: 'List users who are not verified with a Roblox account',
            type: 'ChatInput',
            module: 'information',
            args: [
                {
                    trigger: 'role',
                    description: 'Filter by specific role (optional)',
                    type: 'DiscordRole',
                    required: false
                }
            ],
            permissions: [
                {
                    type: 'role',
                    ids: config.permissions.admin, // Admin only command
                    value: true
                }
            ]
        });
    }

    async run(ctx: CommandContext) {
        try {
            // Defer the reply since this might take a while
            await ctx.defer();

            // Get the filter role if specified
            const filterRole = ctx.args['role'] as Role | undefined;

            // First fetch all members
            await ctx.guild.members.fetch();

            // Apply role filter if specified
            let members = ctx.guild.members.cache;
            if (filterRole) {
                members = members.filter(member => member.roles.cache.has(filterRole.id));
            }

            // Exclude bots
            members = members.filter(member => !member.user.bot);

            Logger.info(`Starting verification check for ${members.size} members`, 'NotVerified');

            // Arrays to store results
            const unverifiedMembers: GuildMember[] = [];

            // Create progress message
            const progressMessage = await ctx.channel.send("Checking verification status of members (0%)...");

            // Direct database check instead of using possibly broken isUserVerified
            // This is more reliable as it directly checks the database
            try {
                // Get all verified Discord IDs from the database
                const verifiedUsers = await prisma.$queryRaw`
                    SELECT discordId FROM UserLink
                `;

                // Convert to a Set for faster lookups
                const verifiedUserIds = new Set(
                    (verifiedUsers as any[]).map(user => user.discordId)
                );

                Logger.info(`Found ${verifiedUserIds.size} verified users in database`, 'NotVerified');

                // Process members in batches
                const totalMembers = members.size;
                const batchSize = 20;
                let processedCount = 0;

                // Check each member against the verified set
                for (const member of members.values()) {
                    // Use the more robust isUserVerified function now
                    const isVerified = await isUserVerified(member.id);

                    if (!isVerified) {
                        // Double-check with getLinkedRobloxUser for extra safety
                        const linked = await getLinkedRobloxUser(member.id).catch(() => null);
                        if (!linked) {
                            unverifiedMembers.push(member);
                        }
                    }

                    // Update progress periodically
                    processedCount++;
                    if (processedCount % batchSize === 0 || processedCount === totalMembers) {
                        const percentage = Math.floor((processedCount / totalMembers) * 100);
                        await progressMessage.edit(
                            `Checking verification status of members (${percentage}%)... ` +
                            `Found ${unverifiedMembers.length} unverified so far.`
                        );
                    }
                }
            } catch (dbError) {
                Logger.error(`Database error in notverified command:`, 'NotVerified', dbError as Error);

                // Fallback to the old method if database query fails
                const totalMembers = members.size;
                const batchSize = 20;
                let processedCount = 0;

                for (const member of members.values()) {
                    // Check each member individually with the fallback method
                    const linked = await getLinkedRobloxUser(member.id).catch(() => null);
                    if (!linked) {
                        unverifiedMembers.push(member);
                    }

                    // Update progress periodically
                    processedCount++;
                    if (processedCount % batchSize === 0 || processedCount === totalMembers) {
                        const percentage = Math.floor((processedCount / totalMembers) * 100);
                        await progressMessage.edit(
                            `Checking verification status of members (${percentage}%)... ` +
                            `Found ${unverifiedMembers.length} unverified so far.`
                        );
                    }
                }
            }

            // Update complete
            await progressMessage.edit("Finished checking all members.");

            // Prepare the response
            if (unverifiedMembers.length === 0) {
                return ctx.reply({
                    embeds: [
                        createBaseEmbed('success')
                            .setTitle('Verification Check')
                            .setDescription('All members are verified!')
                    ]
                });
            }

            // Sort unverified members by join date (newest first)
            unverifiedMembers.sort((a, b) => b.joinedTimestamp - a.joinedTimestamp);

            // Format member list with join dates
            const memberListItems = unverifiedMembers.map(member => {
                const joinDate = member.joinedAt ?
                    `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>` :
                    'Unknown';

                return `- <@${member.id}> (${member.user.tag || member.user.username}) - Joined: ${joinDate}`;
            });

            // Split into chunks of 15 for readability
            const memberChunks = [];
            for (let i = 0; i < memberListItems.length; i += 15) {
                memberChunks.push(memberListItems.slice(i, i + 15));
            }

            // Create main embed
            const mainEmbed = createBaseEmbed('primary')
                .setTitle('Unverified Members')
                .setDescription(`Found **${unverifiedMembers.length}** unverified members${filterRole ? ` with the role ${filterRole}` : ''}.`)

            // If the list is small enough, add it to the main embed
            if (memberListItems.length <= 15) {
                mainEmbed.addFields({
                    name: 'Unverified Members',
                    value: memberListItems.join('\n') || 'None'
                });

                return ctx.reply({ embeds: [mainEmbed] });
            }

            // Otherwise, create additional embeds for the member lists
            const embedPages = [mainEmbed];

            memberChunks.forEach((chunk, index) => {
                embedPages.push(
                    createBaseEmbed('primary')
                        .setTitle(`Unverified Members (Page ${index + 1}/${memberChunks.length})`)
                        .setDescription(chunk.join('\n'))
                );
            });

            // Send the first embed
            await ctx.reply({ embeds: [embedPages[0]] });

            // Send the rest as follow-ups
            for (let i = 1; i < embedPages.length; i++) {
                await ctx.channel.send({ embeds: [embedPages[i]] });
            }

        } catch (err) {
            Logger.error('Error in notverified command:', 'NotVerified', err as Error);
            return ctx.reply({
                embeds: [
                    createBaseEmbed('danger')
                        .setTitle('Error')
                        .setDescription(`An error occurred while checking member verification status: ${err.message}`)
                ],
                ephemeral: true
            });
        }
    }
}

export default NotVerifiedCommand;