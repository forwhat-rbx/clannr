import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ModalSubmitInteraction, RoleSelectMenuBuilder } from 'discord.js';
import { robloxClient, robloxGroup } from '../main'; // Added robloxGroup
import { createBaseEmbed } from '../utils/embedUtils';
import { processInChunks, ProcessingOptions } from '../utils/processingUtils';
import { logAction, logVerificationEvent } from './handleLogging';
import { config } from '../config';
import { addRoleBinding, getRoleBindings } from '../handlers/roleBindHandler'; // Added this import
import { Logger } from '../utils/logger';
import { getLinkedRobloxUser } from './accountLinks';
import * as chrono from 'chrono-node';

export async function handleModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
    const customId = interaction.customId;

    try {
        if (customId.startsWith('dm_modal:')) {
            await handleDmModalSubmit(interaction);
        } else if (customId.startsWith('dm_role_modal:')) {
            await handleDmRoleModalSubmit(interaction);
        } else if (customId.startsWith('dm_matched_members_modal:')) {
            await handleDmMatchedMembersModalSubmit(interaction);
        } else if (customId.startsWith('binds_add_')) {
            await handleBindsAddModalSubmit(interaction);
        } else if (customId === 'verify_modal') {
            await handleVerifyUsernameModal(interaction);
        } else if (customId === 'binds_multi_add_modal') {
            await handleMultiBindsAddModalSubmit(interaction);
        } else if (customId.startsWith('event_create_modal:')) {
            await handleEventCreateModal(interaction);
        } else {
            Logger.warn(`Unknown modal type: ${customId}`, 'ModalSubmit');
            void interaction.reply({
                content: 'Unknown form type. Please try again.',
                ephemeral: true
            });
        }
    } catch (error) {
        Logger.error('Error in modal submit handler:', 'ModalSubmit', error);
    }
}
async function handleEventCreateModal(interaction: ModalSubmitInteraction): Promise<void> {
    try {
        // Handle the event creation modal submission
        const userId = interaction.customId.replace('event_create_modal:', '');

        // Immediately defer reply to avoid interaction expiration
        await interaction.deferReply({ ephemeral: true });

        // Process the submission
        const eventType = interaction.fields.getTextInputValue('event_type').trim().toUpperCase();
        const eventTimeInput = interaction.fields.getTextInputValue('event_time').trim();
        const eventLocation = interaction.fields.getTextInputValue('event_location').trim();
        const eventNotes = interaction.fields.getTextInputValue('event_notes').trim();

        // Validate event type
        const validTypes = ['TRAINING', 'RAID', 'DEFENSE', 'SCRIM'];
        if (!validTypes.includes(eventType)) {
            await interaction.editReply({
                content: 'Tipo de evento inválido. Por favor, use TRAINING, RAID, DEFENSE, ou SCRIM.',
            });
            return;
        }

        // Parse time input to get Unix timestamp
        let unixTimestamp: number;
        let parsedDate: Date | null = null;
        let friendlyDateDisplay: string;

        try {
            // Handle direct Unix timestamp input
            if (/^\d+$/.test(eventTimeInput)) {
                unixTimestamp = parseInt(eventTimeInput);
                parsedDate = new Date(unixTimestamp * 1000);
                friendlyDateDisplay = parsedDate.toLocaleString('pt-BR');
                Logger.info(`Unix timestamp fornecido diretamente: ${unixTimestamp}`, 'EventScheduling');
            }
            // Use standard chrono parsing with forwardDate option
            else {
                // Try to parse with chrono (more reliable approach)
                const results = chrono.parse(eventTimeInput, new Date(), { forwardDate: true });

                if (results.length > 0 && results[0].start) {
                    parsedDate = results[0].start.date();
                    unixTimestamp = Math.floor(parsedDate.getTime() / 1000);
                    friendlyDateDisplay = parsedDate.toLocaleString('pt-BR');
                    Logger.info(`Data/hora processada: "${eventTimeInput}" como ${friendlyDateDisplay}`, 'EventScheduling');
                } else {
                    throw new Error('Não foi possível entender o formato da data');
                }
            }

            // Validate the date is in the future
            const now = Date.now() / 1000;
            if (unixTimestamp < now) {
                await interaction.editReply({
                    content: 'Por favor, especifique uma data e hora no futuro para o evento.'
                });
                return;
            }
        } catch (error) {
            // Show Portuguese examples
            const examples = '• "amanhã às 17h"\n• "próxima sexta às 20h"\n• "30 de maio às 15h"\n• "em 3 dias às 19h"\n• "hoje às 21h"';

            await interaction.editReply({
                content: 'Não foi possível entender o formato da data. Tente frases como:\n' + examples
            });
            return;
        }

        // Create the event embed
        const eventEmbed = createBaseEmbed('primary')
            .setTitle(`EVENTO DE ${getPortugueseEventType(eventType)}`)
            .addFields([
                { name: 'Anfitrião', value: `<@${interaction.user.id}>`, inline: false },
                { name: 'Horário', value: `<t:${unixTimestamp}:F> (<t:${unixTimestamp}:R>)`, inline: false },
                { name: 'Local', value: eventLocation, inline: false }
            ]);

        // Add notes if provided
        if (eventNotes) {
            eventEmbed.addFields({ name: 'Observações', value: eventNotes, inline: false });
        }

        // Set color based on event type
        switch (eventType) {
            case 'TRAINING':
                eventEmbed.setColor('#4CAF50'); // Green
                break;
            case 'RAID':
                eventEmbed.setColor('#F44336'); // Red
                break;
            case 'DEFENSE':
                eventEmbed.setColor('#2196F3'); // Blue
                break;
            case 'SCRIM':
                eventEmbed.setColor('#FF9800'); // Orange
                break;
        }

        // Send success message to the user with the parsed date for confirmation
        await interaction.editReply({
            content: `Evento agendado com sucesso para ${friendlyDateDisplay}!`,
        });

        // Send the actual announcement to the channel
        const channel = interaction.channel;
        if (channel) {
            await channel.send({
                content: '@everyone',
                embeds: [eventEmbed]
            });
        }

        // Log the event creation
        Logger.info(`Evento agendado por ${interaction.user.tag}: ${eventType} em ${parsedDate.toISOString()}`, 'EventScheduling');
    } catch (error) {
        Logger.error('Erro ao processar modal de criação de evento', 'EventScheduling', error);

        // Handle reply based on interaction state
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: 'Falha ao criar evento. Por favor, tente novamente.',
                ephemeral: true
            });
        } else {
            await interaction.editReply({
                content: 'Falha ao processar a criação do evento. Por favor, tente novamente.'
            });
        }
    }
}


