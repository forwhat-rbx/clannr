import { CommandContext } from '../../structures/addons/CommandAddons';
import Command from '../../structures/Command';
import { config } from '../../config';
import { provider } from '../../database';
import {
    getInvalidRobloxUserEmbed,
    getUnexpectedErrorEmbed
} from '../../handlers/locale';
import { discordClient, robloxClient } from '../../main';
import { getLinkedRobloxUser } from '../../handlers/accountLinks';
import { User, PartialUser } from 'bloxy/dist/structures';
import { Logger } from '../../utils/logger';

class RemoveUserCommand extends Command {
    constructor() {
        super({
            trigger: 'removeuser',
            description: 'Removes one or more users from the database.',
            type: 'ChatInput',
            module: 'admin',
            args: [
                {
                    trigger: 'roblox-user',
                    description: 'Which user(s) do you want to remove from the database?',
                    type: 'String',
                    required: true
                }
            ],
            permissions: [
                {
                    type: 'role',
                    ids: config.permissions.admin,
                    value: true
                }
            ]
        });
    }

    async run(ctx: CommandContext) {
        await ctx.defer();

        // Split the comma-separated input
        const rawInput = ctx.args['roblox-user'] as string;
        const userList = rawInput.split(',').map((u) => u.trim()).filter(Boolean);

        const results: string[] = [];

        for (const userString of userList) {
            let robloxUser: User | PartialUser | null = null;
            // Try numeric ID
            try {
                robloxUser = await robloxClient.getUser(Number(userString));
            } catch {
                // Try username
                try {
                    const users = await robloxClient.getUsersByUsernames([userString]);
                    if (!users.length) throw new Error();
                    robloxUser = users[0];
                } catch {
                    // Try Discord link
                    try {
                        const idQuery = userString.replace(/[^0-9]/gm, '');
                        const discordUser = await discordClient.users.fetch(idQuery);
                        const linkedUser = await getLinkedRobloxUser(discordUser.id);
                        if (!linkedUser) throw new Error();
                        robloxUser = linkedUser;
                    } catch {
                        results.push(`Failed to find: ${userString}`);
                        continue;
                    }
                }
            }

            if (!robloxUser) {
                results.push(`Failed to remove: ${userString}`);
                continue;
            }

            // Remove the user from the DB - use safeDeleteUser instead
            try {
                await provider.safeDeleteUser(robloxUser.id.toString());
                results.push(`Removed user ID ${robloxUser.id}`);
            } catch (err) {
                Logger.error(`Error removing user ${robloxUser.id}:`, 'RemoveUser', err);
                results.push(`Error removing user ID ${robloxUser.id}: Foreign key constraint`);
            }
        }

        return ctx.reply({ content: results.join('\n') });
    }
}

export default RemoveUserCommand;