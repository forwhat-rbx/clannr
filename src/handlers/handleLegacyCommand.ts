import { Message } from 'discord.js';
import { discordClient } from '../main';
import { config } from '../config';
import { CommandContext } from '../structures/addons/CommandAddons';
import { Lexer, Parser, Args, prefixedStrategy } from 'lexure';
import { getNoPermissionEmbed } from '../handlers/locale';
import { Logger } from '../utils/logger';

const parseCommand = (s: string): [string, Args] | null => {
    const lexer = new Lexer(s).setQuotes([['"', '"'], ['“', '”']]);
    const lout = lexer.lexCommand(s => config.legacyCommands.prefixes.some((prefix) => s.startsWith(prefix)) ? 1 : null);
    if (!lout) return null;

    const [command, getTokens] = lout;
    const tokens = getTokens();
    const parser = new Parser(tokens).setUnorderedStrategy(prefixedStrategy(
        ['--', '-', '—'],
        ['=', ':'],
    ));

    const pout = parser.parse();
    return [command.value, new Args(pout)];
}

const handleLegacyCommand = async (message: Message) => {
    if (!config.legacyCommands.enabled) return;
    if (!message.channel || !message.guild) return;

    const out = parseCommand(message.content);
    if (!out) return;

    const commandQuery = out[0] || null;
    const args = out[1] || null;

    const commandName = commandQuery.replace(/[^a-zA-Z0-9]/, '').replace('-', '');
    const commandInstance = discordClient.commands.find(cmd =>
        cmd.trigger === commandName || cmd.aliases?.includes(commandName)
    );

    if (!commandInstance) {
        Logger.debug(`Unrecognized command: ${commandName}`, 'LegacyCommand');
        return;
    }

    try {
        const context = new CommandContext(message, commandInstance, args);
        if (!context.checkPermissions()) {
            context.reply({ embeds: [getNoPermissionEmbed()] });
        } else {
            await context.defer();
            try {
                commandInstance.run(context);
            } catch (err) {
                Logger.error(`Error executing legacy command ${commandName}:`, 'LegacyCommand', err);
            }
        }
    } catch (err) {
        Logger.error(`Error creating context for legacy command ${commandName}:`, 'LegacyCommand', err);
        return;
    }
}

export { handleLegacyCommand };