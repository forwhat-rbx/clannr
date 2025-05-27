import { discordClient, robloxClient, robloxGroup } from '../../main';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { PartialUser, User, GroupMember } from 'bloxy/dist/structures';
import { getLinkedRobloxUser } from '../../handlers/accountLinks';
import { config } from '../../config';
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { provider } from '../../database';
import { Logger } from '../../utils/logger';
import { findHighestEligibleRole } from '../ranking/xprankup';
import { XPCardBuilder, XPStats } from '../../utils/xpCardBuilder';

// Calculate the next XP requirement for promotion
function getNextXpRequirement(member: GroupMember, userXp: number): number | null {
    const xpRoles = config.xpSystem.roles
        .slice()
        .sort((a, b) => a.xp - b.xp);

    // Special handling for rank 2 (first rank)
    if (member.role.rank === 2) {
        return xpRoles[0].xp;
    }

    const currentIndex = xpRoles.findIndex(r => r.rank === member.role.rank);
    Logger.debug('Current index: ' + currentIndex, 'XPCard');

    if (currentIndex === -1) {
        Logger.debug('Rank not found', 'XPCard');
        return null;
    }

    if (currentIndex === xpRoles.length - 1) {
        Logger.debug('At max rank', 'XPCard');
        return null;
    }

    const nextXp = xpRoles[currentIndex + 1].xp;
    Logger.debug('Next XP requirement: ' + nextXp, 'XPCard');
    return nextXp;
}

export default class XPCommand extends Command {
    constructor() {
        super({
            trigger: 'getxp',
            description: 'Displays XP and attendance information',
            type: 'ChatInput',
            module: 'xp',
            args: [
                {
                    trigger: 'roblox-user',
                    description: 'Who do you want to check XP for?',
                    required: false,
                    type: 'String',
                }
            ]
        });
    }

    async run(ctx: CommandContext) {
        let robloxUser: User | PartialUser;

        try {
            if (ctx.args['roblox-user']) {
                // Try to parse as number first for Roblox ID
                const robloxIdArg = Number(ctx.args['roblox-user']);
                if (!isNaN(robloxIdArg)) {
                    robloxUser = await robloxClient.getUser(robloxIdArg);
                } else {
                    // Fallback to username search
                    const robloxUsers = await robloxClient.getUsersByUsernames([ctx.args['roblox-user'] as string]);
                    if (robloxUsers.length > 0) {
                        robloxUser = robloxUsers[0];
                    }
                }
                if (!robloxUser) throw new Error('User not found by ID or username.');
            } else {
                robloxUser = await getLinkedRobloxUser(ctx.user.id);
            }
            if (!robloxUser) throw new Error('No Roblox user could be determined.');
        } catch (userError) {
            // If initial attempts fail, try to resolve as Discord mention if it's a string
            if (typeof ctx.args['roblox-user'] === 'string') {
                try {
                    const idQuery = (ctx.args['roblox-user'] as string).replace(/[^0-9]/gm, '');
                    if (idQuery) {
                        const discordUser = await discordClient.users.fetch(idQuery).catch(() => null);
                        if (discordUser) {
                            const linkedUser = await getLinkedRobloxUser(discordUser.id);
                            if (linkedUser) robloxUser = linkedUser;
                        }
                    }
                } catch (discordError) {
                    // Silently fail if Discord user resolution fails, rely on previous error
                }
            }
            if (!robloxUser) {
                return ctx.reply({
                    content: 'The specified Roblox user could not be found or is not linked.',
                    ephemeral: true,
                });
            }
        }

        const userData = await provider.findUser(robloxUser.id.toString());
        Logger.debug(`[XP CARD] User: ${robloxUser.name} (${robloxUser.id}) | XP: ${userData?.xp || 0}`, 'XPCard');

        if (!userData) {
            // Create a new user record if none exists
            Logger.debug(`Creating new user record for ${robloxUser.name} (${robloxUser.id})`, 'XPCard');
            try {
                await provider.updateUser(robloxUser.id.toString(), { xp: 0 });
                return ctx.reply({
                    content: 'User data created. This user has 0 XP. Please try the command again.',
                    ephemeral: true,
                });
            } catch (createErr) {
                Logger.error('Error creating user record', 'XPCard', createErr);
                return ctx.reply({
                    content: 'Failed to create user record. Please try again later.',
                    ephemeral: true,
                });
            }
        }

        userData.xp = Number(userData.xp || 0);

        let robloxMember: GroupMember;
        try {
            robloxMember = await robloxGroup.getMember(robloxUser.id);
            if (!robloxMember) throw new Error('User is not a group member.');
        } catch {
            return ctx.reply({
                content: 'The user is not a member of the group, or an error occurred fetching group membership.',
                ephemeral: true,
            });
        }

        const nextXp = getNextXpRequirement(robloxMember, userData.xp);

        const avatarUrl = await robloxClient.apis.thumbnailsAPI
            .getUsersAvatarHeadShotImages({
                userIds: [robloxUser.id],
                size: '150x150',
                format: 'png',
            })
            .then((res) => res.data[0]?.imageUrl || 'https://www.roblox.com/images/default-headshot.png')
            .catch(() => 'https://www.roblox.com/images/default-headshot.png');

        try {
            // Create the XP card
            const stats: XPStats = {
                raids: userData.raids ?? 0,
                defenses: userData.defenses ?? 0,
                scrims: userData.scrims ?? 0,
                trainings: userData.trainings ?? 0
            };

            const cardBuilder = new XPCardBuilder();
            try {
                await cardBuilder.initialize('https://i.ibb.co/Z68bgDS/NEW-SOH-BACK.png');
            } catch (bgError) {
                Logger.warn('Failed to load background image, using default background', 'XPCard');
                await cardBuilder.initialize();
            }
            await cardBuilder.addCardBackground();
            await cardBuilder.addAvatar(avatarUrl);
            await cardBuilder.addUserInfo(robloxUser.name, robloxMember.role.name);
            await cardBuilder.addProgressBar(userData.xp, nextXp);
            await cardBuilder.addStatistics(stats);
            try {
                await cardBuilder.initialize('https://i.ibb.co/zhtwc0np/NEW-SOH-FRONT.png');
            } catch (bgError) {
                Logger.warn('Failed to load background image, using default background', 'XPCard');
                await cardBuilder.initialize();
            }

            const imageBuffer = await cardBuilder.build();

            // Create Discord attachment
            const imageAttachment = new AttachmentBuilder(imageBuffer, { name: 'xp-progress.png' });

            // Check for promotion eligibility
            let isEligibleForPromotion = false;
            try {
                const groupRoles = await robloxGroup.getRoles();
                const highestEligibleRole = await findHighestEligibleRole(robloxMember, groupRoles, userData.xp);
                if (highestEligibleRole && highestEligibleRole.rank > robloxMember.role.rank) {
                    isEligibleForPromotion = true;
                }
            } catch (eligibilityError) {
                Logger.error(`Error checking promotion eligibility for ${robloxUser.name}`, 'XPCard', eligibilityError);
            }

            // Create promotion button
            const requestPromotionButton = new ButtonBuilder()
                .setCustomId(`request_promotion:${robloxUser.id}:${ctx.user.id}`)
                .setLabel('Request Promotion Check')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(!isEligibleForPromotion);

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(requestPromotionButton);

            // Send response
            return ctx.reply({
                files: [imageAttachment],
                components: [row]
            });

        } catch (imageError) {
            Logger.error('Failed to generate XP card', 'XPCard', imageError);
            return ctx.reply({
                content: 'There was an error generating the XP image. Please try again later.',
                ephemeral: true,
            });
        }
    }
}