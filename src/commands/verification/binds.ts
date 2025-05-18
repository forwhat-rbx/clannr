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
                    trigger: 'roblox-rank',
                    description: 'Roblox group rank ID (number)',
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
                    return `<@&${binding.discordRoleId}> (${roleName}) → Rank: ${binding.robloxRankName || binding.robloxRankId}`;
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
                const robloxRankId = ctx.args['roblox-rank'] as number;
                if (!robloxRankId && robloxRankId !== 0) {
                    return ctx.reply({
                        embeds: [
                            createBaseEmbed()
                                .setTitle('Missing Arguments')
                                .setDescription('You must specify a Roblox rank ID.')
                                .setColor(0xff0000)
                        ],
                        ephemeral: true
                    });
                }

                // Get the Roblox rank name
                try {
                    const groupRoles = await robloxGroup.getRoles();
                    const role = groupRoles.find(r => r.rank === robloxRankId);

                    if (!role) {
                        return ctx.reply({
                            embeds: [
                                createBaseEmbed()
                                    .setTitle('Invalid Rank')
                                    .setDescription(`Could not find rank with ID ${robloxRankId} in the group.`)
                                    .setColor(0xff0000)
                            ],
                            ephemeral: true
                        });
                    }

                    await addRoleBinding(ctx.guild.id, discordRoleId, robloxRankId, role.name);

                    return ctx.reply({
                        embeds: [
                            createBaseEmbed()
                                .setTitle('Role Binding Added')
                                .setDescription(`Bound Discord role <@&${discordRoleId}> to Roblox rank "${role.name}" (${robloxRankId})`)
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