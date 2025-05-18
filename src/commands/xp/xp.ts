import { discordClient, robloxClient, robloxGroup } from '../../main';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { getInvalidXPEmbed } from '../../handlers/locale';
import { logAction, logSystemAction } from '../../handlers/handleLogging';
import { getLinkedRobloxUser } from '../../handlers/accountLinks';
import { provider } from '../../database';
import { findEligibleRole } from '../../handlers/handleXpRankup';
import { User, PartialUser, GroupMember } from 'bloxy/dist/structures';
import { config } from '../../config';
import { createBaseEmbed } from '../../utils/embedUtils';

export default class ManageXPCommand extends Command {
    constructor() {
        super({
            trigger: 'xp',
            description: 'Add or remove XP for user(s)',
            type: 'ChatInput',
            module: 'xp',
            args: [
                {
                    trigger: 'action',
                    description: 'add or remove',
                    required: true,
                    type: 'String',
                    choices: [
                        { name: 'Add', value: 'add' },
                        { name: 'Remove', value: 'remove' }
                    ]
                },
                {
                    trigger: 'amount',
                    description: 'How much XP',
                    required: true,
                    type: 'Number'
                },
                {
                    trigger: 'users',
                    description: 'Roblox usernames or Discord @mentions',
                    required: true,
                    type: 'String'
                },
                {
                    trigger: 'event-type',
                    description: 'Type of event',
                    required: false,
                    type: 'String',
                    choices: [
                        { name: 'Raid', value: 'raids' },
                        { name: 'Defense', value: 'defenses' },
                        { name: 'Scrim', value: 'scrims' },
                        { name: 'Training', value: 'trainings' }
                    ]
                },
                {
                    trigger: 'reason',
                    description: 'Reason for the change',
                    isLegacyFlag: true,
                    required: false,
                    type: 'String'
                }
            ],
            permissions: [
                {
                    type: 'role',
                    ids: config.permissions.join,
                    value: true
                }
            ]
        });
    }

