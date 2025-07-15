import { CommandContext } from '../../structures/addons/CommandAddons';
import Command from '../../structures/Command';
import { robloxClient } from '../../main';
import { provider } from '../../database';
import { createBaseEmbed } from '../../utils/embedUtils';

class LeaderboardCommand extends Command {
    constructor() {
        super({
            trigger: 'leaderboard',
            description: 'Shows the top 10 users with the most XP',
            type: 'ChatInput',
            module: 'information',
            args: []
        });
    }

    async run(ctx: CommandContext) {
        const allUsers = await provider.getAllUsers();
        allUsers.sort((a, b) => b.xp - a.xp);

        const topUsers = allUsers.slice(0, 10);

        const lines = [];
        for (let i = 0; i < topUsers.length; i++) {
            const userData = topUsers[i];
            let robloxName = userData.robloxId;
            let robloxUserId = userData.robloxId;

            try {
                const fetchedUser = await robloxClient.getUser(Number(userData.robloxId));
                robloxName = fetchedUser.name;
                robloxUserId = fetchedUser.id.toString();
            } catch {
                // fallback to userData if fetching fails
            }

            lines.push(
                `**#${i + 1}** [${robloxName}](https://www.roblox.com/users/${robloxUserId}/profile)` +
                ` (**${userData.xp}**)`
            );
        }

        const embed = createBaseEmbed('primary')
            .setTitle('XP Leaderboard')
            .setDescription(lines.join('\n'));

        return ctx.reply({ embeds: [embed] });
    }
}

export default LeaderboardCommand;