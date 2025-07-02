import { CommandContext } from '../../structures/addons/CommandAddons';
import Command from '../../structures/Command';
import { createBaseEmbed } from '../../utils/embedUtils';
import { getLinkedRobloxUser } from '../../handlers/accountLinks';
import { updateUserRoles } from '../../handlers/roleBindHandler';
import { updateNickname } from '../../handlers/nicknameHandler';
import { robloxClient, robloxGroup } from '../../main';
import { config } from '../../config';
import { GuildMember, User } from 'discord.js';
import { Logger } from '../../utils/logger';

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
            await ctx.defer({ ephemeral: false });

            // Step 1: Determine target user (self or other user)
            const targetData = await this.resolveTargetUser(ctx);
            if (!targetData.success) {
                return ctx.reply({
                    content: targetData.message,
                    ephemeral: true
                });
            }

            const { targetMember, targetUser } = targetData;
            const isSelf = targetUser.id === ctx.user.id;

            // Step 2: Check if target is verified
            const robloxUser = await getLinkedRobloxUser(targetUser.id);
            if (!robloxUser) {
                return ctx.reply({
                    content: isSelf
                        ? "You're not verified. Please use `/verify` first."
                        : `${targetUser.tag} is not verified.`,
                    ephemeral: true
                });
            }

            Logger.info(
                `Updating ${isSelf ? 'self' : targetUser.tag} (Discord ID: ${targetUser.id}) - ` +
                `Linked to Roblox user ${robloxUser.name} (ID: ${robloxUser.id})`,
                'UpdateCommand'
            );

            // Step 3: Update nickname
            const oldNickname = targetMember.nickname || targetMember.user.username;
            const nicknameResult = await updateNickname(targetMember, robloxUser);
            const newNickname = targetMember.nickname || targetMember.user.username;

            // Step 4: Update roles
            const roleResult = await updateUserRoles(ctx.guild, targetMember, robloxUser.id);

            // Step 5: Build response with detailed changes
            const embed = this.buildResponseEmbed({
                targetUser,
                isSelf,
                nicknameResult: {
                    success: nicknameResult,
                    oldNickname,
                    newNickname
                },
                roleResult
            });

            return ctx.reply({ embeds: [embed] });

        } catch (err) {
            Logger.error(`Error in update command: ${err.message}`, 'UpdateCommand', err);
            return ctx.reply({
                embeds: [
                    createBaseEmbed('danger')
                        .setTitle('Update Error')
                        .setDescription(`An error occurred: ${err.message || 'Unknown error'}`)
                ],
                ephemeral: true
            });
        }
    }

    /**
     * Resolves the target user for the update command
     */
    private async resolveTargetUser(ctx: CommandContext): Promise<{
        success: boolean;
        message?: string;
        targetUser?: User;
        targetMember?: GuildMember;
    }> {
        // Default to self
        let targetUser = ctx.user;
        let targetMember = ctx.member;

        // Check if updating another user
        if (ctx.args['user']) {
            // This will be a User object from Discord.js
            const specifiedUser = ctx.args['user'] as User;

            // Admin permission check for updating others
            const isAdmin = ctx.member.roles.cache.some(
                role => config.permissions.admin.includes(role.id)
            );

            if (!isAdmin) {
                return {
                    success: false,
                    message: 'You need admin permissions to update other users.'
                };
            }

            // Set the target user
            targetUser = specifiedUser;

            // Fetch the member object
            try {
                targetMember = await ctx.guild.members.fetch(targetUser.id);

                if (!targetMember) {
                    return {
                        success: false,
                        message: 'Could not find that user in this server.'
                    };
                }
            } catch (err) {
                Logger.error(`Failed to fetch member ${targetUser.tag} (${targetUser.id}): ${err.message}`, 'UpdateCommand');
                return {
                    success: false,
                    message: 'Could not find that user in this server.'
                };
            }
        }

        return {
            success: true,
            targetUser,
            targetMember
        };
    }

    /**
     * Builds the response embed with detailed changes
     */
    private buildResponseEmbed(params: {
        targetUser: User;
        isSelf: boolean;
        nicknameResult: {
            success: boolean;
            oldNickname: string;
            newNickname: string;
        };
        roleResult: {
            success: boolean;
            addedRoleIds?: string[];
            removedRoleIds?: string[];
        };
    }): ReturnType<typeof createBaseEmbed> {
        const { targetUser, isSelf, nicknameResult, roleResult } = params;
        const embed = createBaseEmbed('primary').setTitle('Update Results');
        const changes = [];

        // Track nickname changes
        const nicknameChanged = nicknameResult.success &&
            nicknameResult.oldNickname !== nicknameResult.newNickname;

        if (nicknameChanged) {
            changes.push(
                `**Nickname:** \`${nicknameResult.oldNickname}\` → ` +
                `\`${nicknameResult.newNickname}\``
            );
        }

        // Track role changes
        if (roleResult.addedRoleIds?.length > 0) {
            changes.push(
                `**Added Roles:** ${roleResult.addedRoleIds.map(id => `<@&${id}>`).join(' ')}`
            );
        }

        if (roleResult.removedRoleIds?.length > 0) {
            changes.push(
                `**Removed Roles:** ${roleResult.removedRoleIds.map(id => `<@&${id}>`).join(' ')}`
            );
        }

        // Set embed description based on changes
        if (changes.length > 0) {
            embed.setDescription(
                `${isSelf ? 'Your' : `${targetUser.tag}'s`} data has been updated:\n\n` +
                `${changes.join('\n')}`
            );
        } else {
            embed.setDescription(
                `No changes were needed for ${isSelf ? 'your' : `${targetUser.tag}'s`} ` +
                `nickname or roles.`
            );
        }

        return embed;
    }
}

export default UpdateCommand;