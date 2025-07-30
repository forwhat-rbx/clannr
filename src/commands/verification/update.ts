import { CommandContext } from '../../structures/addons/CommandAddons';
import Command from '../../structures/Command';
import { createBaseEmbed } from '../../utils/embedUtils';
import { debugVerificationStatus, getLinkedRobloxUser, isUserVerified } from '../../handlers/accountLinks';
import { updateUserRoles } from '../../handlers/roleBindHandler';
import { updateNickname } from '../../handlers/nicknameHandler';
import { discordClient, robloxClient, robloxGroup } from '../../main';
import { config } from '../../config';
import { GuildMember, User } from 'discord.js';
import { Logger } from '../../utils/logger';

/**
 * Helper function to safely stringify objects that might contain BigInt values
 */
const safeStringify = (obj: any): string => {
    return JSON.stringify(obj, (_, value) =>
        typeof value === 'bigint' ? value.toString() : value
    );
};

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

            // Add debug logging
            Logger.debug(
                `Update target info - ID: ${targetUser.id}, Tag: ${targetUser.tag || 'Unknown'}, Username: ${targetUser.username || 'Unknown'}`,
                'UpdateCommand'
            );

            // Step 2: Check if target is verified
            const isVerified = await isUserVerified(targetUser.id);
            Logger.debug(`Verification check result for ${targetUser.id}: ${isVerified}`, 'UpdateCommand');

            // Get the linked Roblox user
            const robloxUser = await getLinkedRobloxUser(targetUser.id);

            // If not verified, run detailed diagnostics and show error
            if (!robloxUser) {
                Logger.warn(`User ${targetUser.id} failed verification check or getLinkedRobloxUser returned null`, 'UpdateCommand');

                // Run debug verification for additional info
                const debugInfo = await debugVerificationStatus(targetUser.id);
                // Use safeStringify instead of JSON.stringify to handle BigInt values
                Logger.debug(`Debug verification info for ${targetUser.id}: ${safeStringify(debugInfo)}`, 'UpdateCommand');

                const username = targetUser.username || targetUser.tag || 'User';
                return ctx.reply({
                    content: isSelf
                        ? "You're not verified. Please use `/verify` first."
                        : `${username} is not verified.`,
                    ephemeral: true
                });
            }

            // Rest of the code remains unchanged
            Logger.info(
                `Updating ${isSelf ? 'self' : (targetUser.tag || targetUser.username || 'user')} (Discord ID: ${targetUser.id}) - ` +
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
            Logger.error(`Error in update command: ${err.message}`, 'UpdateCommand', err as Error);
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

    // Rest of the class unchanged
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

            try {
                // Handle different possible formats of the user argument
                let userId: string;

                // If it's already a User object
                if (typeof ctx.args['user'] === 'object' && ctx.args['user'] !== null) {
                    if ('id' in ctx.args['user']) {
                        userId = ctx.args['user'].id;

                        // If it's already a complete User object, use it
                        if ('tag' in ctx.args['user'] && 'username' in ctx.args['user']) {
                            targetUser = ctx.args['user'] as User;
                        } else {
                            // Otherwise fetch the complete user
                            targetUser = await discordClient.users.fetch(userId);
                        }
                    } else {
                        return {
                            success: false,
                            message: 'Invalid user provided. Please mention a user or provide their ID.'
                        };
                    }
                } else if (typeof ctx.args['user'] === 'string') {
                    // If it's a string (ID or mention)
                    userId = ctx.args['user'].replace(/[<@!>]/g, '');
                    targetUser = await discordClient.users.fetch(userId);
                } else {
                    return {
                        success: false,
                        message: 'Invalid user provided. Please mention a user or provide their ID.'
                    };
                }

                Logger.debug(`Resolved user target: ${userId}`, 'UpdateCommand');

                // Fetch the member object
                targetMember = await ctx.guild.members.fetch(userId);

                if (!targetMember) {
                    return {
                        success: false,
                        message: 'Could not find that user in this server.'
                    };
                }
            } catch (err) {
                Logger.error(`Failed to resolve target user: ${err.message}`, 'UpdateCommand', err as Error);
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

        // Get a safe display name for the user
        const userDisplay = isSelf ? 'Your' :
            `${targetUser.tag || targetUser.username || 'User'}'s`;

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
                `${userDisplay} data has been updated:\n\n` +
                `${changes.join('\n')}`
            );
        } else {
            embed.setDescription(
                `No changes were needed for ${userDisplay.toLowerCase()} ` +
                `nickname or roles.`
            );
        }

        return embed;
    }
}

export default UpdateCommand;