// Helper function to get the next occurrence of a specific day of the week
function getNextDayOfWeek(dayOfWeek: number): Date {
    const today = new Date();
    const daysUntilNext = (dayOfWeek + 7 - today.getDay()) % 7;
    const nextDate = new Date();
    nextDate.setDate(today.getDate() + (daysUntilNext === 0 ? 7 : daysUntilNext));
    return nextDate;
}

// Helper function to get Portuguese event type names
function getPortugueseEventType(englishType: string): string {
    switch (englishType) {
        case 'TRAINING':
            return 'TREINAMENTO';
        case 'RAID':
            return 'RAID';
        case 'DEFENSE':
            return 'DEFESA';
        case 'SCRIM':
            return 'SCRIMMAGE';
        default:
            return englishType;
    }
}

async function handleVerifyUsernameModal(interaction: ModalSubmitInteraction): Promise<void> {
    try {
        // IMMEDIATELY defer the reply to buy more time (3-second limit is too short)
        await interaction.deferReply({ ephemeral: true });

        // Get the username from the modal
        const username = interaction.fields.getTextInputValue('username');

        // Check if user is already verified
        const existingLink = await getLinkedRobloxUser(interaction.user.id);
        if (existingLink) {
            // Log verification attempt when already verified
            await logVerificationEvent(
                interaction.user,
                'Verification Started',
                { id: existingLink.id, username: existingLink.name },
                `User attempted to verify but is already verified as ${existingLink.name}`
            );

            await interaction.editReply({
                embeds: [
                    createBaseEmbed('primary')
                        .setTitle('Já verificado')
                        .setDescription(`Você já foi verificado como [${existingLink.name}](https://www.roblox.com/users/${existingLink.id}/profile).\n\nPara alterar sua conta, use \`/unverify\` primeiro.`)
                ]
            });
            return;
        }

        // Try to find the Roblox user
        try {
            const robloxUsers = await robloxClient.getUsersByUsernames([username]);
            if (robloxUsers.length === 0) {
                // Log failed verification - username not found
                await logVerificationEvent(
                    interaction.user,
                    'Verification Failed',
                    null,
                    `Roblox username "${username}" not found`
                );

                await interaction.editReply({
                    embeds: [
                        createBaseEmbed('danger')
                            .setTitle('User Not Found')
                            .setDescription(`Could not find a Roblox user with the username "${username}".`)
                    ]
                });
                return;
            }

            const robloxUser = robloxUsers[0];

            // Log verification started
            await logVerificationEvent(
                interaction.user,
                'Verification Started',
                { id: robloxUser.id, username: robloxUser.name },
                `Verification process started for ${robloxUser.name}`
            );

            // Generate a verification code
            const verificationCode = Math.random().toString(36).substring(2, 8).toUpperCase();

            // Store the verification data in global map with consistent ID format
            global.pendingVerifications.set(interaction.user.id, {
                robloxId: String(robloxUser.id),
                robloxUsername: robloxUser.name,
                code: verificationCode,
                expires: Date.now() + 10 * 60 * 1000 // 10 minutes expiry
            });

            // Create verification embed
            const embed = createBaseEmbed('primary')
                .setTitle('Verificação iniciada')
                .setDescription(
                    `Por favor, coloque este código na descrição de seu perfil no Roblox para verificar: \n\n` +
                    `\`\`\`\n${verificationCode}\n\`\`\`\n\n` +
                    `1. Vá para [seu perfil](https://www.roblox.com/users/${robloxUser.id}/profile)\n` +
                    `2. Clique no ícone de lápis ao lado de sua descrição\n` +
                    `3. Cole o código em qualquer lugar de sua descrição\n` +
                    `4. Clique em Save\n` +
                    `5. Volte e clique no botão “Verify” abaixo\n\n` +
                    `Esta verificação expirará em 10 minutos.`
                )
                .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${robloxUser.id}&width=420&height=420&format=png`);

            // Create buttons
            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`verify_${interaction.user.id}`)
                        .setLabel('Verify')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`cancel_verify_${interaction.user.id}`)
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Danger)
                );

            // Send the verification instructions as a DM
            try {
                await interaction.user.send({
                    embeds: [embed],
                    components: [row]
                });

                // Confirm that DM was sent - use editReply instead of reply
                await interaction.editReply({
                    embeds: [
                        createBaseEmbed('success')
                            .setTitle('Verification Started')
                            .setDescription('Please check your DMs for verification instructions!')
                    ]
                });
            } catch (dmErr) {
                // Handle case where DMs are closed
                Logger.error('Failed to send verification DM', 'VerifyDM', dmErr);

                // Use editReply instead of reply since we've already deferred
                await interaction.editReply({
                    embeds: [
                        createBaseEmbed('danger')
                            .setTitle('Cannot Send DM')
                            .setDescription('I couldn\'t send you a DM. Please enable DMs from server members and try again.')
                    ]
                });
            }
        } catch (err) {
            Logger.error('Error in verify username modal', 'VerifyUsernameModal', err);

            // Use editReply instead of reply since we've already deferred
            await interaction.editReply({
                embeds: [
                    createBaseEmbed('danger')
                        .setTitle('Verification Error')
                        .setDescription('An error occurred while starting verification. Please try again later.')
                ]
            });
        }
    } catch (err) {
        Logger.error('Error in verify username modal', 'VerifyUsernameModal', err);

        // Only try to respond if we haven't replied and haven't deferred
        if (!interaction.replied && !interaction.deferred) {
            try {
                await interaction.reply({
                    embeds: [
                        createBaseEmbed('danger')
                            .setTitle('Verification Error')
                            .setDescription('An error occurred while processing your verification. Please try again later.')
                    ],
                    ephemeral: true
                });
            } catch (replyErr) {
                // If this fails too, just log it - we can't do anything else
                Logger.error('Failed to send error response', 'VerifyUsernameModal', replyErr);
            }
        } else if (interaction.deferred) {
            // If we deferred but didn't reply yet, use editReply
            try {
                await interaction.editReply({
                    embeds: [
                        createBaseEmbed('danger')
                            .setTitle('Verification Error')
                            .setDescription('An error occurred while processing your verification. Please try again later.')
                    ]
                });
            } catch (editErr) {
                Logger.error('Failed to edit reply with error', 'VerifyUsernameModal', editErr);
            }
        }
    }
}

async function handleMultiBindsAddModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
    // Get workflow data
    const workflowKey = interaction.user.id;
    const workflowData = global.bindingWorkflows[workflowKey];

    if (!workflowData || !workflowData.discordRoleIds || workflowData.discordRoleIds.length === 0) {
        await interaction.reply({
            content: 'Your binding session has expired or no roles were selected. Please try again.',
            ephemeral: true
        });
        return;
    }

    // Parse the rank range input
    const rankRange = interaction.fields.getTextInputValue('rank_range');
    let minRankId: number, maxRankId: number;

    try {
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
            await interaction.reply({
                embeds: [
                    createBaseEmbed('danger')
                        .setTitle('Invalid Input')
                        .setDescription('Please enter a valid rank number or range (e.g. "5" or "1-255").')
                ],
                ephemeral: true
            });
            return;
        }

        if (minRankId > maxRankId) {
            await interaction.reply({
                embeds: [
                    createBaseEmbed('danger')
                        .setTitle('Invalid Range')
                        .setDescription('Minimum rank cannot be higher than maximum rank.')
                ],
                ephemeral: true
            });
            return;
        }

        // Get the Roblox rank names
        const groupRoles = await robloxGroup.getRoles();
        const minRole = groupRoles.find(r => r.rank === minRankId);
        const maxRole = groupRoles.find(r => r.rank === maxRankId);

        if (!minRole) {
            await interaction.reply({
                embeds: [
                    createBaseEmbed('danger')
                        .setTitle('Invalid Rank')
                        .setDescription(`Could not find minimum rank with ID ${minRankId} in the group.`)
                ],
                ephemeral: true
            });
            return;
        }

        if (!maxRole) {
            await interaction.reply({
                embeds: [
                    createBaseEmbed('danger')
                        .setTitle('Invalid Rank')
                        .setDescription(`Could not find maximum rank with ID ${maxRankId} in the group.`)
                ],
                ephemeral: true
            });
            return;
        }

        // Get the role names for display
        const roleNames = workflowData.discordRoleIds.map(id => {
            const role = interaction.guild.roles.cache.get(id);
            return role ? role.name : `Unknown Role (${id})`;
        });

        // For the name, we'll use a range or single name based on whether min and max are the same
        const rankName = minRankId === maxRankId
            ? minRole.name
            : `${minRole.name} to ${maxRole.name}`;

        // Update workflow state
        workflowData.minRankId = minRankId;
        workflowData.maxRankId = maxRankId;
        workflowData.rankName = rankName;

        // Create the role selection component for roles to remove
        const row = new ActionRowBuilder<RoleSelectMenuBuilder>()
            .addComponents(
                new RoleSelectMenuBuilder()
                    .setCustomId('binds_select_remove_roles_multi')
                    .setPlaceholder('Select roles to remove when this binding is active (optional)')
                    .setMinValues(0)
                    .setMaxValues(25)
            );

        // Create confirmation buttons
        const buttonRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('role_binding_cancel')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary),
            );

        // Reply with role selector and info
        await interaction.reply({
            embeds: [
                createBaseEmbed()
                    .setTitle('Select Roles to Remove')
                    .setDescription(
                        `You're binding **${workflowData.discordRoleIds.length} role(s)** to Roblox rank "${rankName}".\n\n` +
                        `**Roles being bound:**\n${workflowData.discordRoleIds.map(id => `• <@&${String(id)}> (${interaction.guild.roles.cache.get(id)?.name || 'Unknown Role'})`).join('\n')}\n\n` +
                        `Now, select any Discord roles that should be **removed** when a member has this rank.\n\n` +
                        `For example, if you're binding the "Officer" role, you might want to remove the "NCO" role when someone gets promoted.`
                    )
            ],
            components: [row, buttonRow],
            ephemeral: true
        });

        // Update the select menu ID to include the user ID for state management
        const message = await interaction.fetchReply();
        const updatedRow = new ActionRowBuilder<RoleSelectMenuBuilder>()
            .addComponents(
                RoleSelectMenuBuilder.from(
                    (message.components[0].components[0] as any).data
                ).setCustomId(`binds_select_remove_roles_multi:${interaction.user.id}`)
            );

        await interaction.editReply({
            components: [updatedRow, buttonRow]
        });

        // Setup collector for the role selection menu
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.RoleSelect,
            time: 300000, // 5 minutes
        });

        // Refactored collector.on('collect') function with proper error handling
        collector.on('collect', async (i) => {
            try {
                // Verify user permissions
                if (i.user.id !== interaction.user.id) {
                    await i.reply({
                        content: 'This interaction is not for you.',
                        ephemeral: true
                    }).catch(err => {
                        Logger.warn(`Failed to reply to wrong user: ${err.message}`, 'ModalSubmitHandler');
                    });
                    return;
                }

                if (i.customId.startsWith('binds_select_remove_roles_multi')) {
                    // IMMEDIATELY defer the update to extend the 3-second window
                    await i.deferUpdate().catch(err => {
                        if (err.code === 10062) {
                            Logger.warn("Interaction expired before deferring", 'ModalSubmitHandler');
                        } else if (err.code === 40060) {
                            Logger.warn("Interaction already acknowledged elsewhere", 'ModalSubmitHandler');
                        } else {
                            Logger.error("Error deferring update", 'ModalSubmitHandler', err);
                        }
                    });

                    // Store the selected roles to remove
                    workflowData.rolesToRemove = i.values.map(id => String(id));

                    // Create final confirmation buttons
                    const finalButtonRow = new ActionRowBuilder<ButtonBuilder>()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('role_binding_confirm')
                                .setLabel('Confirm Bindings')
                                .setStyle(ButtonStyle.Success),
                            new ButtonBuilder()
                                .setCustomId('role_binding_cancel')
                                .setLabel('Cancel')
                                .setStyle(ButtonStyle.Danger)
                        );

                    // Format roles to remove display
                    let roleRemovalText = '';
                    if (workflowData.rolesToRemove && workflowData.rolesToRemove.length > 0) {
                        roleRemovalText = `\n\n**Will remove:** ${workflowData.rolesToRemove.map(id => `<@&${String(id)}>`).join(' ')}`;
                    } else {
                        roleRemovalText = '\n\nNo roles will be removed when this binding is active.';
                    }

                    // Update the message for confirmation with proper error handling
                    try {
                        await i.editReply({
                            embeds: [
                                createBaseEmbed()
                                    .setTitle('Confirm Role Bindings')
                                    .setDescription(
                                        `You're about to create **${workflowData.discordRoleIds.length} binding(s)** to Roblox rank "${rankName}".\n\n` +
                                        `**Roles being bound:**\n${workflowData.discordRoleIds.map(id => `• <@&${String(id)}>`).join('\n')}${roleRemovalText}\n\n` +
                                        `Please confirm that you want to create these bindings.`
                                    )
                            ],
                            components: [finalButtonRow]
                        });
                    } catch (updateErr) {
                        if (updateErr.code === 10062) {
                            Logger.warn("Interaction expired before update could be sent", 'ModalSubmitHandler');
                        } else if (updateErr.code === 40060) {
                            Logger.warn("Interaction already acknowledged", 'ModalSubmitHandler');
                        } else {
                            Logger.error("Error updating interaction", 'ModalSubmitHandler', updateErr);
                        }
                    }

                    // End the collector as we don't need it anymore
                    collector.stop();
                }
            } catch (err) {
                // Main error handling for any errors in the collector
                if (err.code === 10062) {
                    Logger.warn("Interaction expired in collector", 'ModalSubmitHandler');
                } else if (err.code === 40060) {
                    Logger.warn("Interaction already acknowledged in collector", 'ModalSubmitHandler');
                } else {
                    Logger.error("Error in role select collector", 'ModalSubmitHandler', err);

                    // Try to send a generic error message if possible
                    try {
                        if (!i.replied && !i.deferred) {
                            await i.reply({
                                content: "An error occurred processing your selection.",
                                ephemeral: true
                            });
                        }
                    } catch (finalErr) {
                        Logger.error("Failed to send error message", 'ModalSubmitHandler', finalErr);
                    }
                }
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time' && collected.size === 0) {
                try {
                    // Delete workflow data on timeout
                    delete global.bindingWorkflows[workflowKey];

                    // Only update if the message hasn't been modified by other interactions
                    const reply = await interaction.fetchReply().catch(() => null);
                    if (reply && reply.components.length > 0 && reply.components[0].components.length > 0
                        && reply.components[0].components[0].customId.startsWith('binds_select_remove_roles_multi')) {
                        await interaction.editReply({
                            content: 'Role binding session timed out. Please try again.',
                            components: [],
                            embeds: []
                        }).catch(() => { });
                    }
                } catch (e) {
                    Logger.error('Error cleaning up timed out binding session:', 'handleModalSubmitHandler', e);
                }
            }
        });

    } catch (err) {
        Logger.error('Error in handleMultiBindsAddModalSubmit:', 'handleModalSubmitHandler', err);
        await interaction.reply({
            embeds: [
                createBaseEmbed('danger')
                    .setTitle('Error')
                    .setDescription('An error occurred while processing your request: ' + err.message)
            ],
            ephemeral: true
        });
    }
}

