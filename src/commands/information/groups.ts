import { discordClient, robloxClient } from '../../main';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { PartialUser, User } from 'bloxy/dist/structures';
import { getLinkedRobloxUser } from '../../handlers/accountLinks';
import { getInvalidRobloxUserEmbed, getUnexpectedErrorEmbed } from '../../handlers/locale';
import { ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { createBaseEmbed } from '../../utils/embedUtils';

class GroupsCommand extends Command {
    constructor() {
        super({
            trigger: 'groups',
            description: 'Displays the groups a Roblox user is in',
            type: 'ChatInput',
            module: 'information',
            args: [
                {
                    trigger: 'roblox-user',
                    description: 'The Roblox username to view groups for.',
                    required: false,
                    type: 'String',
                },
            ]
        });
    }

    async run(ctx: CommandContext) {
        let robloxUser: User | PartialUser;
        try {
            if (ctx.args['roblox-user']) {
                robloxUser = await robloxClient.getUser(ctx.args['roblox-user'] as number);
            } else {
                robloxUser = await getLinkedRobloxUser(ctx.user.id);
            }
            if (!robloxUser) throw new Error();
        } catch (err) {
            try {
                const robloxUsers = await robloxClient.getUsersByUsernames([ctx.args['roblox-user'] as string]);
                if (robloxUsers.length === 0) throw new Error();
                robloxUser = robloxUsers[0];
            } catch (err) {
                try {
                    const idQuery = ctx.args['roblox-user'].replace(/[^0-9]/gm, '');
                    const discordUser = await discordClient.users.fetch(idQuery);
                    const linkedUser = await getLinkedRobloxUser(discordUser.id);
                    if (!linkedUser) throw new Error();
                    robloxUser = linkedUser;
                } catch (err) {
                    return ctx.reply({ embeds: [getInvalidRobloxUserEmbed()] });
                }
            }
        }

        try {
            const groups = await robloxUser.getGroups();
            const groupArray = groups.data || [];
            const groupsPerPage = 5;
            const totalPages = Math.ceil(groupArray.length / groupsPerPage) || 1;

            const generateGroupEmbed = (page: number) => {
                const start = (page - 1) * groupsPerPage;
                const end = start + groupsPerPage;
                const groupList = groupArray
                    .slice(start, end)
                    .map(groupData =>
                        `[${groupData.group.name}](https://www.roblox.com/groups/${groupData.group.id})\n↳ ${groupData.role.name}`
                    )
                    .join('\n');

                return createBaseEmbed()
                    .setTitle(`Groups for ${robloxUser.name} (Page ${page}/${totalPages})`)
                    .setDescription(groupList || 'No groups found')
                    .addFields({
                        name: 'Total Groups',
                        value: groupArray.length.toString(),
                        inline: true
                    });
            };

            let currentPage = 1;
            const groupEmbed = generateGroupEmbed(currentPage);

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId('previous')
                    .setLabel('◀️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage === 1),
                new ButtonBuilder()
                    .setCustomId('next')
                    .setLabel('▶️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage === totalPages)
            );

            const message = await ctx.reply({ embeds: [groupEmbed], components: [row] });

            const filter = (interaction) => interaction.user.id === ctx.user.id;
            const collector = message.createMessageComponentCollector({ filter, time: 60000 });

            collector.on('collect', async (interaction) => {
                if (interaction.customId === 'previous') {
                    currentPage = Math.max(currentPage - 1, 1);
                    const newEmbed = generateGroupEmbed(currentPage);
                    row.components[0].setDisabled(currentPage === 1);
                    row.components[1].setDisabled(currentPage === totalPages);
                    await interaction.update({ embeds: [newEmbed], components: [row] });
                } else if (interaction.customId === 'next') {
                    currentPage = Math.min(currentPage + 1, totalPages);
                    const newEmbed = generateGroupEmbed(currentPage);
                    row.components[0].setDisabled(currentPage === 1);
                    row.components[1].setDisabled(currentPage === totalPages);
                    await interaction.update({ embeds: [newEmbed], components: [row] });
                }
            });

            collector.on('end', async () => {
                await message.edit({ components: [] });
            });

        } catch (error) {
            console.error(error);
            await ctx.reply({ embeds: [getUnexpectedErrorEmbed()] });
        }
    }
}

export default GroupsCommand;