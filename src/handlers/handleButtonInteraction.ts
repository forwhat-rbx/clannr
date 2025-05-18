import { GuildMember } from 'discord.js';
import { ActionRowBuilder, ButtonInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, TextChannel } from 'discord.js';
import { promotionService } from '../services/promotionService';
import { config } from '../config';
import { createBaseEmbed } from '../utils/embedUtils';
import { robloxClient, robloxGroup, discordClient } from '../main';
import { provider } from '../database';
import { logAction, logSystemAction } from './handleLogging';
import { processInChunks, ProcessingOptions } from '../utils/processingUtils';
import { CommandContext } from '../structures/addons/CommandAddons';
import { findHighestEligibleRole } from '../commands/ranking/xprankup';
import { getLinkedRobloxUser } from './accountLinks';
import { checkVerification } from '../commands/verification/verify';
import { addRoleBinding, updateUserRoles } from './roleBindHandler';
import { updateNickname } from './nicknameHandler';

// Define the global type for TypeScript
declare global {
    var matchedMembersCache: {
        [key: string]: number[]
    };
    var matchedDiscordCache: {
        [key: string]: string[]
    };
    // Add this to support verification cache
    var pendingVerifications: Map<string, {
        robloxId: string;
        robloxUsername: string;
        code: string;
        expires: number;
    }>;
}

// Initialize pendingVerifications if it doesn't exist
if (!global.pendingVerifications) {
    global.pendingVerifications = new Map();
}

export async function handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
    const customId = interaction.customId;

    // Handle different button types
    if (customId === 'promote_all') {
        await handlePromoteAllButton(interaction);
    } else if (customId === 'check_promotions') {
        await handleCheckPromotionsButton(interaction);
    } else if (customId.startsWith('purge_members:')) {
        await handlePurgeMembersButton(interaction);
    } else if (customId.startsWith('dm_members:')) {
        await handleDmMembersButton(interaction);
    } else if (customId.startsWith('dm_matched_members:')) {
        await handleDmMatchedMembersButton(interaction);
    } else if (customId.startsWith('request_promotion:')) {
        await handleRequestPromotionButton(interaction);
    } else if (customId.startsWith('verify_')) {
        await handleVerifyButton(interaction);
    } else if (customId.startsWith('cancel_verify_')) {
        await handleCancelVerifyButton(interaction);
    }
}

export async function handleModalSubmit(interaction) {
    const customId = interaction.customId;

    // Handle the binds modal submission
    if (customId.startsWith('binds_add_')) {
        const discordRoleId = customId.replace('binds_add_', '');
        const rankRange = interaction.fields.getTextInputValue('rank_range');

        try {
            // Parse the rank range (e.g. "5" or "1-255")
            let minRankId, maxRankId;

            if (rankRange.includes('-')) {
                const [min, max] = rankRange.split('-').map(num => parseInt(num.trim(), 10));
                minRankId = min;
                maxRankId = max;
            } else {
                minRankId = parseInt(rankRange.trim(), 10);
                maxRankId = minRankId;
            }

            // Validate the range
            if (isNaN(minRankId) || isNaN(maxRankId)) {
                return interaction.reply({
                    embeds: [
                        createBaseEmbed()
                            .setTitle('Invalid Input')
                            .setDescription('Please enter a valid rank number or range (e.g. "5" or "1-255").')
                            .setColor(0xff0000)
                    ],
                    ephemeral: true
                });
            }

            if (minRankId > maxRankId) {
                return interaction.reply({
                    embeds: [
                        createBaseEmbed()
                            .setTitle('Invalid Range')
                            .setDescription('Minimum rank cannot be higher than maximum rank.')
                            .setColor(0xff0000)
                    ],
                    ephemeral: true
                });
            }

            // Get the Roblox rank names
            const groupRoles = await robloxGroup.getRoles();
            const minRole = groupRoles.find(r => r.rank === minRankId);
            const maxRole = groupRoles.find(r => r.rank === maxRankId);

            if (!minRole) {
                return interaction.reply({
                    embeds: [
                        createBaseEmbed()
                            .setTitle('Invalid Rank')
                            .setDescription(`Could not find minimum rank with ID ${minRankId} in the group.`)
                            .setColor(0xff0000)
                    ],
                    ephemeral: true
                });
            }

            if (!maxRole) {
                return interaction.reply({
                    embeds: [
                        createBaseEmbed()
                            .setTitle('Invalid Rank')
                            .setDescription(`Could not find maximum rank with ID ${maxRankId} in the group.`)
                            .setColor(0xff0000)
                    ],
                    ephemeral: true
                });
            }

            // Get the Discord role
            const discordRole = interaction.guild.roles.cache.get(discordRoleId);

            // For the name, we'll use a range or single name based on whether min and max are the same
            const rankName = minRankId === maxRankId
                ? minRole.name
                : `${minRole.name} to ${maxRole.name}`;

            await addRoleBinding(interaction.guild.id, discordRoleId, minRankId, maxRankId, rankName);

            const rangeText = minRankId === maxRankId
                ? `rank "${minRole.name}" (${minRankId})`
                : `rank range "${minRole.name}" (${minRankId}) to "${maxRole.name}" (${maxRankId})`;

            return interaction.reply({
                embeds: [
                    createBaseEmbed()
                        .setTitle('Role Binding Added')
                        .setDescription(`Bound Discord role <@&${discordRoleId}> (${discordRole.name}) to Roblox ${rangeText}`)
                ],
                ephemeral: false
            });

        } catch (err) {
            console.error('Error processing role binding modal:', err);
            return interaction.reply({
                embeds: [
                    createBaseEmbed()
                        .setTitle('Error')
                        .setDescription('An error occurred while adding the role binding.')
                        .setColor(0xff0000)
                ],
                ephemeral: true
            });
        }
    }
}