// Fixed handleBindsAddModalSubmit function:
async function handleBindsAddModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
    // Extract role ID from modal custom ID
    const discordRoleId = interaction.customId.replace('binds_add_', '');
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
            await interaction.reply({
                embeds: [
                    createBaseEmbed('primary')
                        .setTitle('Invalid Input')
                        .setDescription('Please enter a valid rank number or range (e.g. "5" or "1-255").')
                        .setColor(0xff0000)
                ],
                ephemeral: true
            });
            return;
        }

        if (minRankId > maxRankId) {
            await interaction.reply({
                embeds: [
                    createBaseEmbed('primary')
                        .setTitle('Invalid Range')
                        .setDescription('Minimum rank cannot be higher than maximum rank.')
                        .setColor(0xff0000)
                ],
                ephemeral: true
            });
            return;
        }

        // Get the Roblox rank names
        const groupRoles = await robloxGroup.getRoles();
        const minRole = groupRoles.find(r => r.rank === minRankId);
        const maxRole = groupRoles.find(r => r.rank === maxRankId);

        if (!minRole) {
            await interaction.reply({
                embeds: [
                    createBaseEmbed('primary')
                        .setTitle('Invalid Rank')
                        .setDescription(`Could not find minimum rank with ID ${minRankId} in the group.`)
                        .setColor(0xff0000)
                ],
                ephemeral: true
            });
            return;
        }

        if (!maxRole) {
            await interaction.reply({
                embeds: [
                    createBaseEmbed('primary')
                        .setTitle('Invalid Rank')
                        .setDescription(`Could not find maximum rank with ID ${maxRankId} in the group.`)
                        .setColor(0xff0000)
                ],
                ephemeral: true
            });
            return;
        }

        // Get the Discord role
        const discordRole = interaction.guild.roles.cache.get(discordRoleId);

        // For the name, we'll use a range or single name based on whether min and max are the same
        const rankName = minRankId === maxRankId
            ? minRole.name
            : `${minRole.name} to ${maxRole.name}`;

        // Instead of creating the binding immediately, show a role selection menu
        // Create a custom ID that includes all the needed information
        const customId = `binds_select_roles:${discordRoleId}:${minRankId}:${maxRankId}:${encodeURIComponent(rankName)}`;

        // Get other role bindings to exclude this role from options
        const roleBindings = await getRoleBindings(interaction.guild.id);
        const boundRoleIds = new Set(roleBindings.map(binding => binding.discordRoleId));

        // Create the role selection component
        const row = new ActionRowBuilder<RoleSelectMenuBuilder>()
            .addComponents(
                new RoleSelectMenuBuilder()
                    .setCustomId(customId)
                    .setPlaceholder('Select roles to remove when this binding is active (optional)')
                    .setMinValues(0)
                    .setMaxValues(25)
            );

        // Create confirmation buttons
        const buttonRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('role_binding_cancel')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary),
            );

        // FIXED: Removed reference to workflowData in this context and created a simpler description
        await interaction.reply({
            embeds: [
                createBaseEmbed()
                    .setTitle('Select Roles to Remove')
                    .setDescription(
                        `You're binding Discord role **${discordRole.name}** to Roblox rank "${rankName}".\n\n` +
                        `Now, select any Discord roles that should be **removed** when a member has this rank.\n\n` +
                        `For example, if you're binding the "Officer" role, you might want to remove the "NCO" role when someone gets promoted.`
                    )
            ],
            components: [row, buttonRow],
            ephemeral: true
        });

    } catch (err) {
        Logger.error('Error in handleBindsAddModalSubmit:', 'handleModalSubmitHandler', err);
        await interaction.reply({
            embeds: [
                createBaseEmbed('primary')
                    .setTitle('Error')
                    .setDescription('An error occurred while processing your request.')
                    .setColor(0xff0000)
            ],
            ephemeral: true
        });
    }
}

