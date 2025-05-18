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

const handleInteraction = async (payload: Interaction<CacheType>) => {
    // Log only the interaction type for minimal output
    console.log('Interaction received:', payload.type);

    if (payload instanceof CommandInteraction) {
        const interaction = payload as CommandInteraction;

        // Minimal logging: only log command name and user for context
        console.log(`Executing command: ${interaction.commandName} by ${interaction.user.tag}`);

        if (!interaction.channel || !interaction.guild) {
            console.warn('Missing channel or guild context in interaction.');
            return interaction.reply({ embeds: [getUnknownCommandMessage()] });
        }

        const command = discordClient.commands.find((cmd) => (new cmd()).trigger === interaction.commandName);
        if (!command) {
            console.warn('Unrecognized command:', interaction.commandName);
            return;
        }

        // Find this section in the file (around line 27-45)
        const context = new CommandContext(interaction, command);

        // Log permission checks only if permission is denied
        const permission = context.checkPermissions();
        if (!permission) {
            console.warn(`Permission denied for ${interaction.user.tag} on command: ${interaction.commandName}`);
            return context.reply({ embeds: [getNoPermissionEmbed()] });
        }

        // Define commands that will show modals
        const modalCommands = ['dmrole', 'comparegroups', 'binds']; // Added 'binds' here

        // Only defer if it's not a modal command
        if (!modalCommands.includes(interaction.commandName)) {
            await context.defer();
        }

        try {
            // Need to await command execution when it's a modal command
            if (modalCommands.includes(interaction.commandName)) {
                await (new command()).run(context);
            } else {
                (new command()).run(context);
            }

        } catch (err) {
            console.error(`Error executing command ${interaction.commandName}:`, err);
        }

    } else if (payload instanceof AutocompleteInteraction) {
        const interaction = payload as AutocompleteInteraction;
        console.log(`Autocomplete interaction for command: ${interaction.commandName}`);

        if (!interaction.channel || !interaction.guild) {
            console.warn('Missing channel or guild context in autocomplete interaction.');
            return;
        }

        const focusedOption = payload.options.getFocused(true);
        const command = discordClient.commands.find((cmd) => (new cmd()).trigger === interaction.commandName);
        if (!command) {
            console.warn('Unrecognized command for autocomplete:', interaction.commandName);
            return;
        }

        const focusedArg = (new command()).args.find((arg) => arg.trigger === focusedOption.name);
        if (focusedArg.type === 'RobloxUser') {
            handleRobloxUser(interaction, focusedOption);
        }
        if (focusedArg.type === 'RobloxRole') {
            await handleRobloxRole(interaction, focusedOption);
        }
    }
};

export { handleInteraction };
