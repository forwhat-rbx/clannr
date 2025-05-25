import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    ComponentType,
    GuildMember,
    ModalBuilder,
    RoleSelectMenuInteraction,
    StringSelectMenuInteraction,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';
import { createBaseEmbed } from '../utils/embedUtils';
import { addRoleBinding, getRoleBindings } from './roleBindHandler';
import { checkVerification } from '../commands/verification/verify';
import { robloxClient } from '../main';
import { updateUserRoles } from './roleBindHandler';
import { updateNickname } from './nicknameHandler';
import { Logger } from '../utils/logger';

// For managing binding workflow state
interface BindingWorkflowData {
    discordRoleIds: string[];
    minRankId?: number;
    maxRankId?: number;
    rankName?: string;
    rolesToRemove?: string[];
}

// Global storage for binding workflow data
declare global {
    var bindingWorkflows: {
        [key: string]: BindingWorkflowData
    };
}

// Initialize if not exists
if (!global.bindingWorkflows) {
    global.bindingWorkflows = {};
}

export async function handleComponentInteraction(interaction) {
    // Handle different component types
    if (interaction.isButton()) {
        await handleButtonInteraction(interaction);
    } else if (interaction.isRoleSelectMenu()) {
        await handleRoleSelectMenuInteraction(interaction);
    } else if (interaction.isStringSelectMenu()) {
        await handleStringSelectMenuInteraction(interaction);
    }
}

// Only including the relevant parts that need to be fixed

// Find the handleButtonInteraction function and update it:
async function handleButtonInteraction(interaction: ButtonInteraction) {
    const customId = interaction.customId;

    try {
        // Universal verification button - works anywhere
        if (customId === 'verify' || customId === 'verify_start') {
            await handleVerifyStartButton(interaction);
        }
        // Handle verification buttons in DMs
        else if (customId.startsWith('verify_')) {
            await handleVerifyButton(interaction);
        } else if (customId.startsWith('cancel_verify_')) {
            await handleCancelVerifyButton(interaction);
        }
        // Add other button handlers as needed
        else if (customId === 'role_binding_confirm') {
            await handleRoleBindingConfirmation(interaction);
        } else if (customId === 'role_binding_cancel') {
            // Clean up workflow data
            delete global.bindingWorkflows[interaction.user.id];
            await interaction.update({
                content: 'Role binding process cancelled.',
                embeds: [],
                components: []
            });
        }
        // Handle other button types here...
    } catch (err) {
        Logger.error('Error handling button interaction:', 'ButtonInteraction', err);
        try {
            // Proper error handling based on interaction state
            if (interaction.deferred) {
                await interaction.editReply({
                    embeds: [
                        createBaseEmbed('danger')
                            .setTitle('Error')
                            .setDescription('An error occurred while processing your request: ' + err.message)
                    ],
                    components: []
                });
            } else if (!interaction.replied) {
                await interaction.reply({
                    embeds: [
                        createBaseEmbed('danger')
                            .setTitle('Error')
                            .setDescription('An error occurred while processing your request: ' + err.message)
                    ],
                    ephemeral: true
                });
            }
        } catch (e) {
            Logger.error('Failed to send error message:', 'ButtonInteraction', e);
        }
    }
}

// Update the handleVerifyStartButton function to use a simpler approach
async function handleVerifyStartButton(interaction: ButtonInteraction): Promise<void> {
    // Create a modal for the user to enter their Roblox username
    const modal = new ModalBuilder()
        .setCustomId('verify_modal')
        .setTitle('Verify with Roblox');

    // Add the username input to the modal
    const usernameInput = new TextInputBuilder()
        .setCustomId('username')
        .setLabel('Enter your Roblox username')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Your Roblox username')
        .setRequired(true);

    // Add the input to an action row
    const firstActionRow = new ActionRowBuilder<TextInputBuilder>()
        .addComponents(usernameInput);

    // Add the action row to the modal
    modal.addComponents(firstActionRow);

    // Show the modal
    try {
        await interaction.showModal(modal);
    } catch (err) {
        Logger.error('Error showing verification modal', 'Verification', err);
        if (!interaction.replied) {
            await interaction.reply({
                embeds: [
                    createBaseEmbed('danger')
                        .setTitle('Error')
                        .setDescription('An error occurred while starting verification. Please try again.')
                ],
                ephemeral: true
            });
        }
    }
}

