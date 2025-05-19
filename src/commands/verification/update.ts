import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { createBaseEmbed } from '../../utils/embedUtils';
import { getLinkedRobloxUser } from '../../handlers/accountLinks';
import { updateUserRoles } from '../../handlers/roleBindHandler';
import { updateNickname } from '../../handlers/nicknameHandler';
import { robloxClient, robloxGroup } from '../../main';
import { config } from '../../config';

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

            // Update nickname, with verbose logging
            console.log(`Updating nickname for ${targetMember.user.tag}`);
            const nicknameUpdated = await updateNickname(targetMember, robloxUser);
            console.log(`Nickname update result: ${nicknameUpdated ? "Success" : "No change/Failed"}`);

            // Update roles, with verbose logging
            console.log(`Updating roles for ${targetMember.user.tag}`);
            const roleResult = await updateUserRoles(ctx.guild, targetMember, robloxUser.id);
            console.log(`Role update result: ${roleResult.success ? "Success" : "Failed"}, Added: ${roleResult.added || 0}, Removed: ${roleResult.removed || 0}`);

            // Send a response based on what was updated
            if (nicknameUpdated || (roleResult.success && (roleResult.added > 0 || roleResult.removed > 0))) {
                // Something was updated
                return ctx.reply({
                    embeds: [
                        createBaseEmbed()
                            .setTitle('Update Successful')
                            .setDescription(
                                `Updated ${targetUser.id === ctx.user.id ? 'your' : `${targetUser.tag}'s`} ` +
                                `${nicknameUpdated ? 'nickname' : ''}` +
                                `${nicknameUpdated && (roleResult.added > 0 || roleResult.removed > 0) ? ' and ' : ''}` +
                                `${(roleResult.added > 0 || roleResult.removed > 0) ? 'roles' : ''}`
                            )
                            .setColor('#00ff00')
                    ]
                });
            } else {
                // Nothing needed updating
                return ctx.reply({
                    embeds: [
                        createBaseEmbed()
                            .setTitle('Update Completed')
                            .setDescription(`No changes were needed for ${targetUser.id === ctx.user.id ? 'your' : `${targetUser.tag}'s`} nickname or roles.`)
                    ]
                });
            }
        } catch (err) {
            console.error('Error in update command:', err);
            return ctx.reply({
                content: 'An error occurred while updating. Please try again later.',
                ephemeral: true
            });
        }
    }
}

export default UpdateCommand;