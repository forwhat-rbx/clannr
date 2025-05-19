import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { createBaseEmbed, embedColors } from '../../utils/embedUtils';
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

            // Custom updateUserRoles that captures role IDs for better feedback
            const roleResult = await updateUserRoles(ctx.guild, targetMember, robloxUser.id);

            console.log(`Role update result: ${roleResult.success ? "Success" : "Failed"}, Added: ${roleResult.addedRoleIds?.length || 0}, Removed: ${roleResult.removedRoleIds?.length || 0}`);

            // Build a detailed response
            const embed = createBaseEmbed();
            embed.setTitle('Update Results');
            const changes = [];

            // Add nickname change details if applicable
            if (nicknameResult && oldNickname !== newNickname) {
                changes.push(`**Nickname:** \`${oldNickname}\` → \`${newNickname}\``);
            }

            // Add role changes details with mentions
            if (roleResult.addedRoleIds && roleResult.addedRoleIds.length > 0) {
                changes.push(`**Added Roles:** ${roleResult.addedRoleIds.map(id => `<@&${id}>`).join(' ')}`);
            }

            if (roleResult.removedRoleIds && roleResult.removedRoleIds.length > 0) {
                changes.push(`**Removed Roles:** ${roleResult.removedRoleIds.map(id => `<@&${id}>`).join(' ')}`);
            }

            // Set description based on whether changes were made
            if (changes.length > 0) {
                embed.setDescription(`${targetUser.id === ctx.user.id ? 'Your' : `${targetUser.tag}'s`} data has been successfully updated:\n\n${changes.join('\n')}`);
            } else {
                embed.setDescription(`No changes were needed for ${targetUser.id === ctx.user.id ? 'your' : `${targetUser.tag}'s`} nickname or roles.`);
            }

            return ctx.reply({ embeds: [embed] });
        } catch (err) {
            console.error('Error in update command:', err);
            return ctx.reply({
                embeds: [
                    createBaseEmbed('danger')
                        .setTitle('Update Error')
                        .setDescription('An error occurred while updating: ' + (err.message || 'Unknown error'))
                ],
                ephemeral: true
            });
        }
    }
}

export default UpdateCommand;