async function handleDmRoleModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
    // Check permissions again
    const member = interaction.guild?.members.cache.get(interaction.user.id);
    if (!member || !member.roles.cache.some(role => config.permissions.admin?.includes(role.id))) {
        await interaction.reply({
            content: 'You do not have permission to DM members.',
            ephemeral: true
        });
        return;
    }

    await interaction.deferReply({ ephemeral: true });

    // Extract role ID from the modal ID
    const roleId = interaction.customId.split(':')[1];
    const role = interaction.guild?.roles.cache.get(roleId);

    if (!role) {
        await interaction.editReply({ content: 'Role not found. It may have been deleted.' });
        return;
    }

    // Get the message content
    const messageSubject = interaction.fields.getTextInputValue('message_subject');
    const messageContent = interaction.fields.getTextInputValue('message_content');

    // Get all members with this role
    const membersWithRole = interaction.guild?.members.cache.filter(member =>
        member.roles.cache.has(roleId)
    );

    if (!membersWithRole || membersWithRole.size === 0) {
        await interaction.editReply({ content: `No members found with the role ${role.name}.` });
        return;
    }

    await interaction.editReply({
        content: `Preparing to send DM to ${membersWithRole.size} members with role ${role.name}...`
    });

    // Process members in chunks
    const options: ProcessingOptions = {
        totalItems: membersWithRole.size,
        chunkSize: 5, // Process 5 users at a time
        initialMessage: `Sending DMs to ${membersWithRole.size} members...`,
        progressInterval: 10, // Update progress every 10%
        completionMessage: "Finished sending all DMs."
    };

    const results = {
        success: 0,
        failed: 0
    };

    const memberArray = Array.from(membersWithRole.values());

    await processInChunks(
        interaction,
        memberArray,
        async (guildMember, index) => {
            try {
                // Add delay to avoid rate limits
                await new Promise(r => setTimeout(r, 500 * (index % 5)));

                // Create a nice embed for the DM
                const dmEmbed = createBaseEmbed('primary')
                    .setTitle(messageSubject)
                    .setDescription(messageContent)
                    .setFooter({ text: `Sent by ${interaction.user.tag} from ${interaction.guild?.name}` })
                    .setTimestamp();

                try {
                    // Try to DM the user
                    await guildMember.user.send({ embeds: [dmEmbed] });
                    results.success++;

                    // Log the action
                    logAction(
                        'DM',
                        interaction.user,
                        `DM sent to ${guildMember.user.tag} from role ${role.name}`,
                        null
                    );
                } catch (err) {
                    results.failed++;
                    // Provide a cleaner error message
                    if (err.code === 50007) {
                        console.log(`Could not DM user ${guildMember.user.tag}: User has DMs disabled`);
                    } else {
                        console.log(`Could not DM user ${guildMember.user.tag}: ${err.message || "Unknown error"}`);
                    }
                }
            } catch (err) {
                Logger.error(`Error processing member ${guildMember.user.tag}:`, 'handleModalSubmitHandler', err);
                results.failed++;
            }

            return null;
        },
        options
    );

    // Create results embed
    const resultsEmbed = createBaseEmbed('primary')
        .setTitle('DM Operation Results')
        .setDescription(`DM operation complete for ${membersWithRole.size} members with role ${role.name}.`)
        .addFields(
            { name: 'Successfully Sent', value: `${results.success}`, inline: true },
            { name: 'Failed to Send', value: `${results.failed}`, inline: true }
        )
        .setTimestamp();

    // Send results
    await interaction.followUp({
        content: 'DM operation complete.',
        embeds: [resultsEmbed],
        ephemeral: false
    });
}

