import { CommandContext } from '../../structures/addons/CommandAddons';
import Command from '../../structures/Command';
import { addRoleBinding, removeRoleBinding, getRoleBindings } from '../../handlers/roleBindHandler';
import { config } from '../../config';
import { createBaseEmbed } from '../../utils/embedUtils';
import { robloxGroup } from '../../main';
import { ActionRowBuilder, CommandInteraction, ModalBuilder, RoleSelectMenuBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';

class RoleBindsCommand extends Command {
    constructor() {
        super({
            trigger: 'binds',
            description: 'Manage role bindings between Discord roles and Roblox group ranks',
            type: 'ChatInput',
            module: 'verification',
            args: [
                {
                    trigger: 'action',
                    description: 'Action to perform',
                    type: 'String',
                    required: true,
                    choices: [
                        { name: 'Add', value: 'add' },
                        { name: 'Remove', value: 'remove' },
                        { name: 'View', value: 'view' }
                    ]
                },
            ],
            permissions: [
                {
                    type: 'role',
                    ids: config.permissions.admin,
                    value: true,
                }
            ],
            enabled: true
        });
    }

    async run(ctx: CommandContext) {
        try {
            const action = ctx.args['action'] as string;

            // View current bindings
            if (action === 'view') {
                const bindings = await getRoleBindings(ctx.guild.id);

                if (bindings.length === 0) {
                    return ctx.reply({
                        embeds: [
                            createBaseEmbed()
                                .setTitle('Role Bindings')
                                .setDescription('No role bindings configured for this server.')
                        ]
                    });
                }

                const bindingsDescription = bindings.map(binding => {
                    const discordRole = ctx.guild.roles.cache.get(binding.discordRoleId);
                    const roleName = discordRole ? discordRole.name : 'Unknown Role';

                    // Display rank range instead of single rank
                    const rankDisplay = binding.minRankId === binding.maxRankId
                        ? `Rank: ${binding.minRankId}`
                        : `Ranks: ${binding.minRankId}-${binding.maxRankId}`;

                    // Add information about roles to remove
                    let removalInfo = '';
                    if (binding.rolesToRemove && binding.rolesToRemove.length > 0) {
                        const removalRoles = binding.rolesToRemove.map(id => {
                            const role = ctx.guild.roles.cache.get(id);
                            return role ? `<@&${id}>` : `Unknown Role (${id})`;
                        });
                        removalInfo = `\n    *Removes: ${removalRoles.join(', ')}*`;
                    }

                    return `<@&${binding.discordRoleId}> (${roleName}) → ${rankDisplay}${removalInfo}`;
                });

                return ctx.reply({
                    embeds: [
                        createBaseEmbed()
                            .setTitle('Role Bindings')
                            .setDescription(bindingsDescription.join('\n\n'))
                    ]
                });
            }

            // Add binding - show role selector
            if (action === 'add') {
                // Check if we have an initial role from command arguments
                const discordRoleId = ctx.args['discord-role'] as string;

                if (discordRoleId) {
                    // Legacy flow - Single role binding with provided role
                    const discordRole = ctx.guild.roles.cache.get(discordRoleId);
                    if (!discordRole) {
                        return ctx.reply({
                            embeds: [
                                createBaseEmbed('danger')
                                    .setTitle('Invalid Role')
                                    .setDescription('The specified Discord role could not be found.')
                            ],
                            ephemeral: true
                        });
                    }

                    // Create a modal
                    const modal = new ModalBuilder()
                        .setCustomId(`binds_add_${discordRoleId}`)
                        .setTitle(`Bind Role: ${discordRole.name}`);

                    // Add components to modal
                    const rankRangeInput = new TextInputBuilder()
                        .setCustomId('rank_range')
                        .setLabel('Rank Range (e.g. "5" or "1-255")')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Enter a single rank or range like 1-255')
                        .setRequired(true);

                    // Add inputs to the modal
                    const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(rankRangeInput);
                    modal.addComponents(firstActionRow);

                    // Show the modal
                    if (ctx.type === 'interaction' && ctx.subject) {
                        try {
                            const interaction = ctx.subject as CommandInteraction;

                            if (interaction.replied || interaction.deferred) {
                                console.error("Interaction already replied or deferred");
                                return ctx.reply({ content: 'Unable to show form - interaction already handled', ephemeral: true });
                            }

                            await interaction.showModal(modal);
                            console.log("Modal shown successfully for role binding");
                        } catch (error) {
                            console.error('Error showing modal for role binding:', error);
                            return ctx.reply({
                                content: `Failed to show the binding form: ${error.message || "Unknown error"}`,
                                ephemeral: true
                            });
                        }
                    } else {
                        return ctx.reply({ content: "This command can only be used with slash commands.", ephemeral: true });
                    }
                } else {
                    // New flow - Multiple role binding with role selector
                    if (ctx.type === 'interaction' && ctx.subject) {
                        try {
                            const interaction = ctx.subject as CommandInteraction;

                            if (interaction.replied || interaction.deferred) {
                                console.error("Interaction already replied or deferred");
                                return ctx.reply({ content: 'Unable to show role selector - interaction already handled', ephemeral: true });
                            }

                            // Create role selector
                            const row = new ActionRowBuilder<RoleSelectMenuBuilder>()
                                .addComponents(
                                    new RoleSelectMenuBuilder()
                                        .setCustomId('binds_add_roles_selection')
                                        .setPlaceholder('Select roles to bind')
                                        .setMinValues(1)
                                        .setMaxValues(25)
                                );

                            await interaction.reply({
                                embeds: [
                                    createBaseEmbed()
                                        .setTitle('Select Roles to Bind')
                                        .setDescription('Please select one or more Discord roles to bind to a Roblox rank or rank range.')
                                ],
                                components: [row],
                                ephemeral: true
                            });
                        } catch (error) {
                            console.error('Error showing role selector:', error);
                            return ctx.reply({
                                content: `Failed to show role selector: ${error.message || "Unknown error"}`,
                                ephemeral: true
                            });
                        }
                    } else {
                        return ctx.reply({ content: "This command can only be used with slash commands.", ephemeral: true });
                    }
                }

                return;
            }

            // Remove binding - requires a role
            if (action === 'remove') {
                const discordRoleId = ctx.args['discord-role'] as string;
                if (!discordRoleId) {
                    return ctx.reply({
                        embeds: [
                            createBaseEmbed('danger')
                                .setTitle('Missing Arguments')
                                .setDescription('You must specify a Discord role to remove the binding for.')
                        ],
                        ephemeral: true
                    });
                }

                try {
                    await removeRoleBinding(ctx.guild.id, discordRoleId);

                    return ctx.reply({
                        embeds: [
                            createBaseEmbed()
                                .setTitle('Role Binding Removed')
                                .setDescription(`Removed binding for Discord role <@&${discordRoleId}>`)
                        ]
                    });
                } catch (err) {
                    console.error('Error removing role binding:', err);
                    return ctx.reply({
                        embeds: [
                            createBaseEmbed('danger')
                                .setTitle('Error')
                                .setDescription('An error occurred while removing the role binding, or the binding doesn\'t exist.')
                        ],
                        ephemeral: true
                    });
                }
            }

            // If we got here, the action wasn't valid
            return ctx.reply({
                embeds: [
                    createBaseEmbed('danger')
                        .setTitle('Invalid Action')
                        .setDescription('You must specify a valid action: add, remove, or view.')
                ],
                ephemeral: true
            });
        } catch (err) {
            console.error('Error in binds command:', err);
            return ctx.reply({
                embeds: [
                    createBaseEmbed('danger')
                        .setTitle('Command Error')
                        .setDescription('An unexpected error occurred: ' + err.message)
                ],
                ephemeral: true
            });
        }
    }
}

export default RoleBindsCommand;