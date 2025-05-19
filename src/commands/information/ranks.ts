import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { createBaseEmbed } from '../../utils/embedUtils';
import { config } from '../../config';
import { robloxGroup } from '../../main';

class RolesCommand extends Command {
    constructor() {
        super({
            trigger: 'ranks',
            description: 'Show ranks with XP requirements.',
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

        // Fetch group roles to get the rank names
        const groupRoles = await robloxGroup.getRoles();
        // Filter out only ranks 2 to 8
        const filteredGroupRoles = groupRoles.filter(r => r.rank >= 2 && r.rank <= 8);

        // Sort them by rank
        const sortedGroupRoles = filteredGroupRoles.sort((a, b) => a.rank - b.rank);

        // Build a map of rank->xp from the config
        const xpLookup = new Map(
            config.xpSystem.roles.map(cfgRole => [cfgRole.rank, cfgRole.xp])
        );

        // Combine them into a readable list
        const roleList = sortedGroupRoles
            .map(role => {
                const requiredXp = xpLookup.get(role.rank) || 0;
                return `**${role.name}** (**${requiredXp}** XP)`;
            })
            .join('\n');

        const embed = createBaseEmbed('primary')
            .setTitle('Ranks')
            .setDescription(roleList || 'No configured ranks found between 2 and 8.');

        return ctx.reply({ embeds: [embed] });
    }
}

export default RolesCommand;