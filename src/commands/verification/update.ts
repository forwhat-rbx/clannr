import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { getLinkedRobloxUser } from '../../handlers/accountLinks';
import { robloxGroup } from '../../main';
import { updateUserRoles } from '../../handlers/roleBindHandler';
import { updateNickname } from '../../handlers/nicknameHandler';
import { createBaseEmbed } from '../../utils/embedUtils';
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
            // Target user (self or specified by admin)
            const targetUser = ctx.args['user']
                ? await ctx.guild.members.fetch(ctx.args['user'])
                : ctx.member;

            // Check if admin for updating other users
            const isAdmin = ctx.member.permissions.has('Administrator') ||
                ctx.member.roles.cache.some(role =>
                    (config.permissions.admin || []).includes(role.id));

            // If trying to update someone else without admin perms
            if (targetUser.id !== ctx.user.id && !isAdmin) {
                return ctx.reply({
                    embeds: [
                        createBaseEmbed()
                            .setTitle('Permission Denied')
                            .setDescription('You do not have permission to update other users.')
                            .setColor(0xff0000)
                    ],
                    ephemeral: true
                });
            }

            // Get linked Roblox user
            const robloxUser = await getLinkedRobloxUser(targetUser.id);
            if (!robloxUser) {
                return ctx.reply({
                    embeds: [
                        createBaseEmbed()
                            .setTitle('Not Verified')
                            .setDescription(`${targetUser.id === ctx.user.id ? 'You are' : 'This user is'} not verified. Please use \`/verify\` first.`)
                            .setColor(0xff0000)
                    ],
                    ephemeral: true
                });
            }

            // Update roles
            await updateUserRoles(ctx.guild, targetUser, robloxUser.id);

            // Update nickname
            await updateNickname(targetUser, robloxUser);

            return ctx.reply({
                embeds: [
                    createBaseEmbed()
                        .setTitle('Update Successful')
                        .setDescription(`Updated ${targetUser.id === ctx.user.id ? 'your' : targetUser.user.username + "'s"} roles and nickname based on Roblox profile.`)
                ],
                ephemeral: true
            });
        } catch (err) {
            console.error("Error in update command:", err);
            return ctx.reply({
                embeds: [
                    createBaseEmbed()
                        .setTitle('Update Error')
                        .setDescription('An error occurred while trying to update. Please try again later.')
                        .setColor(0xff0000)
                ],
                ephemeral: true
            });
        }
    }
}

export default UpdateCommand;