async function handleDmMatchedMembersModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
    // Check permissions again
    const member = interaction.guild?.members.cache.get(interaction.user.id);
    if (!member || !member.roles.cache.some(role => config.permissions.admin?.includes(role.id))) {
        await interaction.reply({
            content: 'You do not have permission to DM members.',
            ephemeral: true
        });
        return;
    }

    await interaction.deferReply({ ephemeral: true });

    // Extract info from the modal ID
    const [_, groupId, userId] = interaction.customId.split(':');

    // Get the message content
    const messageSubject = interaction.fields.getTextInputValue('message_subject');
    const messageContent = interaction.fields.getTextInputValue('message_content');

    // Get the cached Discord IDs
    const cacheKey = `${groupId}:${userId}`;
    const discordIdsToMessage = global.matchedDiscordCache?.[cacheKey] || [];

    if (discordIdsToMessage.length === 0) {
        await interaction.editReply({
            content: 'No members found to message. The data may have expired.'
        });
        return;
    }

    await interaction.editReply({
        content: `Preparing to send DM to ${discordIdsToMessage.length} matched members...`
    });

    const results = {
        success: 0,
        failed: 0,
        notFound: 0
    };

    // Process each Discord ID
    for (const discordId of discordIdsToMessage) {
        try {
            // Try to get the member
            const member = await interaction.guild?.members.fetch(discordId).catch(() => null);

            if (!member) {
                results.notFound++;
                continue;
            }

            // Create a nice embed for the DM
            const dmEmbed = createBaseEmbed('primary')
                .setTitle(messageSubject)
                .setDescription(messageContent)
                .setFooter({ text: `Sent by ${interaction.user.tag} from ${interaction.guild?.name || 'the server'}` })
                .setTimestamp();

            try {
                // Try to DM the user
                await member.send({ embeds: [dmEmbed] });
                results.success++;

                // Log the action
                logAction(
                    'DM',
                    interaction.user,
                    `DM sent to ${member.user.tag} via comparegroups command`,
                    null
                );
            } catch (err) {
                results.failed++;
                // Provide a cleaner error message
                if (err.code === 50007) {
                    console.log(`Could not DM user ${member.user.tag}: User has DMs disabled`);
                } else {
                    console.log(`Could not DM user ${member.user.tag}: ${err.message || "Unknown error"}`);
                }
            }

            // Add a small delay to avoid rate limits
            await new Promise(r => setTimeout(r, 500));
        } catch (err) {
            Logger.error(`Error processing discord ID ${discordId}:`, 'handleModalSubmitHandler', err);
            results.failed++;
        }
    }

    // Create results embed
    const resultsEmbed = createBaseEmbed('primary')
        .setTitle('DM Operation Results')
        .setDescription(`DM operation complete for ${discordIdsToMessage.length} matched members.`)
        .addFields(
            { name: 'Successfully Sent', value: `${results.success}`, inline: true },
            { name: 'Failed to Send', value: `${results.failed}`, inline: true },
            { name: 'Users Not Found', value: `${results.notFound}`, inline: true }
        )
        .setTimestamp();

    // Send results
    await interaction.followUp({
        content: 'DM operation complete.',
        embeds: [resultsEmbed],
        ephemeral: false
    });
}

