import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { getNicknameFormat, setNicknameFormat } from '../../handlers/nicknameHandler';
import { config } from '../../config';
import { createBaseEmbed } from '../../utils/embedUtils';

class NicknameFormatCommand extends Command {
    constructor() {
        super({
            trigger: 'nicknameformat',
            description: 'Configure the format for user nicknames',
            type: 'ChatInput',
            module: 'verification',
            args: [
                {
                    trigger: 'format',
                    description: 'The format to use for nicknames (use {robloxUsername}, {robloxDisplayName}, {rankName})',
                    type: 'String',
                    required: false
                }
            ],
            permissions: [
                {
                    type: 'role',
                    ids: config.permissions.admin,
                    value: true,
                }
            ],
            enabled: true
        });
    }

    async run(ctx: CommandContext) {
        try {
            // Get current format if no new format provided
            const format = ctx.args['format'] as string;
            if (!format) {
                const currentFormat = await getNicknameFormat(ctx.guild.id);

                return ctx.reply({
                    embeds: [
                        createBaseEmbed()
                            .setTitle('Nickname Format')
                            .setDescription(`Current nickname format: \`${currentFormat}\`\n\n` +
                                'Available placeholders:\n' +
                                '• `{robloxUsername}` - Roblox username\n' +
                                '• `{robloxDisplayName}` - Roblox display name\n' +
                                '• `{rankName}` - Group rank name')
                    ]
                });
            }

            // Set new format
            await setNicknameFormat(ctx.guild.id, format);

            return ctx.reply({
                embeds: [
                    createBaseEmbed()
                        .setTitle('Nickname Format Updated')
                        .setDescription(`Updated nickname format to: \`${format}\`\n\n` +
                            'Users\' nicknames will be updated when they use the `/update` command ' +
                            'or when they verify for the first time.')
                ]
            });
        } catch (err) {
            console.error('Error in nicknameformat command:', err);
            return ctx.reply({
                embeds: [
                    createBaseEmbed('danger')
                        .setTitle('Command Error')
                        .setDescription('An unexpected error occurred: ' + (err.message || 'Unknown error'))
                ],
                ephemeral: true
            });
        }
    }
}

export default NicknameFormatCommand;