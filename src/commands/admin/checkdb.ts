import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { config } from '../../config';
import { provider } from '../../database';
import { robloxClient, robloxGroup } from '../../main';
import { processInChunks, ProcessingOptions } from '../../utils/processingUtils';

// Define user data interface to avoid type errors
interface UserData {
    robloxId: string;
    xp: number;
}

class CheckDBCommand extends Command {
    constructor() {
        super({
            trigger: 'checkdb',
            description: 'Shows users in database who are no longer in the Roblox group',
            type: 'ChatInput',
            module: 'admin',
            args: [],
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
        try {
            // First, defer the reply to prevent timeout
            await ctx.defer();

            const allUsers = await provider.getAllUsers();
            if (!allUsers || allUsers.length === 0) {
                return ctx.reply({ content: 'No users found in the database.' });
            }

            const nonGroupMembers: string[] = [];
            const userIds: string[] = [];
            let totalXP = 0;

            // Define processing options
            const options: ProcessingOptions = {
                totalItems: allUsers.length,
                chunkSize: 3, // Process 3 users at a time
                initialMessage: "Checking database for users no longer in group...",
                progressInterval: 10, // Update progress every 10%
                completionMessage: "Finished checking all users."
            };

            // Process users in chunks with proper rate limiting
            await processInChunks<any>(
                ctx,
                allUsers,
                async (userData, index) => {
                    try {
                        // Add delay to avoid rate limits
                        await new Promise(r => setTimeout(r, 250 * (index % 3)));

                        const robloxID = Number(userData.robloxId);
                        if (isNaN(robloxID)) {
                            console.error(`Invalid Roblox ID: ${userData.robloxId}`);
                            return;
                        }

                        const robloxUser = await robloxClient.getUser(robloxID);
                        let isInGroup = true;

                        try {
                            const robloxMember = await robloxGroup.getMember(robloxUser.id);
                            if (!robloxMember) {
                                isInGroup = false;
                            }
                        } catch {
                            isInGroup = false;
                        }

                        if (!isInGroup) {
                            // Use atomic update to avoid race conditions
                            totalXP += userData.xp || 0;
                            nonGroupMembers.push(
                                `**${robloxUser.name}** (\`${robloxUser.id}\`) - **${userData.xp || 0}** XP`
                            );
                            userIds.push(robloxUser.id.toString());
                        }
                    } catch (err) {
                        console.error(`Failed to fetch user ${userData.robloxId}:`, err);
                        totalXP += userData.xp || 0;
                        nonGroupMembers.push(
                            `**Unknown User** (\`${userData.robloxId}\`) - **${userData.xp || 0}** XP`
                        );
                        userIds.push(userData.robloxId);
                    }
                },
                options
            );

            if (nonGroupMembers.length === 0) {
                return ctx.reply({ content: 'All users in the database are still in the group.' });
            }

            const response = [
                'Users No Longer in Group:',
                ...nonGroupMembers,
                '',
                `Total Users: ${nonGroupMembers.length}`,
                `Total Lost XP: ${totalXP}`,
                '',
                'User IDs for removal:',
                userIds.join(', ')
            ].join('\n');

            // If response is too long for Discord, split it or use attachment
            if (response.length > 2000) {
                const mainResponse = [
                    'Users No Longer in Group:',
                    `Total Users: ${nonGroupMembers.length}`,
                    `Total Lost XP: ${totalXP}`,
                    '',
                    'User list is too long to display. Check console for full list.'
                ].join('\n');

                console.log('Full list of users no longer in group:');
                console.log(response);

                return ctx.reply({ content: mainResponse });
            } else {
                return ctx.reply({ content: response });
            }

        } catch (err) {
            console.error('CheckDB command error:', err);
            return ctx.reply({ content: 'An error occurred while checking the database.' });
        }
    }
}

export default CheckDBCommand;