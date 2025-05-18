import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { ActionRowBuilder, CommandInteraction, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { config } from '../../config';

class DMRoleCommand extends Command {
    constructor() {
        super({
            trigger: 'dmrole',
            description: 'Send a direct message to all members with a specific role',
            type: 'ChatInput',
            module: 'admin',
            args: [
                {
                    trigger: 'role',
                    description: 'Which role members would you like to DM?',
                    required: true,
                    type: 'DiscordRole',
                }
            ],
            permissions: [
                {
                    type: 'role',
                    ids: config.permissions.admin,
                    value: true
                }
            ]
        });
    }

    async run(ctx: CommandContext) {
        try {
            // Don't defer - we need to show a modal
            const roleId = ctx.args['role'] as string;
            const role = ctx.guild.roles.cache.get(roleId);

            if (!role) {
                return ctx.reply({ content: 'Please provide a valid role.', ephemeral: true });
            }

            // Count members with the role first
            const membersWithRole = ctx.guild.members.cache.filter(member =>
                member.roles.cache.has(role.id)
            );

            if (membersWithRole.size === 0) {
                return ctx.reply({
                    content: `No members found with the role ${role.name}.`,
                    ephemeral: true
                });
            }

            // Create a modal for the DM message
            const modal = new ModalBuilder()
                .setCustomId(`dm_role_modal:${role.id}`)
                .setTitle(`DM ${membersWithRole.size} Members`);

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

            // Show the modal
            if (ctx.type === 'interaction' && ctx.subject) {
                try {
                    console.log("About to show modal for role:", role.name);
                    const interaction = ctx.subject as CommandInteraction;

                    if (interaction.replied || interaction.deferred) {
                        console.error("Interaction already replied or deferred");
                        return ctx.reply({ content: 'Unable to show form - interaction already handled', ephemeral: true });
                    }

                    await interaction.showModal(modal);
                    console.log("Modal shown successfully");

                } catch (error) {
                    console.error('Error showing modal:', error);
                    await ctx.reply({
                        content: `Failed to show the DM form: ${error.message || "Unknown error"}`,
                        ephemeral: true
                    });
                }
            } else {
                await ctx.reply({ content: "This command can only be used with slash commands.", ephemeral: true });
            }
        } catch (error) {
            console.error('Error in DMRole command:', error);
            await ctx.reply({ content: 'An error occurred while processing the command.', ephemeral: true });
        }
    }
}

export default DMRoleCommand;