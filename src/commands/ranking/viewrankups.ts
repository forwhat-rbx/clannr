import { CommandContext } from '../../structures/addons/CommandAddons';
import Command from '../../structures/Command';
import { createBaseEmbed } from '../../utils/embedUtils';
import { config } from '../../config';
import { robloxClient, robloxGroup } from '../../main';
import { provider } from '../../database';
import { getNoPermissionEmbed } from '../../handlers/locale';
import { GroupMember, User } from 'bloxy/dist/structures';
import { processInChunks, ProcessingOptions } from '../../utils/processingUtils';

// Define user data interface to avoid type errors
interface UserData {
    robloxId: string;
    xp: number;
    // add other properties as needed
}

async function findHighestEligibleRole(member: GroupMember, groupRoles: any[], userXp: number) {
    const sortedRoles = config.xpSystem.roles.slice().sort((a, b) => a.xp - b.xp);
    let highestRole = null;

    for (const xpRole of sortedRoles) {
        if (xpRole.rank > member.role.rank && userXp >= xpRole.xp) {
            highestRole = xpRole;
        }
    }

    // Return the actual group role object for the highest rank (if any)
    return highestRole ? groupRoles.find(r => r.rank === highestRole.rank) : null;
}

function getRankName(rank: number, groupRoles: any[]): string {
    const role = groupRoles.find(r => r.rank === rank);
    return role ? role.name : 'Unknown Rank';
}

class XPCheckRankupsCommand extends Command {
    constructor() {
        super({
            trigger: 'checkrankups',
            description: 'Lists all users pending promotion.',
            type: 'ChatInput',
            module: 'xp',
            args: [],
            permissions: [
                {
                    type: 'role',
                    ids: config.permissions.ranking,
                    value: true,
                }
            ]
        });
    }

    async run(ctx: CommandContext) {
        if (!ctx.member.roles.cache.some(r => config.permissions.ranking?.includes(r.id))) {
            return ctx.reply({ embeds: [getNoPermissionEmbed()] });
        }

        const groupRoles = await robloxGroup.getRoles();
        const allUsers = await provider.getAllUsers();

        await ctx.defer(); // Changed from deferReply to defer

        const canRankUpList: string[] = [];

        // Define processing options object for proper typing
        const options: ProcessingOptions = {
            totalItems: allUsers.length,
            chunkSize: 5,
            initialMessage: "Checking for users eligible for promotion...",
            progressInterval: 10,
            completionMessage: "Done checking all users."
        };

        // Process in batches of 5 with delays between each user
        await processInChunks<any>(
            ctx,
            allUsers as UserData[], // Cast to UserData array
            async (userData, index) => {
                try {
                    await new Promise(r => setTimeout(r, 350 * (index % 5))); // Delay each API call

                    const robloxUser: User = await robloxClient.getUser(Number(userData.robloxId));
                    const robloxMember = await robloxGroup.getMember(robloxUser.id);
                    if (!robloxMember) return null;

                    // Rest of your logic
                    const nextRole = await findHighestEligibleRole(robloxMember, groupRoles, userData.xp);
                    if (nextRole) {
                        return `[${robloxUser.name}](https://www.roblox.com/users/${robloxUser.id}/profile) : ` +
                            `${robloxMember.role.name} → ${getRankName(nextRole.rank, groupRoles)}`;
                    }
                    return null;
                } catch (err) {
                    console.error(`Error processing user ${userData.robloxId}:`, err);
                    return null;
                }
            },
            options
        ).then(results => {
            // Filter out nulls
            canRankUpList.push(...results.filter(Boolean));
        });

        const embed = createBaseEmbed('primary')
            .setTitle('Pending Promotions')
            .setDescription(
                canRankUpList.length
                    ? canRankUpList.join('\n')
                    : 'No users are currently eligible for a promotion.'
            );

        return ctx.reply({ embeds: [embed] });
    }
}

export default XPCheckRankupsCommand;