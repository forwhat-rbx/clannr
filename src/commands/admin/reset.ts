import { discordClient, robloxClient, robloxGroup } from '../../main';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { User, PartialUser } from 'bloxy/dist/structures';
import { getLinkedRobloxUser } from '../../handlers/accountLinks';
import { config } from '../../config';
import { provider } from '../../database';
import { logAction } from '../../handlers/handleLogging';
import {
    getInvalidRobloxUserEmbed,
    getUnexpectedErrorEmbed
} from '../../handlers/locale';
import { createBaseEmbed } from '../../utils/embedUtils';

class ResetStatsCommand extends Command {
    constructor() {
        super({
            trigger: 'resetstats',
            description: 'Resets a user\'s XP and event counts to 0',
            type: 'ChatInput',
            module: 'admin',
            args: [
                {
                    trigger: 'roblox-user',
                    description: 'Who do you want to reset stats for?',
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
        let robloxUser: User | PartialUser;

        try {
            if (!isNaN(Number(ctx.args['roblox-user']))) {
                robloxUser = await robloxClient.getUser(Number(ctx.args['roblox-user']));
            } else {
                const robloxUsers = await robloxClient.getUsersByUsernames([ctx.args['roblox-user'] as string]);
                if (robloxUsers.length === 0) throw new Error();
                robloxUser = robloxUsers[0];
            }

            if (!robloxUser) throw new Error();
        } catch (err) {
            return ctx.reply({ embeds: [getInvalidRobloxUserEmbed()] });
        }

        try {
            await provider.updateUser(robloxUser.id.toString(), {
                xp: 0,
                raids: 0,
                defenses: 0,
                scrims: 0,
                trainings: 0
            });

            const embed = createBaseEmbed('primary')
                .setTitle('Stats Reset')
                .setDescription(`Successfully reset all stats for **${robloxUser.name}**`)
                .addFields(
                    { name: 'Experience', value: '```0 XP```', inline: false },
                    {
                        name: 'Combat Events',
                        value: '```Raids: 0\nDefenses: 0```',
                        inline: true
                    },
                    {
                        name: 'Training Events',
                        value: '```Scrims: 0\nTrainings: 0```',
                        inline: true
                    }
                )
                .setTimestamp()

            logAction('Reset Stats', ctx.user, null, robloxUser, 'All stats reset to 0');

            return ctx.reply({ embeds: [embed] });
        } catch (err) {
            console.error(err);
            return ctx.reply({ embeds: [getUnexpectedErrorEmbed()] });
        }
    }
}

export default ResetStatsCommand;