// Add these new handler functions for verification

async function handleVerifyButton(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferUpdate();
    const userId = interaction.customId.replace('verify_', '');

    // Only the user who started verification can verify
    if (userId !== interaction.user.id) {
        void interaction.followUp({
            content: 'This verification is for someone else.',
            ephemeral: true
        });
        return;
    }

    const result = await checkVerification(userId);

    if (result.success) {
        const embed = createBaseEmbed()
            .setTitle('Verification Successful')
            .setDescription(`Your Discord account has been successfully linked to your Roblox account.\n\n**Username:** ${result.robloxUsername}\n**User ID:** ${result.robloxId}`);

        // Update roles and nickname
        const robloxUser = await robloxClient.getUser(Number(result.robloxId));
        if (robloxUser && interaction.guild) {
            // Fix the casting issue - ensure we have a proper GuildMember
            if (interaction.member && 'roles' in interaction.member) {
                const guildMember = interaction.member as GuildMember;
                await updateUserRoles(interaction.guild, guildMember, robloxUser.id);
                await updateNickname(guildMember, robloxUser);
            }
        }

        void interaction.followUp({
            embeds: [embed],
            components: [],
            ephemeral: true
        });
    } else {
        void interaction.followUp({
            content: result.message,
            ephemeral: true
        });
    }
}

// Similarly for the handleCancelVerifyButton function:
async function handleCancelVerifyButton(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferUpdate();
    const userId = interaction.customId.replace('cancel_verify_', '');

    // Only the user who started verification can cancel
    if (userId !== interaction.user.id) {
        // Use void to ignore the return value
        void interaction.followUp({
            content: 'This verification is for someone else.',
            ephemeral: true
        });
        return;
    }

    // Remove from pending verifications
    global.pendingVerifications.delete(userId);

    // Use void to ignore the return value
    void interaction.update({
        content: 'Verification cancelled.',
        embeds: [],
        components: []
    });
}

