import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { addRoleBinding, removeRoleBinding, getRoleBindings } from '../../handlers/roleBindHandler';
import { config } from '../../config';
import { createBaseEmbed } from '../../utils/embedUtils';
import { robloxGroup } from '../../main';

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
                {
                    trigger: 'discord-role',
                    description: 'Discord role to bind',
                    type: 'DiscordRole',
                    required: false
                },
                {
                    trigger: 'min-rank',
                    description: 'Minimum Roblox rank ID (inclusive)',
                    type: 'Number',
                    required: false
                },
                {
                    trigger: 'max-rank',
                    description: 'Maximum Roblox rank ID (inclusive, defaults to min-rank if not set)',
                    type: 'Number',
                    required: false
                }
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
                        : `Ranks: ${binding.minRankId} - ${binding.maxRankId}`;

                    return `<@&${binding.discordRoleId}> (${roleName}) → ${rankDisplay}`;
                });

                return ctx.reply({
                    embeds: [
                        createBaseEmbed()
                            .setTitle('Role Bindings')
                            .setDescription(bindingsDescription.join('\n'))
                    ]
                });
            }

            // Check required args for add/remove
            const discordRoleId = ctx.args['discord-role'] as string;
            if (!discordRoleId) {
                return ctx.reply({
                    embeds: [
                        createBaseEmbed()
                            .setTitle('Missing Arguments')
                            .setDescription('You must specify a Discord role.')
                            .setColor(0xff0000)
                    ],
                    ephemeral: true
                });
            }

            // Get the Discord role
            const discordRole = ctx.guild.roles.cache.get(discordRoleId);
            if (!discordRole) {
                return ctx.reply({
                    embeds: [
                        createBaseEmbed()
                            .setTitle('Invalid Role')
                            .setDescription('The specified Discord role could not be found.')
                            .setColor(0xff0000)
                    ],
                    ephemeral: true
                });
            }

            // Add binding
            if (action === 'add') {
                const minRankId = ctx.args['min-rank'] as number;
                if (!minRankId && minRankId !== 0) {
                    return ctx.reply({
                        embeds: [
                            createBaseEmbed()
                                .setTitle('Missing Arguments')
                                .setDescription('You must specify a minimum rank ID.')
                                .setColor(0xff0000)
                        ],
                        ephemeral: true
                    });
                }

                // If max rank is not specified, use min rank (single rank binding)
                const maxRankId = (ctx.args['max-rank'] as number) ?? minRankId;

                // Validate rank range
                if (minRankId > maxRankId) {
                    return ctx.reply({
                        embeds: [
                            createBaseEmbed()
                                .setTitle('Invalid Arguments')
                                .setDescription('Minimum rank cannot be higher than maximum rank.')
                                .setColor(0xff0000)
                        ],
                        ephemeral: true
                    });
                }

                // Get the Roblox rank names
                try {
                    const groupRoles = await robloxGroup.getRoles();
                    const minRole = groupRoles.find(r => r.rank === minRankId);
                    const maxRole = groupRoles.find(r => r.rank === maxRankId);

                    if (!minRole) {
                        return ctx.reply({
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
                        return ctx.reply({
                            embeds: [
                                createBaseEmbed()
                                    .setTitle('Invalid Rank')
                                    .setDescription(`Could not find maximum rank with ID ${maxRankId} in the group.`)
                                    .setColor(0xff0000)
                            ],
                            ephemeral: true
                        });
                    }

                    // For the name, we'll use a range or single name based on whether min and max are the same
                    const rankName = minRankId === maxRankId
                        ? minRole.name
                        : `${minRole.name} to ${maxRole.name}`;

                    await addRoleBinding(ctx.guild.id, discordRoleId, minRankId, maxRankId, rankName);

                    const rangeText = minRankId === maxRankId
                        ? `rank "${minRole.name}" (${minRankId})`
                        : `rank range "${minRole.name}" (${minRankId}) to "${maxRole.name}" (${maxRankId})`;

                    return ctx.reply({
                        embeds: [
                            createBaseEmbed()
                                .setTitle('Role Binding Added')
                                .setDescription(`Bound Discord role <@&${discordRoleId}> to Roblox ${rangeText}`)
                        ]
                    });
                } catch (err) {
                    console.error('Error adding role binding:', err);
                    return ctx.reply({
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

            // Remove binding
            if (action === 'remove') {
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
                            createBaseEmbed()
                                .setTitle('Error')
                                .setDescription('An error occurred while removing the role binding, or the binding doesn\'t exist.')
                                .setColor(0xff0000)
                        ],
                        ephemeral: true
                    });
                }
            }

            // If we got here, the action wasn't valid
            return ctx.reply({
                embeds: [
                    createBaseEmbed()
                        .setTitle('Invalid Action')
                        .setDescription('You must specify a valid action: add, remove, or view.')
                        .setColor(0xff0000)
                ],
                ephemeral: true
            });
        } catch (err) {
            console.error('Error in binds command:', err);
            return ctx.reply({
                embeds: [
                    createBaseEmbed()
                        .setTitle('Command Error')
                        .setDescription('An unexpected error occurred.')
                        .setColor(0xff0000)
                ],
                ephemeral: true
            });
        }
    }
}

export default RoleBindsCommand;