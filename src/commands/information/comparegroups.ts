import { CommandContext } from '../../structures/addons/CommandAddons';
import Command from '../../structures/Command';
import { robloxClient, robloxGroup } from '../../main';
import { createBaseEmbed } from '../../utils/embedUtils';
import { processInChunks, ProcessingOptions } from '../../utils/processingUtils';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Role } from 'discord.js';
import { config } from '../../config';
import { provider } from '../../database';
import { logAction } from '../../handlers/handleLogging';
import { getLinkedRobloxUser } from '../../handlers/accountLinks';

interface GroupMembersResult {
    data: Array<{
        user: {
            userId: number;
            username: string;
        };
        role: {
            name: string;
            rank: number;
        };
    }>;
    nextPageCursor?: string;
}

// Define the global type for TypeScript
declare global {
    var matchedMembersCache: {
        [key: string]: number[]
    };
    var matchedDiscordCache: {
        [key: string]: string[]
    };
}

class CompareGroupsCommand extends Command {
    constructor() {
        super({
            trigger: 'comparegroups',
            description: 'Compare Discord role members with a Roblox group',
            type: 'ChatInput',
            module: 'information',
            args: [
                {
                    trigger: 'discord-role',
                    description: 'Discord role to check members from',
                    required: true,
                    type: 'DiscordRole',
                },
                {
                    trigger: 'roblox-group',
                    description: 'Roblox group ID to check membership against',
                    required: true,
                    type: 'Number',
                }
            ],
            permissions: [
                {
                    type: 'role',
                    ids: config.permissions.ranking,
                    value: true,
                }
            ],
            enabled: true,
        });
    }

    async run(ctx: CommandContext) {
        try {
            await ctx.defer({ ephemeral: false });

            const roleId = ctx.args['discord-role'] as string;
            const discordRole = ctx.guild.roles.cache.get(roleId);

            const groupId = Number(ctx.args['roblox-group']);

            if (!discordRole || !groupId) {
                return ctx.reply({ content: 'Please provide both a valid Discord role and Roblox group ID.' });
            }

            // First, validate the Roblox group exists
            let groupName: string;

            try {
                const group = await robloxClient.getGroup(groupId);
                groupName = group.name;
            } catch (error) {
                return ctx.reply({ content: 'The Roblox group could not be found. Please check the ID and try again.' });
            }

            // Get all members with the specified role
            const roleMembersCollection = await ctx.guild.members.fetch();
            const roleMembers = roleMembersCollection.filter(member => member.roles.cache.has(discordRole.id)).values();
            const discordMembers = Array.from(roleMembers);

            if (discordMembers.length === 0) {
                return ctx.reply({ content: `No members found with the role ${discordRole.name}.` });
            }

            // Create initial status message
            const statusMessage = await ctx.reply({
                content: `Found ${discordMembers.length} members with role ${discordRole.name}. Starting Roblox account checks...`
            });

            // Collection for members who are in the group
            const matchedMembers: Array<{ id: number, username: string, role1: string, role2: string }> = [];

            // Process Discord members in chunks to avoid rate limits
            const options: ProcessingOptions = {
                totalItems: discordMembers.length,
                chunkSize: 3, // Process 3 users at a time (Bloxlink has stricter rate limits)
                initialMessage: `Checking Discord members for linked Roblox accounts in group ${groupName}...`,
                progressInterval: 10, // Update progress every 10%
                completionMessage: `Finished checking all ${discordMembers.length} members. Preparing results...`
            };

            // Custom process function that updates a single message
            const processResults = await this.processWithSingleMessage(
                statusMessage,
                discordMembers,
                async (member, index) => {
                    try {
                        // Add slight delay to avoid rate limits with Bloxlink API
                        await new Promise(r => setTimeout(r, 1000 * (index % 3)));

                        // Get linked Roblox account using Bloxlink API
                        const robloxUser = await getLinkedRobloxUser(member.id);

                        if (!robloxUser) {
                            return null; // No linked account
                        }

                        // Check if user is in the group
                        try {
                            const targetGroup = await robloxClient.getGroup(groupId);
                            const groupMember = await targetGroup.getMember(robloxUser.id);

                            if (groupMember) {
                                // User is in the group, add to matched members
                                matchedMembers.push({
                                    id: robloxUser.id,
                                    username: robloxUser.name,
                                    role1: member.roles.highest.name,
                                    role2: groupMember.role.name
                                });
                                return {
                                    discordId: member.id,
                                    discordName: member.displayName,
                                    robloxId: robloxUser.id,
                                    robloxName: robloxUser.name,
                                    robloxRank: groupMember.role.name
                                };
                            }
                        } catch (err) {
                            // User not in group, continue
                        }
                        return null;
                    } catch (err) {
                        console.error(`Error checking member ${member.displayName}:`, err);
                        return null;
                    }
                },
                options
            );

            // Create response embed
            const embed = this.createResultEmbed(discordRole.name, groupName, matchedMembers);

            // Add purge button component only if there are matches
            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`dm_matched_members:${groupId}:${ctx.user.id}`)
                        .setLabel(`DM Matched Members (${matchedMembers.length})`)
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(matchedMembers.length === 0),
                    new ButtonBuilder()
                        .setCustomId(`purge_members:${groupId}:${ctx.user.id}`)
                        .setLabel(`Purge Members (${matchedMembers.length})`)
                        .setStyle(ButtonStyle.Danger)
                        .setDisabled(matchedMembers.length === 0)
                );

