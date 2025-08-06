import { CommandContext } from '../../structures/addons/CommandAddons';
import Command from '../../structures/Command';
import { isUserVerified } from '../../handlers/accountLinks';
import { createBaseEmbed } from '../../utils/embedUtils';
import { config } from '../../config';
import { processInChunks, ProcessingOptions } from '../../utils/processingUtils';
import { Collection, GuildMember, Role } from 'discord.js';
import { Logger } from '../../utils/logger';

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

            // Define processing options
            const options: ProcessingOptions = {
                totalItems: members.size,
                chunkSize: 10, // Process 10 members at a time
                initialMessage: "Checking verification status of members...",
                progressInterval: 10, // Update progress every 10%
                completionMessage: "Finished checking all members."
            };

            // Process members in chunks to avoid overloading
            await processInChunks<GuildMember>(
                ctx,
                Array.from(members.values()),
                async (member) => {
                    // Check if the user is verified
                    const isVerified = await isUserVerified(member.id);

                    // Add to unverified list if not verified
                    if (!isVerified) {
                        unverifiedMembers.push(member);
                    }
                },
                options
            );

            // Prepare the response
            if (unverifiedMembers.length === 0) {
                return ctx.reply({
                    embeds: [
                        createBaseEmbed('success')
                            .setTitle('Verification Check')
                            .setDescription('All members are verified! 🎉')
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
                .addFields({
                    name: 'What to do next',
                    value: 'Use `/verify` to link your Discord account to your Roblox account.'
                });

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
                        .setDescription('An error occurred while checking member verification status.')
                ],
                ephemeral: true
            });
        }
    }
}

export default NotVerifiedCommand;