// Original DM modal for Roblox user DMs (keep if needed)
// Update the entire handleDmModalSubmit function:

async function handleDmModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
    // Check permissions
    const member = interaction.guild?.members.cache.get(interaction.user.id);
    if (!member || !member.roles.cache.some(role => config.permissions.admin?.includes(role.id))) {
        await interaction.reply({
            content: 'You do not have permission to DM members.',
            ephemeral: true
        });
        return;
    }

    await interaction.deferReply({ ephemeral: true });

    // Extract info from the modal ID
    const [_, groupId, userId] = interaction.customId.split(':');

    // Get the message content
    const messageSubject = interaction.fields.getTextInputValue('message_subject');
    const messageContent = interaction.fields.getTextInputValue('message_content');

    // Get the cached members
    const cacheKey = `${groupId}:${userId}`;
    const membersToDm = global.matchedMembersCache?.[cacheKey] || [];

    if (!membersToDm.length) {
        await interaction.editReply({
            content: 'No members found to DM. The data may have expired.'
        });
        return;
    }

    await interaction.editReply({
        content: `Preparing to send DM to ${membersToDm.length} members...`
    });

    // Process members in chunks
    const options: ProcessingOptions = {
        totalItems: membersToDm.length,
        chunkSize: 3, // Process 3 users at a time
        initialMessage: `Sending DMs to ${membersToDm.length} members...`,
        progressInterval: 10, // Update progress every 10%
        completionMessage: "Finished sending all DMs."
    };

    const results = {
        success: 0,
        failed: 0,
        notFound: 0
    };

    await processInChunks(
        interaction,
        membersToDm,
        async (userId, index) => {
            try {
                // Add delay to avoid rate limits
                await new Promise(r => setTimeout(r, 1000 * (index % 3)));

                // Get Roblox user info
                const robloxUser = await robloxClient.getUser(Number(userId));

                // Create a nice embed for the DM
                const dmEmbed = createBaseEmbed('primary')
                    .setTitle(messageSubject)
                    .setDescription(messageContent)
                    .setFooter({ text: `Sent by ${interaction.user.tag}` })
                    .setTimestamp();

                // Since this handler is for Roblox users, you'd need to implement
                // your own logic to find associated Discord users
                // This is a placeholder for that implementation
                results.notFound++;
            } catch (err) {
                // Fix here - convert userId to string in template literal
                Logger.error(`Error processing user ${String(userId)}:`, 'modalSubmitHandler', err);
                results.failed++;
            }

            return null;
        },
        options
    );

    // Create results embed
    const resultsEmbed = createBaseEmbed('primary')
        .setTitle('DM Operation Results')
        .setDescription(`DM operation complete for ${membersToDm.length} users.`)
        .addFields(
            { name: 'Successfully Sent', value: `${results.success}`, inline: true },
            { name: 'Failed to Send', value: `${results.failed}`, inline: true },
            { name: 'Users Not Found', value: `${results.notFound}`, inline: true }
        )
        .setTimestamp();

    // Send results
    await interaction.followUp({
        content: 'DM operation complete.',
        embeds: [resultsEmbed],
        ephemeral: false
    });
}