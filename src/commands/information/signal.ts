import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { getSuccessfulSignalEmbed } from '../../handlers/locale';
import { addSignal } from '../../api';
import { config } from '../../config';

class SignalCommand extends Command {
    constructor() {
        super({
            trigger: 'signal',
            description: 'N/A',
            type: 'ChatInput',
            module: 'information',
            args: [
                {
                    trigger: 'signal',
                    description: 'What signal/command would you like to run?',
                    required: false,
                    type: 'String',
                },
            ],
            permissions: [
                {
                    type: 'role',
                    ids: config.permissions.signal,
                    value: true,
                }
            ],
            enabled: false
        });
    }

    async run(ctx: CommandContext) {
        if (!this.enabled) {
            return ctx.reply({
                content: 'This command is currently disabled.',
                ephemeral: true
            });
        }

        addSignal(ctx.args['signal']);
        return ctx.reply({ embeds: [getSuccessfulSignalEmbed()] });
    }
}

export default SignalCommand;