// Handle verification button click
async function handleVerifyButton(interaction: ButtonInteraction): Promise<void> {
    // Important: Defer the update first to prevent timeout
    await interaction.deferUpdate();

    // Extract user ID from the button custom ID
    const userId = interaction.customId.replace('verify_', '');

    // Only the user who started verification can verify
    if (userId !== interaction.user.id) {
        await interaction.followUp({
            content: 'This verification is for someone else.',
            ephemeral: true
        });
        return;
    }

    // Log the verification attempt for debugging
    console.log(`[VERIFY] Verification button clicked by ${interaction.user.tag} (${interaction.user.id})`);

    // Check the verification
    const result = await checkVerification(userId);
    console.log(`[VERIFY] Verification result:`, result);

    if (result.success) {
        const embed = createBaseEmbed()
            .setTitle('Verificação bem-sucedida')
            .setDescription(`Sua conta do Discord foi vinculada com sucesso à sua conta do Roblox.\n\n**Username:** ${result.robloxUsername}\n**User ID:** ${result.robloxId}`);

        // Update roles and nickname
        try {
            const robloxUser = await robloxClient.getUser(Number(result.robloxId));
            if (robloxUser && interaction.guild) {
                // Make sure we have a guild member
                if (interaction.member && interaction.member instanceof GuildMember) {
                    const guildMember = interaction.member;
                    await updateUserRoles(interaction.guild, guildMember, robloxUser.id);
                    await updateNickname(guildMember, robloxUser);
                    console.log(`[VERIFY] Updated roles and nickname for ${interaction.user.tag}`);
                }
            }
        } catch (updateErr) {
            console.error(`[VERIFY] Error updating roles/nickname:`, updateErr);
            // We'll still show success even if this part fails
        }

        await interaction.editReply({
            embeds: [embed],
            components: []
        });
    } else {
        await interaction.editReply({
            embeds: [
                createBaseEmbed('danger')
                    .setTitle('Verification Failed')
                    .setDescription(result.message)
            ],
            components: []
        });
    }
}

// Handle cancel verification button
async function handleCancelVerifyButton(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferUpdate();
    const userId = interaction.customId.replace('cancel_verify_', '');

    // Only the user who started verification can cancel
    if (userId !== interaction.user.id) {
        await interaction.followUp({
            content: 'This verification is for someone else.',
            ephemeral: true
        });
        return;
    }

    // Remove from pending verifications
    global.pendingVerifications.delete(userId);

    await interaction.editReply({
        content: 'Verification cancelled.',
        embeds: [],
        components: []
    });
}

// Add other function handlers for role selections, etc.
async function handleStringSelectMenuInteraction(interaction: StringSelectMenuInteraction) {
    // Handle string select menu interactions
    console.log('String select menu interaction received:', interaction.customId);
}

async function handleRoleSelectMenuInteraction(interaction: RoleSelectMenuInteraction) {
    const customId = interaction.customId;

    try {
        if (customId === 'binds_add_roles_selection') {
            await handleRolesToBindSelection(interaction);
        } else if (customId.startsWith('binds_select_roles:')) {
            await handleRolesToRemoveSelection(interaction);
        }
    } catch (err) {
        console.error('Error handling role select menu interaction:', err);
        try {
            await interaction.update({
                embeds: [
                    createBaseEmbed('danger')
                        .setTitle('Error')
                        .setDescription('An error occurred while processing your selection.')
                ],
                components: []
            });
        } catch (e) {
            console.error('Failed to send error message:', e);
        }
    }
}

// Handle selection of roles to bind
async function handleRolesToBindSelection(interaction: RoleSelectMenuInteraction) {
    // Validate that roles were selected
    if (!interaction.values || interaction.values.length === 0) {
        await interaction.update({
            content: 'You must select at least one role to bind.',
            components: []
        });
        return;
    }

    // Store the selected roles in the workflow state
    const workflowKey = interaction.user.id;
    global.bindingWorkflows[workflowKey] = {
        discordRoleIds: interaction.values
    };

    // Create a modal for rank range input
    const modal = new ModalBuilder()
        .setCustomId('binds_multi_add_modal')
        .setTitle(`Bind ${interaction.values.length} Role(s)`);

    const rankRangeInput = new TextInputBuilder()
        .setCustomId('rank_range')
        .setLabel('Rank Range (e.g. "5" or "1-255")')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter a single rank or range like 1-255')
        .setRequired(true);

    const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(rankRangeInput);
    modal.addComponents(firstActionRow);

    // Show the modal
    await interaction.showModal(modal);
}