            // Store the matched members for the button handlers to use
            if (matchedMembers.length > 0) {
                // Cache the matched members for both purging and DMing
                global.matchedMembersCache = global.matchedMembersCache || {};
                const cacheKey = `${groupId}:${ctx.user.id}`;
                global.matchedMembersCache[cacheKey] = matchedMembers.map(m => m.id);

                // Also store Discord IDs for DMing
                global.matchedDiscordCache = global.matchedDiscordCache || {};
                global.matchedDiscordCache[cacheKey] = [];

                // Create a map of roblox IDs to discord IDs for faster lookup
                const matchedRobloxIds = new Set(matchedMembers.map(m => m.id));

                // Get all discord members that match any of the Roblox IDs
                for (const member of discordMembers) {
                    try {
                        const robloxUser = await getLinkedRobloxUser(member.id);
                        if (robloxUser && matchedRobloxIds.has(robloxUser.id)) {
                            global.matchedDiscordCache[cacheKey].push(member.id);
                        }
                    } catch (error) {
                        console.error(`Error checking link for member ${member.displayName}:`, error);
                    }
                }

                // Set a timeout to clear both caches after 10 minutes
                setTimeout(() => {
                    delete global.matchedMembersCache[cacheKey];
                    delete global.matchedDiscordCache[cacheKey];
                }, 10 * 60 * 1000);
            }

            // Delete the status message
            try {
                await statusMessage.delete();
            } catch (err) {
                console.error('Failed to delete status message:', err);
                // Continue anyway if deletion fails
            }

            // Send final results
            return ctx.reply({
                content: null,
                embeds: [embed],
                components: matchedMembers.length > 0 ? [row] : []
            });

        } catch (err) {
            console.error('CompareGroups command error:', err);
            return ctx.reply({ content: 'An error occurred while comparing groups.' });
        }
    }

    /**
     * Custom implementation to process items in chunks with a single status message
     */
    private async processWithSingleMessage<T, R>(
        statusMessage: any,
        items: T[],
        processorFn: (item: T, index: number) => Promise<R>,
        options: ProcessingOptions
    ): Promise<R[]> {
        const { totalItems, chunkSize, initialMessage, progressInterval, completionMessage } = options;
        const results: R[] = [];

        // Update the status message with initial message
        await statusMessage.edit({ content: initialMessage });

        // Process in chunks
        let processedCount = 0;
        let lastProgressUpdate = 0;

        for (let i = 0; i < items.length; i++) {
            const result = await processorFn(items[i], i);
            if (result !== null) {
                results.push(result);
            }

            processedCount++;
            const progressPercentage = Math.floor((processedCount / totalItems) * 100);

            // Only update progress at defined intervals to avoid rate limits
            if (progressPercentage >= lastProgressUpdate + progressInterval || processedCount === totalItems) {
                lastProgressUpdate = Math.floor(progressPercentage / progressInterval) * progressInterval;

                // Edit the existing message instead of sending a new one
                await statusMessage.edit({
                    content: `${initialMessage} (${processedCount}/${totalItems}, ${progressPercentage}% complete)`
                }).catch(err => console.error('Failed to update progress message:', err));

                // Small delay to avoid rate limits
                await new Promise(r => setTimeout(r, 500));
            }
        }

        // Update with completion message
        if (completionMessage) {
            await statusMessage.edit({
                content: completionMessage
            }).catch(err => console.error('Failed to update completion message:', err));
        }

        return results;
    }

    private createResultEmbed(discordRoleName: string, groupName: string, matchedMembers: Array<{ id: number, username: string, role1: string, role2: string }>): EmbedBuilder {
        const embed = createBaseEmbed('primary')
            .setTitle(`Role Comparison Results`)
            .setDescription(`**${matchedMembers.length} members** with the role **${discordRoleName}** are in the group **${groupName}**`)
            .setTimestamp();

        if (matchedMembers.length > 0) {
            // Add up to 25 members in the embed, with proper formatting
            const memberChunks: string[] = [];
            let currentChunk = "";

            for (const member of matchedMembers.slice(0, 25)) {
                const memberString = `**[${member.username}](https://www.roblox.com/users/${member.id}/profile)**\n• Discord: ${member.role1}\n• Group: ${member.role2}\n\n`;

                if (currentChunk.length + memberString.length > 1024) {
                    memberChunks.push(currentChunk);
                    currentChunk = memberString;
                } else {
                    currentChunk += memberString;
                }
            }

            if (currentChunk.length > 0) {
                memberChunks.push(currentChunk);
            }

            // Add each chunk as a field
            for (let i = 0; i < memberChunks.length; i++) {
                embed.addFields({
                    name: i === 0 ? 'Members' : '\u200B',  // Use empty character for additional fields
                    value: memberChunks[i]
                });
            }

            if (matchedMembers.length > 25) {
                embed.setFooter({
                    text: `Only showing first 25 of ${matchedMembers.length} members`
                });
            }
        } else {
            embed.addFields({
                name: 'Results',
                value: 'No members found with this Discord role in the Roblox group.'
            });
        }

        return embed;
    }
}

export default CompareGroupsCommand;