async function handleRequestPromotionButton(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const [_, robloxIdFromButton, originalDiscordUserId] = interaction.customId.split(':');

    // Security Check: Ensure the person clicking is the one who the XP card was for,
    // or an admin. For self-service, we primarily care about the original user.
    // Or, more simply, ensure the clicker is linked to the robloxIdFromButton.
    let clickerRobloxId: string | null = null;
    try {
        const linkedUser = await getLinkedRobloxUser(interaction.user.id);
        if (linkedUser) {
            clickerRobloxId = linkedUser.id.toString();
        }
    } catch (e) {
        // Not linked or error fetching
    }

    if (clickerRobloxId !== robloxIdFromButton && interaction.user.id !== originalDiscordUserId) {
        // Allow if the clicker is an admin, even if not the original user or linked to that specific Roblox ID
        const clickerMember = interaction.guild?.members.cache.get(interaction.user.id);
        if (!clickerMember || !clickerMember.roles.cache.some(role => config.permissions.admin?.includes(role.id))) {
            await interaction.editReply({
                content: 'You can only request a promotion check for your own linked Roblox account or if you are an admin and initiated the original command.',
            });
            return;
        }
    }


    try {
        const robloxUser = await robloxClient.getUser(Number(robloxIdFromButton));
        if (!robloxUser) {
            await interaction.editReply({ content: 'Could not find the Roblox user associated with this request.' });
            return;
        }

        const robloxMember = await robloxGroup.getMember(robloxUser.id);
        const userData = await provider.findUser(robloxUser.id.toString());

        if (!robloxMember || !userData) {
            await interaction.editReply({ content: 'Could not retrieve necessary Roblox or user data.' });
            return;
        }

        const groupRoles = await robloxGroup.getRoles();
        const highestEligibleRole = await findHighestEligibleRole(robloxMember, groupRoles, userData.xp);

        if (highestEligibleRole && highestEligibleRole.rank > robloxMember.role.rank) {
            const service = promotionService.getInstance();
            await service.checkForPromotions(); // This will update the main promotion channel
            logSystemAction('User Promotion Request', interaction.user.tag, `User ${robloxUser.name} (${robloxUser.id}) requested a promotion check and was eligible. Promotion channel updated.`, robloxUser, `Eligible for: ${highestEligibleRole.name}`);
            await interaction.editReply({ content: 'Your promotion eligibility has been re-checked. The promotion channel will be updated shortly if there are changes.' });
        } else {
            logSystemAction('User Promotion Request', interaction.user.tag, `User ${robloxUser.name} (${robloxUser.id}) requested a promotion check but was not eligible for a new rank.`, robloxUser, 'Not eligible or already up-to-date.');
            await interaction.editReply({ content: 'You are not currently eligible for a new promotion, or the promotion list is already up-to-date.' });
        }

    } catch (error) {
        console.error('Error handling request_promotion button:', error);
        logSystemAction('User Promotion Request Error', interaction.user.tag, `Error processing promotion request for Roblox ID ${robloxIdFromButton}.`, undefined, error.message);
        await interaction.editReply({ content: 'An error occurred while processing your promotion request. Please try again later.' });
    }
}

async function handleCheckPromotionsButton(interaction: ButtonInteraction): Promise<void> {
    // Check permissions
    const member = interaction.guild?.members.cache.get(interaction.user.id);
    if (!member || !member.roles.cache.some(role => config.permissions.admin?.includes(role.id))) {
        await interaction.reply({
            content: 'You do not have permission to use this button.',
            ephemeral: true
        });
        return;
    }

    await interaction.deferReply({ ephemeral: true });

    // Use promotion service to check for promotions
    const service = promotionService.getInstance();
    await service.checkForPromotions();

    await interaction.editReply({
        content: 'Promotion check completed. The promotion embed has been updated.'
    });
}

// Moved these functions out of the handleButtonInteraction scope
async function handleDmMatchedMembersButton(interaction: ButtonInteraction): Promise<void> {
    // Check permissions
    const member = interaction.guild?.members.cache.get(interaction.user.id);
    if (!member || !member.roles.cache.some(role => config.permissions.admin?.includes(role.id))) {
        await interaction.reply({
            content: 'You do not have permission to DM members.',
            ephemeral: true
        });
        return;
    }

    // Extract info from the button ID
    const [_, groupId, userId] = interaction.customId.split(':');

    // Verify that the user who clicked is the one who created the command
    if (interaction.user.id !== userId) {
        await interaction.reply({
            content: 'Only the user who ran the original command can DM these members.',
            ephemeral: true
        });
        return;
    }

    // Get the cached Discord IDs to DM
    const cacheKey = `${groupId}:${userId}`;
    const discordIdsToMessage = global.matchedDiscordCache?.[cacheKey];

    if (!discordIdsToMessage || discordIdsToMessage.length === 0) {
        await interaction.reply({
            content: 'No members found to message. The data may have expired.',
            ephemeral: true
        });
        return;
    }

    // Create a modal for the DM message
    const modal = new ModalBuilder()
        .setCustomId(`dm_matched_members_modal:${groupId}:${userId}`)
        .setTitle(`DM ${discordIdsToMessage.length} Matched Members`);

    // Add inputs to the modal
    const subjectInput = new TextInputBuilder()
        .setCustomId('message_subject')
        .setLabel('Message Subject')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter a subject for your message...')
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(100);

    const messageInput = new TextInputBuilder()
        .setCustomId('message_content')
        .setLabel('Message Content')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Enter your message here...')
        .setRequired(true)
        .setMinLength(10)
        .setMaxLength(2000);

    // Add inputs to action rows
    const firstRow = new ActionRowBuilder<TextInputBuilder>().addComponents(subjectInput);
    const secondRow = new ActionRowBuilder<TextInputBuilder>().addComponents(messageInput);

    // Add inputs to the modal
    modal.addComponents(firstRow, secondRow);

    try {
        // Show the modal
        await interaction.showModal(modal);
    } catch (error) {
        console.error('Error showing modal for matched members:', error);
        await interaction.reply({
            content: `Failed to show the DM form: ${error.message || "Unknown error"}`,
            ephemeral: true
        });
    }
}

