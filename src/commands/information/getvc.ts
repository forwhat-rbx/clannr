import { CommandContext } from '../../structures/addons/CommandAddons';
import Command from '../../structures/Command';
import { createBaseEmbed } from '../../utils/embedUtils';
import { Logger } from '../../utils/logger';

class GetVCCommand extends Command {
    constructor() {
        super({
            trigger: 'getvc',
            description: 'Lists all users in your current voice channel for easy copying.',
            type: 'ChatInput',
            module: 'information'
        });
    }

    async run(ctx: CommandContext) {
        try {
            // Make sure this is running in a guild
            if (!ctx.guild) {
                return ctx.reply({
                    content: 'This command can only be used inside a server.',
                    ephemeral: true
                });
            }

            // Refetch all guild members right now
            await ctx.guild.members.fetch();

            // Grab the command user's guild member
            const member = ctx.guild.members.cache.get(ctx.user.id);
            if (!member) {
                return ctx.reply({
                    content: 'Unable to fetch your member data.',
                    ephemeral: true
                });
            }

            // Must be in a voice channel
            if (!member.voice.channel) {
                return ctx.reply({
                    content: 'You must be in a voice channel to use this command!',
                    ephemeral: true
                });
            }

            const voiceChannel = member.voice.channel;

            // Log current channel data for debugging
            Logger.info(`GetVC command used in channel: ${voiceChannel.name} | Members: ${voiceChannel.members.size}`, "GetVCCommand");

            // Convert members collection to array, remove bracketed prefixes, and sort
            const voiceMembers = [...voiceChannel.members.values()]
                .map(m => {
                    // Extract clean name without rank prefix
                    const rawName = m.displayName || m.user.username;
                    const cleanName = rawName.replace(/\[.*?\]\s*/g, '').trim();
                    return cleanName;
                })
                .sort();

            // Build comma-separated list with spaces after commas
            const memberList = voiceMembers.join(', ');

            // Prepare embed with proper code block
            const embed = createBaseEmbed('primary')
                .setTitle(`Users in ${voiceChannel.name}`)
                .setDescription(`\`\`\`\n${memberList}\n\`\`\``)
                .setFooter({ text: `${voiceMembers.length} users in voice channel` });

            await ctx.reply({ embeds: [embed] });
        } catch (error) {
            Logger.error('Error in getvc command:', "GetVCCommand", error as Error);
            await ctx.reply({
                content: 'An error occurred while fetching voice channel members.',
                ephemeral: true
            });
        }
    }
}

export default GetVCCommand;