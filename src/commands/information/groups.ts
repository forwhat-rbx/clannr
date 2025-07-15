import { discordClient, robloxClient } from '../../main';
import { CommandContext } from '../../structures/addons/CommandAddons';
import Command from '../../structures/Command';
import { PartialUser, User } from 'bloxy/dist/structures';
import { getLinkedRobloxUser } from '../../handlers/accountLinks';
import { getInvalidRobloxUserEmbed, getUnexpectedErrorEmbed } from '../../handlers/locale';
import { ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, ComponentType, ButtonInteraction, WebhookMessageEditOptions } from 'discord.js';
import { createBaseEmbed } from '../../utils/embedUtils';
import { Logger } from '../../utils/logger';

class GroupsCommand extends Command {
    constructor() {
        super({
            trigger: 'groups',
            description: 'Displays the groups a Roblox user is in',
            type: 'ChatInput',
            module: 'information',
            args: [
                {
                    trigger: 'roblox-user',
                    description: 'The Roblox username to view groups for.',
                    required: false,
                    type: 'String',
                },
            ]
        });
    }

    async run(ctx: CommandContext) {
        await ctx.defer();
        Logger.info(`Groups command executed by ${ctx.user.tag}`, 'GroupsCommand');

        // Step 1: Find the Roblox user
        let robloxUser: User | PartialUser;
        try {
            robloxUser = await this.findRobloxUser(ctx);

            if (!robloxUser) {
                Logger.warn(`Failed to find Roblox user for query: ${ctx.args['roblox-user'] || ctx.user.id}`, 'GroupsCommand');
                await ctx.editReply({
                    embeds: [getInvalidRobloxUserEmbed()]
                } as any);
                return;
            }

            Logger.info(`Found Roblox user: ${robloxUser.name} (${robloxUser.id})`, 'GroupsCommand');
        } catch (error) {
            Logger.error(`Error finding Roblox user`, 'GroupsCommand', error);
            await ctx.editReply({
                embeds: [getInvalidRobloxUserEmbed()]
            } as any);
            return;
        }

        // Step 2: Get groups and display them
        try {
            Logger.info(`Fetching groups for ${robloxUser.name}`, 'GroupsCommand');
            const groups = await robloxUser.getGroups();
            const groupArray = groups.data || [];

            Logger.info(`Found ${groupArray.length} groups for ${robloxUser.name}`, 'GroupsCommand');

            // Configure pagination
            const groupsPerPage = 5;
            const totalPages = Math.ceil(groupArray.length / groupsPerPage) || 1;
            let currentPage = 1;

            // Create the initial embed
            const initialEmbed = this.generateGroupEmbed(robloxUser.name, groupArray, currentPage, totalPages, groupsPerPage);

            // Create pagination buttons
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId('previous')
                    .setLabel('◀️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage === 1),
                new ButtonBuilder()
                    .setCustomId('next')
                    .setLabel('▶️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage === totalPages || groupArray.length === 0)
            );

            // Send the initial message with pagination
            const message = await ctx.editReply({
                embeds: [initialEmbed],
                components: totalPages > 1 ? [row] : []
            } as any);

            // Only set up collector if pagination is needed
            if (totalPages > 1) {
                this.setupPaginationCollector(
                    ctx,
                    message,
                    robloxUser.name,
                    groupArray,
                    totalPages,
                    groupsPerPage
                );
            }
        } catch (error) {
            Logger.error(`Error displaying groups for ${robloxUser.name}`, 'GroupsCommand', error);
            await ctx.editReply({
                embeds: [getUnexpectedErrorEmbed()]
            } as any);
        }
    }

    /**
     * Find a Roblox user based on command input
     */
    private async findRobloxUser(ctx: CommandContext): Promise<User | PartialUser | null> {
        // Method 1: Check if roblox-user arg is a Roblox ID
        if (ctx.args['roblox-user']) {
            try {
                // Try direct ID lookup first
                const user = await robloxClient.getUser(ctx.args['roblox-user'] as number);
                if (user) return user;
            } catch { }
        }

        // Method 2: If no arg provided, try to get linked account
        if (!ctx.args['roblox-user']) {
            try {
                const linkedUser = await getLinkedRobloxUser(ctx.user.id);
                if (linkedUser) return linkedUser;
            } catch { }
        }

        // Method 3: Try username lookup
        if (ctx.args['roblox-user']) {
            try {
                const robloxUsers = await robloxClient.getUsersByUsernames([ctx.args['roblox-user'] as string]);
                if (robloxUsers.length > 0) return robloxUsers[0];
            } catch { }
        }

        // Method 4: Check if the arg is a Discord user mention/ID
        if (ctx.args['roblox-user']) {
            try {
                const idQuery = typeof ctx.args['roblox-user'] === 'string'
                    ? ctx.args['roblox-user'].replace(/[^0-9]/gm, '')
                    : '';

                if (idQuery) {
                    const discordUser = await discordClient.users.fetch(idQuery);
                    const linkedUser = await getLinkedRobloxUser(discordUser.id);
                    if (linkedUser) return linkedUser;
                }
            } catch { }
        }

        return null;
    }

    /**
     * Generate the group embed for a specific page
     */
    private generateGroupEmbed(
        username: string,
        groupArray: any[],
        page: number,
        totalPages: number,
        groupsPerPage: number
    ): EmbedBuilder {
        // Calculate slice indices
        const start = (page - 1) * groupsPerPage;
        const end = start + groupsPerPage;

        // Create group list for current page
        const groupList = groupArray
            .slice(start, end)
            .map(groupData =>
                `[${groupData.group.name}](https://www.roblox.com/groups/${groupData.group.id})\n↳ ${groupData.role.name}`
            )
            .join('\n\n');

        // Create and return the embed
        return createBaseEmbed('primary')
            .setTitle(`Groups for ${username} (Page ${page}/${totalPages})`)
            .setDescription(groupList || 'No groups found')
            .addFields({
                name: 'Total Groups',
                value: groupArray.length.toString(),
                inline: true
            });
    }

    /**
     * Set up the pagination collector for the group list
     */
    private setupPaginationCollector(
        ctx: CommandContext,
        message: any,
        username: string,
        groupArray: any[],
        totalPages: number,
        groupsPerPage: number
    ) {
        // Track current page
        let currentPage = 1;

        // Set up filter to only allow the command user to interact
        const filter = (i: ButtonInteraction) => i.user.id === ctx.user.id;

        // Create the collector with 3 minute timeout
        const collector = message.createMessageComponentCollector({
            filter,
            time: 180000,
            componentType: ComponentType.Button
        });

        // Handle button interactions
        collector.on('collect', async (interaction: ButtonInteraction) => {
            try {
                // Update current page based on button clicked
                if (interaction.customId === 'previous') {
                    currentPage = Math.max(currentPage - 1, 1);
                    Logger.debug(`User ${interaction.user.tag} navigated to page ${currentPage}`, 'GroupsCommand');
                } else if (interaction.customId === 'next') {
                    currentPage = Math.min(currentPage + 1, totalPages);
                    Logger.debug(`User ${interaction.user.tag} navigated to page ${currentPage}`, 'GroupsCommand');
                }

                // Generate new embed for current page
                const newEmbed = this.generateGroupEmbed(
                    username,
                    groupArray,
                    currentPage,
                    totalPages,
                    groupsPerPage
                );

                // Create updated pagination row with proper button states
                const updatedRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId('previous')
                        .setLabel('◀️')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage === 1),
                    new ButtonBuilder()
                        .setCustomId('next')
                        .setLabel('▶️')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(currentPage === totalPages)
                );

                // Update the message with new embed and buttons
                await interaction.update({
                    embeds: [newEmbed],
                    components: [updatedRow]
                }).catch(error => {
                    Logger.error(`Failed to update pagination`, 'GroupsCommand', error);
                });
            } catch (error) {
                Logger.error(`Error in pagination collector`, 'GroupsCommand', error);

                // Try to update the message if something went wrong
                try {
                    await interaction.update({
                        components: []
                    }).catch(() => { });
                } catch { }
            }
        });

        // When the collector ends, remove the buttons
        collector.on('end', async () => {
            try {
                await message.edit({ components: [] }).catch(() => { });
                Logger.debug(`Pagination ended for ${username}'s groups`, 'GroupsCommand');
            } catch (error) {
                Logger.error(`Failed to remove pagination buttons`, 'GroupsCommand', error);
            }
        });
    }
}

export default GroupsCommand;