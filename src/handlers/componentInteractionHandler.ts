// Create this file if it doesn't exist:

import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    ComponentType,
    RoleSelectMenuInteraction,
    StringSelectMenuInteraction
} from 'discord.js';
import { createBaseEmbed } from '../utils/embedUtils';
import { addRoleBinding, getRoleBindings } from './roleBindHandler';

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

async function handleButtonInteraction(interaction: ButtonInteraction) {
    // Handle button interactions
    // (You may already have this code elsewhere)
}

async function handleStringSelectMenuInteraction(interaction: StringSelectMenuInteraction) {
    // Handle string select menu interactions
    // (You may already have this code elsewhere)
}

async function handleRoleSelectMenuInteraction(interaction: RoleSelectMenuInteraction) {
    const customId = interaction.customId;

    try {
        // Handle role selection for bindings
        if (customId.startsWith('binds_select_roles:')) {
            await handleBindsRoleSelection(interaction);
        }
        // Handle other role select menus as needed
    } catch (err) {
        console.error('Error handling role select menu interaction:', err);
        if (!interaction.replied) {
            await interaction.reply({
                embeds: [
                    createBaseEmbed('danger')
                        .setTitle('Error')
                        .setDescription('An error occurred while processing your selection.')
                ],
                ephemeral: true
            });
        }
    }
}

// Handler for role selection in binds command
async function handleBindsRoleSelection(interaction: RoleSelectMenuInteraction) {
    // Parse the custom ID to get binding parameters
    // Format: binds_select_roles:discordRoleId:minRankId:maxRankId:rankName
    const parts = interaction.customId.split(':');
    const discordRoleId = parts[1];
    const minRankId = parseInt(parts[2], 10);
    const maxRankId = parseInt(parts[3], 10);
    const rankName = decodeURIComponent(parts[4]);

    // Get the selected roles to remove
    const rolesToRemove = interaction.values;

    try {
        // Get the Discord role information
        const discordRole = interaction.guild.roles.cache.get(discordRoleId);
        if (!discordRole) {
            return await interaction.update({
                content: 'Error: The Discord role you were binding no longer exists.',
                components: [],
                embeds: []
            });
        }

        // Create the binding with the selected roles to remove
        await addRoleBinding(
            interaction.guild.id,
            discordRoleId,
            minRankId,
            maxRankId,
            rankName,
            rolesToRemove
        );

        // Format roles for display in response
        let roleRemovalText = '';
        if (rolesToRemove.length > 0) {
            const roleList = rolesToRemove.map(id => `<@&${id}>`).join(', ');
            roleRemovalText = `\n\n**Will remove:** ${roleList}`;
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