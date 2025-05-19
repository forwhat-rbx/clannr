import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { createBaseEmbed } from '../../utils/embedUtils';
import { getLinkedRobloxUser } from '../../handlers/accountLinks';
import { updateUserRoles } from '../../handlers/roleBindHandler';
import { updateNickname } from '../../handlers/nicknameHandler';
import { robloxClient, robloxGroup } from '../../main';
import { config } from '../../config';
import { Role } from 'discord.js';

class UpdateCommand extends Command {
    constructor() {
        super({
            trigger: 'update',
            description: 'Update your roles and nickname based on your Roblox rank',
            type: 'ChatInput',
            module: 'verification',
            args: [
                {
                    trigger: 'user',
                    description: 'User to update (admin only)',
                    type: 'DiscordUser',
                    required: false
                }
            ],
            enabled: true
        });
    }

    async run(ctx: CommandContext) {
        try {
            // Defer the reply to give us time to process
            await ctx.defer();

            // Check if we're updating someone else (admin only)
            let targetMember = ctx.member;
            const targetUser = ctx.args['user'] ? ctx.args['user'] : ctx.user;

            if (ctx.args['user'] && ctx.args['user'] !== ctx.user.id) {
                // Admin permission check for updating others
                if (!ctx.member.roles.cache.some(role => config.permissions.admin.includes(role.id))) {
                    return ctx.reply({
                        content: 'You need admin permissions to update other users.',
                        ephemeral: true
                    });
                }

                try {
                    targetMember = await ctx.guild.members.fetch(targetUser.id);
                } catch (err) {
                    return ctx.reply({
                        content: 'Could not find that user in this server.',
                        ephemeral: true
                    });
                }
            }

            // Get linked Roblox user
            const robloxUser = await getLinkedRobloxUser(targetUser.id);
            if (!robloxUser) {
                return ctx.reply({
                    content: targetUser.id === ctx.user.id
                        ? "You're not verified. Please use `/verify` first."
                        : "That user isn't verified.",
                    ephemeral: true
                });
            }

            // Log what we're doing
            console.log(`Running update command for ${targetUser.tag}: Roblox user ${robloxUser.name} (${robloxUser.id})`);

            // Store initial nickname for comparison later
            const oldNickname = targetMember.nickname || targetMember.user.username;

            // Update nickname, with verbose logging
            console.log(`Updating nickname for ${targetMember.user.tag}`);
            const nicknameResult = await updateNickname(targetMember, robloxUser);
            const newNickname = targetMember.nickname || targetMember.user.username;
            console.log(`Nickname update result: ${nicknameResult ? "Success" : "No change/Failed"}, Old: "${oldNickname}", New: "${newNickname}"`);

            // Update roles, with verbose logging
            console.log(`Updating roles for ${targetMember.user.tag}`);

            // Custom updateUserRoles that captures role names for better feedback
            const roleResult = await updateUserRoles(ctx.guild, targetMember, robloxUser.id);

            // Get details about the role changes
            let addedRoles: string[] = [];
            let removedRoles: string[] = [];

            if (roleResult.addedRoleIds) {
                addedRoles = roleResult.addedRoleIds.map(id => {
                    const role = ctx.guild.roles.cache.get(id);
                    return role ? role.name : `Unknown Role (${id})`;
                });
            }

            if (roleResult.removedRoleIds) {
                removedRoles = roleResult.removedRoleIds.map(id => {
                    const role = ctx.guild.roles.cache.get(id);
                    return role ? role.name : `Unknown Role (${id})`;
                });
            }

            console.log(`Role update result: ${roleResult.success ? "Success" : "Failed"}, Added: [${addedRoles.join(', ')}], Removed: [${removedRoles.join(', ')}]`);

            // Build a detailed response
            const embed = createBaseEmbed().setTitle('Update Results');
            const changes = [];

            // Add nickname change details if applicable
            if (nicknameResult && oldNickname !== newNickname) {
                changes.push(`**Nickname:** \`${oldNickname}\` → \`${newNickname}\``);
            }

            // Add role changes details if applicable
            if (addedRoles.length > 0) {
                changes.push(`**Added Roles:** ${addedRoles.map(r => `\`${r}\``).join(', ')}`);
            }

            if (removedRoles.length > 0) {
                changes.push(`**Removed Roles:** ${removedRoles.map(r => `\`${r}\``).join(', ')}`);
            }

            // Determine color and response based on whether changes were made
            if (changes.length > 0) {
                embed
                    .setColor('#00ff00')
                    .setDescription(`${targetUser.id === ctx.user.id ? 'Your' : `${targetUser.tag}'s`} data has been successfully updated:\n\n${changes.join('\n')}`);
            } else {
                embed
                    .setColor('#0099ff')
                    .setDescription(`No changes were needed for ${targetUser.id === ctx.user.id ? 'your' : `${targetUser.tag}'s`} nickname or roles.`);
            }

            return ctx.reply({ embeds: [embed] });
        } catch (err) {
            console.error('Error in update command:', err);
            return ctx.reply({
                embeds: [
                    createBaseEmbed()
                        .setTitle('Update Error')
                        .setDescription('An error occurred while updating: ' + (err.message || 'Unknown error'))
                        .setColor('#FF0000')
                ],
                ephemeral: true
            });
        }
    }
}

export default UpdateCommand;