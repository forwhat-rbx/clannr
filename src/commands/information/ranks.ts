import { CommandContext } from '../../structures/addons/CommandAddons';
import Command from '../../structures/Command';
import { createBaseEmbed } from '../../utils/embedUtils';
import { config } from '../../config';
import { robloxGroup } from '../../main';

class RolesCommand extends Command {
    constructor() {
        super({
            trigger: 'ranks',
            description: 'Show all group ranks with IDs and XP requirements.',
            type: 'ChatInput',
            module: 'information',
            enabled: true
        });
    }

    async run(ctx: CommandContext) {
        if (!this.enabled) {
            return ctx.reply({
                content: 'This command is currently disabled.',
                ephemeral: true
            });
        }

        try {
            // Fetch all group roles
            const groupRoles = await robloxGroup.getRoles();

            // Sort them by rank (highest to lowest for display)
            const sortedGroupRoles = groupRoles.sort((a, b) => b.rank - a.rank);

            // Build a map of rank->xp from the config
            const xpLookup = new Map(
                config.xpSystem.roles.map(cfgRole => [cfgRole.rank, cfgRole.xp])
            );

            // Use the createBaseEmbed utility
            const embed = createBaseEmbed('primary')
                .setTitle('Group Ranks')
                .setDescription('Below are all ranks in the group. XP requirements are shown for promotable ranks.')
                .setFooter({ text: 'Use /getxp to check your current XP' });

            // Separate ranks into categories
            const staffRanks = sortedGroupRoles.filter(role => role.rank >= 100);
            const memberRanks = sortedGroupRoles.filter(role => role.rank < 100 && role.rank > 1)
                .sort((a, b) => b.rank - a.rank); // Display highest first
            const guestRank = sortedGroupRoles.find(role => role.rank === 1);

            // Format ranks
            if (staffRanks.length > 0) {
                let staffList = '';
                staffRanks.forEach(role => {
                    staffList += `**${role.name}** (ID: ${role.rank})\n`;
                });
                if (staffList) embed.addFields({ name: 'Staff Ranks', value: staffList });
            }

            if (memberRanks.length > 0) {
                let memberList = '';
                memberRanks.forEach(role => {
                    const requiredXp = xpLookup.get(role.rank);
                    if (requiredXp) {
                        memberList += `**${role.name}** (ID: ${role.rank}) - **${requiredXp}** XP required\n`;
                    } else {
                        memberList += `**${role.name}** (ID: ${role.rank})\n`;
                    }
                });
                if (memberList) embed.addFields({ name: 'Member Ranks', value: memberList });
            }

            if (guestRank) {
                embed.addFields({ name: 'Guest Rank', value: `**${guestRank.name}** (ID: ${guestRank.rank})` });
            }

            return ctx.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error fetching ranks:', error);
            return ctx.reply({
                content: 'An error occurred while fetching ranks. Please try again later.',
                ephemeral: true
            });
        }
    }
}

export default RolesCommand;