    async run(ctx: CommandContext) {
        try {
            // 1) Extract & validate inputs
            const action = ctx.args['action'] as 'add' | 'remove';
            const amount = Number(ctx.args['amount']);
            const rawUsers = ctx.args['users'] as string | undefined;
            const eventType = ctx.args['event-type'] as string | undefined;
            const reason = ctx.args['reason'] as string | undefined;

            if (!rawUsers) {
                const embed = createBaseEmbed()
                    .setTitle('Missing Users')
                    .setDescription('You must specify at least one username or mention.')
                    .setColor('#FA5757');

                return ctx.reply({ embeds: [embed], ephemeral: true });
            }

            if (!Number.isInteger(amount) || amount < 0) {
                return ctx.reply({ embeds: [getInvalidXPEmbed()], ephemeral: true });
            }

            // Improved splitting - handle both spaces and commas 
            const usersArg = rawUsers.trim().split(/[\s,]+/).filter(Boolean);
            await ctx.defer();

            const successes: string[] = [];
            const failures: string[] = [];

            for (const iden of usersArg) {
                try {
                    // 2) Resolve to Roblox user
                    let robloxUser: User | PartialUser;
                    if (iden.startsWith('<@') && iden.endsWith('>')) {
                        const discordId = iden.replace(/[<@!>]/g, '');
                        const linked = await getLinkedRobloxUser(discordId);
                        if (!linked) throw new Error('Discord user not linked to Roblox');
                        robloxUser = linked;
                    } else if (!isNaN(Number(iden))) {
                        robloxUser = await robloxClient.getUser(Number(iden));
                    } else {
                        const found = await robloxClient.getUsersByUsernames([iden]);
                        if (!found.length) throw new Error('Username not found');
                        robloxUser = found[0];
                    }

                    // Ensure Roblox ID is consistently a string
                    const robloxIdString = robloxUser.id.toString();

                    // 3) Check group membership
                    const member = await robloxGroup.getMember(robloxUser.id);
                    if (!member) throw new Error('User not in group');

                    // 4) Fetch XP record with consistent ID format
                    const userData = await provider.findUser(robloxIdString);
                    if (!userData) throw new Error('No XP record found');

                    // Ensure old XP is always a number
                    const oldXP = userData.xp ? Number(userData.xp) : 0;
                    const newXP =
                        action === 'add'
                            ? oldXP + amount
                            : Math.max(0, oldXP - amount);

                    // Debug log to trace XP changes
                    console.log(`[XP DEBUG] User ${robloxUser.name} (${robloxIdString}): ${oldXP} → ${newXP} (${action === 'add' ? '+' : '-'}${amount})`);

                    // 5) Update database with atomic operation
                    const update: any = { xp: newXP, lastActivity: new Date() };
                    if (action === 'add' && eventType) {
                        update[eventType] = (userData[eventType] || 0) + 1;
                        update[
                            `last${eventType.charAt(0).toUpperCase() + eventType.slice(1)}`
                        ] = new Date();
                    }

                    await provider.updateUser(robloxIdString, update);

                    // 6) Log XP change to history
                    await provider.logXpChange(
                        robloxIdString,
                        action === 'add' ? amount : -amount,
                        reason ||
                        (action === 'add'
                            ? `Added from ${eventType || 'manual'}`
                            : 'Manual removal'),
                        ctx.user.id
                    );

                    // 7) Attempt rank-up if adding XP
                    let rankNote: string | null = null;
                    if (action === 'add') {
                        const roles = await robloxGroup.getRoles();
                        const eligible = await findEligibleRole(member, roles, newXP);
                        if (eligible) {
                            await robloxGroup.updateMember(robloxUser.id, eligible.id);
                            rankNote = `${member.role.name} → ${eligible.name}`;
                        }
                    }

                    // 8) Send logAction
                    const logName = action === 'add' ? 'Add XP' : 'Remove XP';
                    if (action === 'add' && rankNote) {
                        logAction('XP Rankup', ctx.user, reason, robloxUser, rankNote);
                    } else {
                        logAction(
                            logName,
                            ctx.user,
                            reason,
                            robloxUser,
                            null,
                            null,
                            null,
                            `${oldXP} → ${newXP} (${action === 'add' ? '+' : '-'}${amount})`
                        );
                    }

                    // 9) Verify the update succeeded by refetching the data
                    const verifyUpdate = await provider.findUser(robloxIdString);
                    if (verifyUpdate && verifyUpdate.xp === newXP) {
                        successes.push(`**${robloxUser.name}**: ${oldXP} → ${newXP}`);
                    } else {
                        throw new Error('XP update verification failed');
                    }
                } catch (err: any) {
                    console.error(`XP command error with user "${iden}":`, err);
                    failures.push(`**${iden}**: ${err.message}`);
                }
            }

            // 10) Build and send summary using createBaseEmbed
            const resultEmbed = createBaseEmbed()
                .setTitle(`XP ${action === 'add' ? 'Added' : 'Removed'}`)
                .setColor(successes.length > 0 ? '#6699ff' : '#FA5757');

            const description = [];
            if (successes.length) {
                description.push('**Success:**', ...successes);
            }
            if (failures.length) {
                if (description.length > 0) description.push('\n');
                description.push('**Failed:**', ...failures);
            }

            resultEmbed.setDescription(description.join('\n'));

            return ctx.reply({
                embeds: [resultEmbed],
                ephemeral: successes.length === 0
            });
        } catch (err: any) {
            console.error('Unhandled error in /xp:', err);
            logSystemAction(
                'XP Command Error',
                'XP Command',
                undefined,
                undefined,
                err.message,
                true
            );

            const errorEmbed = createBaseEmbed()
                .setTitle('Error')
                .setDescription('An unexpected error occurred while processing your XP request.')
                .setColor('#FA5757');

            return ctx.reply({
                embeds: [errorEmbed],
                ephemeral: true
            });
        }
    }
}