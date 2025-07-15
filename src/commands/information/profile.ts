import { CommandContext } from '../../structures/addons/CommandAddons';
import Command from '../../structures/Command';
import { robloxClient, robloxGroup } from '../../main';
import { provider } from '../../database';
import { createBaseEmbed } from '../../utils/embedUtils';
import { getLinkedRobloxUser } from '../../handlers/accountLinks';



class ProfileCommand extends Command {
    constructor() {
        super({
            trigger: 'profile',
            description: 'Displays detailed profile of a user',
            type: 'ChatInput',
            module: 'information',
            args: [
                {
                    trigger: 'roblox-user',
                    description: 'Roblox username/ID or @mention',
                    type: 'String',
                    required: false
                }
            ]
        });
    }

    async run(ctx: CommandContext) {
        let robloxUser;
        const robloxUserIdentifier = ctx.args['roblox-user'] as string;

        try {
            if (!robloxUserIdentifier) {
                robloxUser = await getLinkedRobloxUser(ctx.user.id);
                if (!robloxUser) throw new Error();
            } else if (robloxUserIdentifier.startsWith('<@')) {
                const discordId = robloxUserIdentifier.replace(/[<@!>]/g, '');
                const linkedUser = await getLinkedRobloxUser(discordId);
                if (!linkedUser) throw new Error();
                robloxUser = linkedUser;
            } else if (!isNaN(Number(robloxUserIdentifier))) {
                robloxUser = await robloxClient.getUser(Number(robloxUserIdentifier));
            } else {
                const robloxUsers = await robloxClient.getUsersByUsernames([robloxUserIdentifier]);
                if (!robloxUsers.length) throw new Error();
                robloxUser = robloxUsers[0];
            }
        } catch {
            return ctx.reply({ content: 'Could not find Roblox user. Try using their username or ID.', ephemeral: true });
        }

        const userData = await provider.findUser(robloxUser.id.toString());
        if (!userData) {
            return ctx.reply({ content: 'No data found for this user.', ephemeral: true });
        }

        // Get user's thumbnail
        const avatarUrl = await robloxClient.apis.thumbnailsAPI
            .getUsersAvatarHeadShotImages({
                userIds: [robloxUser.id],
                size: '420x420',
                format: 'png'
            })
            .then(res => res.data[0]?.imageUrl)
            .catch(() => 'https://www.roblox.com/headshot-thumbnail/image?userId=' + robloxUser.id);

        // Get group rank if in group
        let rankInfo = 'Not in group';
        try {
            const member = await robloxGroup.getMember(robloxUser.id);
            if (member) {
                rankInfo = member.role.name;
            }
        } catch { }

        // Calculate activity stats
        const totalEvents = (userData.raids || 0) + (userData.scrims || 0) +
            (userData.defenses || 0) + (userData.trainings || 0);

        const embed = createBaseEmbed('primary')
            .setAuthor({
                name: robloxUser.name,
                url: `https://www.roblox.com/users/${robloxUser.id}/profile`,
                iconURL: avatarUrl
            })
            .setThumbnail(avatarUrl)
            .addFields([
                {
                    name: 'Rank',
                    value: rankInfo,
                    inline: true
                },
                {
                    name: 'Experience',
                    value: `${userData.xp} XP`,
                    inline: true
                },
                {
                    name: 'Total Events',
                    value: totalEvents.toString(),
                    inline: true
                },
                {
                    name: 'Activity Breakdown',
                    value: [
                        `**Raids:** ${userData.raids || 0}`,
                        `**Defenses:** ${userData.defenses || 0}`,
                        `**Scrims:** ${userData.scrims || 0}`,
                        `**Trainings:** ${userData.trainings || 0}`
                    ].join('\n'),
                    inline: false
                }
            ])

        return ctx.reply({ embeds: [embed] });
    }
}

export default ProfileCommand;