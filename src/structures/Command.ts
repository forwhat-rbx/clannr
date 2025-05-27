import {
    ApplicationCommandOptionData, ApplicationCommandOptionType, ApplicationCommandType,
    ApplicationCommandSubCommandData, ApplicationCommandSubGroupData,
    ApplicationCommandChoicesData
} from 'discord.js';
import {
    CommandConfig,
    CommandPermission,
    CommandArgument,
    CommandType,
} from './types';
import { CommandContext } from './addons/CommandAddons';

const commandTypeMappings = {
    ChatInput: ApplicationCommandType.ChatInput,
    Message: ApplicationCommandType.Message,
    User: ApplicationCommandType.User
}

const argumentTypeMappings = {
    Subcommand: ApplicationCommandOptionType.Subcommand,
    SubcommandGroup: ApplicationCommandOptionType.SubcommandGroup,
    String: ApplicationCommandOptionType.String,
    Number: ApplicationCommandOptionType.Integer,
    RobloxUser: ApplicationCommandOptionType.String,
    RobloxRole: ApplicationCommandOptionType.String,
    DiscordUser: ApplicationCommandOptionType.User,
    DiscordRole: ApplicationCommandOptionType.Role,
    DiscordChannel: ApplicationCommandOptionType.Channel,
    DiscordMentionable: ApplicationCommandOptionType.Mentionable,
}

const mapArgument = (arg: CommandArgument): ApplicationCommandOptionData => {
    // Base properties every option has
    const base = {
        name: arg.trigger,
        description: arg.description || 'No description provided.',
        type: argumentTypeMappings[arg.type],
        required: arg.required !== null && arg.required !== undefined ? arg.required : true,
    };

    // Handle subcommands and subcommand groups which can have nested options
    if (arg.type === 'Subcommand' || arg.type === 'SubcommandGroup') {
        return {
            ...base,
            options: arg.args ? arg.args.map(mapArgument) : []
        } as ApplicationCommandSubCommandData | ApplicationCommandSubGroupData;
    }

    // Handle string options
    if (arg.type === 'String' || arg.type === 'RobloxUser' || arg.type === 'RobloxRole') {
        // We need to handle autocomplete and choices differently based on their values
        if (arg.autocomplete === true) {
            // If autocomplete is true, choices must be undefined
            return {
                ...base,
                autocomplete: true
            };
        } else if (arg.choices && arg.choices.length > 0) {
            // If we have choices, autocomplete must be false
            return {
                ...base,
                choices: arg.choices,
                autocomplete: false
            };
        } else {
            // Otherwise, just set autocomplete to false
            return {
                ...base,
                autocomplete: false
            };
        }
    }

    // Handle number options
    if (arg.type === 'Number') {
        // Same logic as string options
        if (arg.autocomplete === true) {
            return {
                ...base,
                autocomplete: true
            };
        } else if (arg.choices && arg.choices.length > 0) {
            return {
                ...base,
                choices: arg.choices,
                autocomplete: false
            };
        } else {
            return {
                ...base,
                autocomplete: false
            };
        }
    }

    // Handle channel options which can have channelTypes
    if (arg.type === 'DiscordChannel') {
        return {
            ...base,
            channelTypes: arg.channelTypes
        };
    }

    // Default for other option types
    return base;
}

abstract class Command {
    trigger: string;
    type?: CommandType;
    description?: string;
    module?: string;
    aliases?: string[];
    permissions?: CommandPermission[];
    args?: CommandArgument[];
    enabled: boolean;

    constructor(options: CommandConfig) {
        this.trigger = options.trigger;
        this.type = options.type || 'ChatInput';
        this.description = options.description || '*No description provided.*';
        this.module = options.module || 'other';
        this.aliases = options.aliases || [];
        this.permissions = options.permissions || [];
        this.args = options.args || [];
        this.enabled = options.enabled ?? true;
    }

    /**
     * Generate a command object for slash commands.
     */
    generateAPICommand() {
        if (this.type?.startsWith('Subcommand')) {
            return {
                name: this.trigger,
                description: this.description,
                type: commandTypeMappings[this.type],
                options: this.args ? this.args.map(mapArgument) : [],
            }
        } else {
            return {
                name: this.trigger,
                description: this.description,
                type: commandTypeMappings[this.type || 'ChatInput'],
                options: this.args ? this.args.map(mapArgument) : [],
                defaultPermission: true,
            }
        }
    }

    /**
     * The function to run the command.
     * @param ctx The context of the command.
     */
    abstract run(ctx: CommandContext): Promise<any> | any;
}

export { Command };