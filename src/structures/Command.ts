import {
    ApplicationCommandOptionData, ApplicationCommandOptionType, ApplicationCommandType,
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

const mapArgument = (arg: CommandArgument) => {
    // Base properties that all option types can have
    const baseOptionProps = {
        name: arg.trigger,
        description: arg.description || 'No description provided.',
        type: argumentTypeMappings[arg.type],
        autocomplete: arg.autocomplete || false,
        required: arg.required !== null && arg.required !== undefined ? arg.required : true,
        choices: arg.choices || [],
    };

    // Only add options for Subcommand and SubcommandGroup types
    if (arg.type === 'Subcommand' || arg.type === 'SubcommandGroup') {
        return {
            ...baseOptionProps,
            options: arg.args ? arg.args.map(mapArgument) : [],
        } as ApplicationCommandOptionData;
    }

    // For channel type, add channelTypes if provided
    if (arg.type === 'DiscordChannel' && arg.channelTypes) {
        return {
            ...baseOptionProps,
            channelTypes: arg.channelTypes,
        } as ApplicationCommandOptionData;
    }

    // For all other types, return base properties only
    return baseOptionProps as ApplicationCommandOptionData;
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
        if (this.type.startsWith('Subcommand')) {
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
                type: commandTypeMappings[this.type],
                options: this.args ? this.args.map(mapArgument) : [],
                defaultPermission: true,
            }
        }
    }

    /**
     * The function to run the command.
     * @param ctx The context of the command.
     * @param args The arguments passed to the command, as an object mapped by ID.
     */
    abstract run(ctx: CommandContext): void;
}

export { Command };