async function handlePromoteAllButton(interaction: ButtonInteraction): Promise<void> {
    // Check permissions
    const member = interaction.guild?.members.cache.get(interaction.user.id);
    if (!member || !member.roles.cache.some(role => config.permissions.ranking?.includes(role.id))) {
        await interaction.reply({
            content: 'You do not have permission to use this button.',
            ephemeral: true
        });
        return;
    }

    await interaction.deferReply({ ephemeral: true });

    // Use promotion service to execute promotions
    const service = promotionService.getInstance();
    const promotedCount = await service.executePromotions(interaction.user.id);

    await interaction.editReply({
        content: `Successfully promoted ${promotedCount} user${promotedCount !== 1 ? 's' : ''}.`
    });
}

async function handleDmMembersButton(interaction: ButtonInteraction): Promise<void> {
    // Check permissions
    const member = interaction.guild?.members.cache.get(interaction.user.id);
    if (!member || !member.roles.cache.some(role => config.permissions.admin?.includes(role.id))) {
        await interaction.reply({
            content: 'You do not have permission to DM members.',
            ephemeral: true
        });
        return;
    }

    // Extract info from the button ID
    const [_, roleId, userId] = interaction.customId.split(':');

    // Verify that the user who clicked is the one who created the command
    if (interaction.user.id !== userId) {
        await interaction.reply({
            content: 'Only the user who ran the original command can DM these members.',
            ephemeral: true
        });
        return;
    }

    // Get the role
    const role = interaction.guild?.roles.cache.get(roleId);

    if (!role) {
        await interaction.reply({
            content: 'Role not found. It may have been deleted.',
            ephemeral: true
        });
        return;
    }

    // Get members with the role
    const membersWithRole = interaction.guild?.members.cache.filter(member =>
        member.roles.cache.has(roleId)
    );

    if (!membersWithRole || membersWithRole.size === 0) {
        await interaction.reply({
            content: `No members found with the role ${role.name}.`,
            ephemeral: true
        });
        return;
    }

    // Create a modal for the DM message
    const modal = new ModalBuilder()
        .setCustomId(`dm_role_modal:${roleId}`)
        .setTitle(`DM ${membersWithRole.size} Members with ${role.name} Role`);

    // Add inputs to the modal
    const messageInput = new TextInputBuilder()
        .setCustomId('message_content')
        .setLabel('Message to send')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Enter your message here...')
        .setRequired(true)
        .setMinLength(10)
        .setMaxLength(2000);

    const subjectInput = new TextInputBuilder()
        .setCustomId('message_subject')
        .setLabel('Message Subject/Title')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter a subject for your message...')
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(100);

    // Add inputs to action rows
    const firstRow = new ActionRowBuilder<TextInputBuilder>().addComponents(subjectInput);
    const secondRow = new ActionRowBuilder<TextInputBuilder>().addComponents(messageInput);

    // Add inputs to the modal
    modal.addComponents(firstRow, secondRow);

    // Show the modal
    try {
        await interaction.showModal(modal);
    } catch (error) {
        console.error('Error showing modal for role members:', error);
        await interaction.reply({
            content: `Failed to show the DM form: ${error.message || "Unknown error"}`,
            ephemeral: true
        });
    }
}

