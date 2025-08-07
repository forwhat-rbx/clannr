import { discordClient } from '../main';
import { CommandContext } from '../structures/addons/CommandAddons';
import {
    Interaction,
    CommandInteraction,
    AutocompleteInteraction,
    CacheType,
} from 'discord.js';
import { handleRobloxUser } from '../arguments/handleRobloxUser';
import { handleRobloxRole } from '../arguments/handleRobloxRole';
import { getUnknownCommandMessage, getNoPermissionEmbed } from '../handlers/locale';
import { Logger } from '../utils/logger';

const handleInteraction = async (payload: Interaction<CacheType>) => {
    // Log only the interaction type for minimal output

    if (payload instanceof CommandInteraction) {
        const interaction = payload as CommandInteraction;

        // Minimal logging: only log command name and user for context
        Logger.info(`Executing command: ${interaction.commandName} by ${interaction.user.tag}`, 'Command');

        if (!interaction.channel || !interaction.guild) {
            Logger.warn('Missing channel or guild context in interaction.', 'Command');
            return interaction.reply({ embeds: [getUnknownCommandMessage()] });
        }

        // Find the command class in our loaded commands
        const CommandClass = discordClient.commands.find(cmd => cmd.trigger === interaction.commandName);
        if (!CommandClass) {
            Logger.warn(`Unrecognized command: ${interaction.commandName}`, 'Command');
            return interaction.reply({ embeds: [getUnknownCommandMessage()] });
        }

        // Create the context with the command instance
        const context = new CommandContext(interaction, CommandClass);

        // Log permission checks only if permission is denied
        const permission = context.checkPermissions();
        if (!permission) {
            Logger.warn(`Permission denied for ${interaction.user.tag} on command: ${interaction.commandName}`, 'Command');
            return context.reply({ embeds: [getNoPermissionEmbed()] });
        }

        // Define commands that will show modals
        const modalCommands = ['dmrole', 'comparegroups', 'binds', 'schedule'];

        // Only defer if it's not a modal command
        if (!modalCommands.includes(interaction.commandName)) {
            await context.defer();
        }

        try {
            // Need to await command execution when it's a modal command
            if (modalCommands.includes(interaction.commandName)) {
                await CommandClass.run(context);
            } else {
                CommandClass.run(context);
            }

        } catch (err) {
            Logger.error(`Error executing command ${interaction.commandName}:`, 'Command', err);
        }

    } else if (payload instanceof AutocompleteInteraction) {
        const interaction = payload as AutocompleteInteraction;
        Logger.debug(`Autocomplete interaction for command: ${interaction.commandName}`, 'Autocomplete');

        if (!interaction.channel || !interaction.guild) {
            Logger.warn('Missing channel or guild context in autocomplete interaction.', 'Autocomplete');
            return;
        }

        const focusedOption = payload.options.getFocused(true);
        const CommandClass = discordClient.commands.find(cmd => cmd.trigger === interaction.commandName);
        if (!CommandClass) {
            Logger.warn(`Unrecognized command for autocomplete: ${interaction.commandName}`, 'Autocomplete');
            return;
        }

        const focusedArg = CommandClass.args.find(arg => arg.trigger === focusedOption.name);
        if (focusedArg?.type === 'RobloxUser') {
            handleRobloxUser(interaction, focusedOption);
        } else if (focusedArg?.type === 'RobloxRole') {
            handleRobloxRole(interaction, focusedOption);
        }
    }
}

export { handleInteraction };