// Handle selection of roles to remove when binding is active
async function handleRolesToRemoveSelection(interaction: RoleSelectMenuInteraction) {
    // Get binding parameters from the custom ID
    const parts = interaction.customId.split(':');
    if (parts.length < 5) {
        await interaction.update({
            content: 'Invalid binding parameters.',
            components: []
        });
        return;
    }

    // Extract parameters (for single role bind flow)
    const discordRoleId = parts[1];
    const minRankId = parseInt(parts[2]);
    const maxRankId = parseInt(parts[3]);
    const rankName = decodeURIComponent(parts[4]);

    // Get the selected roles to remove
    const rolesToRemove = interaction.values || [];

    try {
        // Get role information for display
        const discordRole = interaction.guild.roles.cache.get(discordRoleId);
        if (!discordRole) {
            await interaction.update({
                content: 'The Discord role you selected no longer exists.',
                components: []
            });
            return;
        }

        // Create the binding
        await addRoleBinding(
            interaction.guild.id,
            discordRoleId,
            minRankId,
            maxRankId,
            rankName,
            rolesToRemove
        );

        // Format message
        let roleRemovalText = '';
        if (rolesToRemove.length > 0) {
            roleRemovalText = `\n\n**Will remove:** ${rolesToRemove.map(id => `<@&${String(id)}>`).join(' ')}`;
        } else {
            roleRemovalText = '\n\nNo roles will be removed when this binding is active.';
        }

        // Format the rank display
        const rankDisplay = minRankId === maxRankId
            ? `Roblox rank "${rankName}" (${minRankId})`
            : `Roblox ranks from "${rankName}" (${minRankId} to ${maxRankId})`;

        // Send success message
        await interaction.update({
            embeds: [
                createBaseEmbed()
                    .setTitle('Role Binding Added')
                    .setDescription(
                        `Successfully bound Discord role <@&${discordRoleId}> to ${rankDisplay}.${roleRemovalText}`
                    )
            ],
            components: []
        });
    } catch (err) {
        console.error('Error saving role binding:', err);
        await interaction.update({
            embeds: [
                createBaseEmbed('danger')
                    .setTitle('Error')
                    .setDescription('An error occurred while saving the role binding.')
            ],
            components: []
        });
    }
}

// Handle confirmation to add multiple role bindings
async function handleRoleBindingConfirmation(interaction: ButtonInteraction) {
    const workflowKey = interaction.user.id;
    const workflowData = global.bindingWorkflows[workflowKey];

    if (!workflowData) {
        await interaction.update({
            content: 'Your binding session has expired. Please try again.',
            components: [],
            embeds: []
        });
        return;
    }

    const { discordRoleIds, minRankId, maxRankId, rankName, rolesToRemove } = workflowData;

    // Validate all required data is present
    if (!discordRoleIds || !discordRoleIds.length || !minRankId || !maxRankId || !rankName) {
        await interaction.update({
            content: 'Missing binding information. Please try again.',
            components: [],
            embeds: []
        });
        return;
    }

    try {
        // Show processing message
        await interaction.update({
            content: `Creating ${discordRoleIds.length} role bindings...`,
            components: [],
            embeds: []
        });
        // In handleRoleBindingConfirmation:

        const results = [];
        for (const roleId of discordRoleIds) {
            let role;
            try {
                role = interaction.guild.roles.cache.get(roleId);
                await addRoleBinding(
                    interaction.guild.id,
                    roleId,
                    minRankId,
                    maxRankId,
                    rankName,
                    rolesToRemove || []
                );
                results.push(`<@&${String(roleId)}> (${role ? role.name : 'Unknown Role'})`);
            } catch (bindError) {
                console.error(`Error adding binding for role ${roleId}:`, bindError);
                results.push(`<@&${String(roleId)}> (${role ? role.name : 'Unknown Role'})`);
            }
        }

        // Clean up workflow data
        delete global.bindingWorkflows[workflowKey];

        // Format the rank display
        const rankDisplay = minRankId === maxRankId
            ? `Roblox rank "${rankName}" (${minRankId})`
            : `Roblox ranks from "${rankName}" (${minRankId} to ${maxRankId})`;

        // In handleRoleBindingConfirmation:

        // Format roles to remove display
        let removalText = '';
        if (rolesToRemove && rolesToRemove.length > 0) {
            removalText = `\n\n**Will remove:** ${rolesToRemove.map(id => `<@&${String(id)}>`).join(' ')}`;
        }

        // Send success message
        // In handleRoleBindingConfirmation:

        await interaction.editReply({
            embeds: [
                createBaseEmbed('success')
                    .setTitle('Role Bindings Added')
                    .setDescription(
                        `Successfully created bindings for ${discordRoleIds.length} role(s) to ${rankDisplay}.${removalText}\n\n` +
                        `**Results:**\n${results.join('\n')}`
                    )
            ],
            components: []
        });
    } catch (err) {
        console.error('Error in handleRoleBindingConfirmation:', err);
        await interaction.editReply({
            embeds: [
                createBaseEmbed('danger')
                    .setTitle('Error')
                    .setDescription('An error occurred while creating role bindings: ' + err.message)
            ],
            components: []
        });
    }
}