async function handlePurgeMembersButton(interaction: ButtonInteraction): Promise<void> {
    // Check permissions
    const member = interaction.guild?.members.cache.get(interaction.user.id);
    if (!member || !member.roles.cache.some(role => config.permissions.admin?.includes(role.id))) {
        await interaction.reply({
            content: 'You do not have permission to purge members.',
            ephemeral: true
        });
        return;
    }

    // Extract info from the button ID
    const [_, groupId, userId] = interaction.customId.split(':');

    // Verify that the user who clicked is the one who created the command
    if (interaction.user.id !== userId) {
        await interaction.reply({
            content: 'Only the user who ran the original command can purge these members.',
            ephemeral: true
        });
        return;
    }

    // Get the cached members to purge
    const cacheKey = `${groupId}:${userId}`;
    const membersToPurge = global.matchedMembersCache?.[cacheKey] || [];

    if (!membersToPurge.length) {
        await interaction.reply({
            content: 'No members found to purge. The data may have expired.',
            ephemeral: true
        });
        return;
    }

    // Ask for confirmation due to the destructive nature of this action
    await interaction.reply({
        content: `⚠️ **WARNING** ⚠️\nYou are about to purge ${membersToPurge.length} members from your group AND remove them from the database. This action cannot be undone.\n\nAre you sure? Reply with "confirm" within 30 seconds to continue.`,
        ephemeral: true
    });

    // Create a message collector to wait for confirmation
    const filter = m => m.author.id === interaction.user.id && m.content.toLowerCase() === 'confirm';
    const collector = interaction.channel?.createMessageCollector({ filter, time: 30000, max: 1 });

    if (!collector) {
        await interaction.followUp({
            content: 'Error creating confirmation collector.',
            ephemeral: true
        });
        return;
    }

    collector.on('collect', async (message) => {
        await interaction.followUp({
            content: `Beginning purge of ${membersToPurge.length} users...`,
            ephemeral: true
        });

        // Process in chunks to avoid rate limits
        const options: ProcessingOptions = {
            totalItems: membersToPurge.length,
            chunkSize: 3, // Process 3 users at a time
            initialMessage: `Purging ${membersToPurge.length} members...`,
            progressInterval: 10, // Update progress every 10%
            completionMessage: "Finished purging all members."
        };

        const results = {
            success: 0,
            kickFailed: 0,
            dbRemoveFailed: 0,
            notInGroup: 0
        };

        // Create a command context wrapper for the button interaction
        // This allows us to use processInChunks which expects CommandContext type
        const buttonCtx = {
            reply: async (content: any) => interaction.followUp(content),
            editReply: async (content: any) => interaction.followUp(content),
            followUp: async (content: any) => interaction.followUp(content),
            defer: async () => { },
            type: 'interaction' as const,
            subject: interaction,
            user: interaction.user,
            guild: interaction.guild,
            replied: false,
            deferred: true
        } as unknown as CommandContext;

        await processInChunks(
            buttonCtx,
            membersToPurge,
            async (userId, index) => {
                try {
                    // Add delay to avoid rate limits
                    await new Promise(r => setTimeout(r, 500 * (index % 3)));

                    // First get the user
                    const robloxUser = await robloxClient.getUser(userId);

                    // Try to get member and kick
                    try {
                        const robloxMember = await robloxGroup.getMember(userId);
                        if (robloxMember) {
                            // Attempt to kick from group
                            await robloxMember.kickFromGroup(Number(groupId));
                            // Log the action
                            logAction('Purge', interaction.user, 'Purged from comparegroups command', robloxUser);
                        } else {
                            results.notInGroup++;
                        }
                    } catch (err) {
                        console.error(`Failed to kick user ${userId}:`, err);
                        results.kickFailed++;
                    }

                    // Try to remove from database
                    try {
                        await provider.safeDeleteUser(userId.toString());
                        results.success++;
                    } catch (err) {
                        console.error(`Failed to remove user ${userId} from database:`, err);
                        results.dbRemoveFailed++;
                    }
                } catch (err) {
                    console.error(`Error processing user ${userId}:`, err);
                    results.kickFailed++;
                }

                return null;
            },
            options
        );

        // Create results embed
        const resultsEmbed = createBaseEmbed()
            .setTitle('Purge Operation Results')
            .setDescription(`Purge operation complete for ${membersToPurge.length} users.`)
            .addFields(
                { name: 'Successfully Purged', value: `${results.success}`, inline: true },
                { name: 'Kick Failed', value: `${results.kickFailed}`, inline: true },
                { name: 'DB Remove Failed', value: `${results.dbRemoveFailed}`, inline: true },
                { name: 'Not In Group', value: `${results.notInGroup}`, inline: true }
            )
            .setTimestamp();

        // Clear the cache as we're done with it
        delete global.matchedMembersCache[cacheKey];

        await interaction.followUp({
            content: 'Purge operation complete.',
            embeds: [resultsEmbed],
            ephemeral: false
        });

        // Try to delete the "confirm" message for cleanliness
        try {
            await message.delete();
        } catch (err) {
            // Ignore error if the bot doesn't have permission to delete
        }
    });

    collector.on('end', collected => {
        if (collected.size === 0) {
            interaction.followUp({
                content: 'Purge operation cancelled due to timeout.',
                ephemeral: true
            });
        }
    });
}