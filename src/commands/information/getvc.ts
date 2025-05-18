import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { createBaseEmbed } from '../../utils/embedUtils';

class GetVCCommand extends Command {
    constructor() {
        super({
            trigger: 'getvc',
            description: 'Lists all users in your current voice channel.',
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
            console.log(`Channel: ${voiceChannel.name} | Members: ${voiceChannel.members.size}`);

            // Convert members collection to array, remove bracketed prefixes, and sort
            const voiceMembers = [...voiceChannel.members.values()]
                .map(m => m.displayName.replace(/\[.*?\]\s*/g, '').trim())
                .sort();

            console.log('Processed voice members:', voiceMembers);

            // Build comma-separated list
            const memberList = voiceMembers.join(',');

            // Prepare embed
            const embed = createBaseEmbed()
                .setTitle(`Users in ${voiceChannel.name}`)
                .setDescription(`\`${memberList}\``);

            await ctx.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in getvc command:', error);
            await ctx.reply({
                content: 'An error occurred while fetching voice channel members.',
                ephemeral: true
            });
        }
    }
}

export default GetVCCommand;