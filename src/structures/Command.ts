import {
    ApplicationCommandOptionData, ApplicationCommandOptionType, ApplicationCommandType,
    ApplicationCommandSubCommandData, ApplicationCommandSubGroupData,
    ApplicationCommandChannelOptionData,
    ApplicationCommandStringOptionData,
    ApplicationCommandNumericOptionData,
    ApplicationCommandBooleanOptionData,
    ApplicationCommandUserOptionData,
    ApplicationCommandRoleOptionData,
    ApplicationCommandMentionableOptionData,
    ApplicationCommandAttachmentOption
} from 'discord.js';
import {
    CommandConfig,
    CommandPermission,
    CommandArgument,
    CommandType,
} from './types';
import { CommandContext } from './addons/CommandAddons';
import { Logger } from '../utils/logger';

// We'll handle valid command argument types through the mapping object
// This avoids type comparison issues
const argumentTypeMappings = {
    Subcommand: ApplicationCommandOptionType.Subcommand,
    SubcommandGroup: ApplicationCommandOptionType.SubcommandGroup,
    String: ApplicationCommandOptionType.String,
    Number: ApplicationCommandOptionType.Integer,
    Boolean: ApplicationCommandOptionType.Boolean,
    RobloxUser: ApplicationCommandOptionType.String,
    RobloxRole: ApplicationCommandOptionType.String,
    DiscordUser: ApplicationCommandOptionType.User,
    DiscordRole: ApplicationCommandOptionType.Role,
    DiscordChannel: ApplicationCommandOptionType.Channel,
    DiscordMentionable: ApplicationCommandOptionType.Mentionable,
    Attachment: ApplicationCommandOptionType.Attachment,
};

// Create a type that includes all valid argument types including Attachment
type ArgumentType = keyof typeof argumentTypeMappings;

// Discord API expects numeric values for command types
const commandTypeMappings = {
    ChatInput: ApplicationCommandType.ChatInput,
    Message: ApplicationCommandType.Message,
    User: ApplicationCommandType.User
};

/**
 * Maps a CommandArgument to the Discord API format
 * Handles all types of arguments and ensures proper formatting
 */
const mapArgument = (arg: CommandArgument): ApplicationCommandOptionData => {
    if (!arg.trigger) {
        Logger.error(`Command argument missing trigger: ${JSON.stringify(arg)}`, 'CommandMapper');
        throw new Error('Command argument missing trigger');
    }

    // Check if the type is valid by looking it up in our mapping
    const argType = arg.type as ArgumentType;
    if (!(argType in argumentTypeMappings)) {
        Logger.error(`Unknown argument type: ${arg.type} for argument ${arg.trigger}`, 'CommandMapper');
        throw new Error(`Unknown argument type: ${arg.type}`);
    }

    // Base properties common to all options
    const baseName = arg.trigger;
    const baseDescription = arg.description || 'No description provided.';
    const baseRequired = arg.required !== null && arg.required !== undefined ? arg.required : true;

    // Handle based on argument type
    switch (argType) {
        case 'Subcommand':
        case 'SubcommandGroup': {
            return {
                name: baseName,
                description: baseDescription,
                type: argumentTypeMappings[argType],
                options: arg.args ? arg.args.map(mapArgument) : []
            } as ApplicationCommandSubCommandData | ApplicationCommandSubGroupData;
        }

        case 'String':
        case 'RobloxUser':
        case 'RobloxRole': {
            const option: ApplicationCommandStringOptionData = {
                name: baseName,
                description: baseDescription,
                type: ApplicationCommandOptionType.String,
                required: baseRequired
            };

            // Only set autocomplete or choices, not both
            if (arg.autocomplete) {
                // Instead of setting directly, use Object.assign to avoid type issues
                Object.assign(option, { autocomplete: true });
            } else if (arg.choices && arg.choices.length > 0) {
                option.choices = arg.choices;
            }

            return option;
        }

        case 'Number': {
            const option: ApplicationCommandNumericOptionData = {
                name: baseName,
                description: baseDescription,
                type: ApplicationCommandOptionType.Integer,
                required: baseRequired
            };

            // Only set autocomplete or choices, not both
            if (arg.autocomplete) {
                // Instead of setting directly, use Object.assign to avoid type issues
                Object.assign(option, { autocomplete: true });
            } else if (arg.choices && arg.choices.length > 0) {
                // Convert string choices to number choices
                const numericChoices = arg.choices.map(choice => ({
                    name: choice.name,
                    value: typeof choice.value === 'string' ? Number(choice.value) : choice.value
                }));
                // Use Object.assign to set choices to avoid type issues
                Object.assign(option, { choices: numericChoices });
            }

            return option;
        }

        case 'Boolean': {
            return {
                name: baseName,
                description: baseDescription,
                type: ApplicationCommandOptionType.Boolean,
                required: baseRequired
            } as ApplicationCommandBooleanOptionData;
        }

        case 'DiscordUser': {
            return {
                name: baseName,
                description: baseDescription,
                type: ApplicationCommandOptionType.User,
                required: baseRequired
            } as ApplicationCommandUserOptionData;
        }

        case 'DiscordRole': {
            return {
                name: baseName,
                description: baseDescription,
                type: ApplicationCommandOptionType.Role,
                required: baseRequired
            } as ApplicationCommandRoleOptionData;
        }

        case 'DiscordChannel': {
            return {
                name: baseName,
                description: baseDescription,
                type: ApplicationCommandOptionType.Channel,
                required: baseRequired,
                channelTypes: arg.channelTypes
            } as ApplicationCommandChannelOptionData;
        }

        case 'DiscordMentionable': {
            return {
                name: baseName,
                description: baseDescription,
                type: ApplicationCommandOptionType.Mentionable,
                required: baseRequired
            } as ApplicationCommandMentionableOptionData;
        }

        case 'Attachment': {
            return {
                name: baseName,
                description: baseDescription,
                type: ApplicationCommandOptionType.Attachment,
                required: baseRequired
            } as ApplicationCommandAttachmentOption;
        }

        default: {
            // This should never happen due to earlier check
            throw new Error(`Unhandled argument type: ${arg.type}`);
        }
    }
};

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
     * Generate a command object for Discord's API
     * @returns The properly formatted command object for Discord API
     */
    generateAPICommand() {
        try {
            // Validate required fields
            if (!this.trigger) {
                throw new Error('Command missing trigger');
            }

            if (!this.description) {
                Logger.warn(`Command ${this.trigger} missing description`, 'CommandMapper');
            }

            // Determine the command type
            const commandType = commandTypeMappings[this.type || 'ChatInput'];
            if (!commandType) {
                throw new Error(`Unknown command type: ${this.type}`);
            }

            // Process arguments if they exist
            let options: ApplicationCommandOptionData[] = [];
            if (this.args && this.args.length > 0) {
                options = this.args.map(arg => {
                    try {
                        return mapArgument(arg);
                    } catch (err) {
                        Logger.error(`Failed to map argument ${arg.trigger} for command ${this.trigger}: ${err.message}`, 'CommandMapper');
                        throw err;
                    }
                });
            }

            // Create the command data object
            const commandData = {
                name: this.trigger,
                description: this.description || 'No description provided.',
                type: commandType,
                options: options,
                // Note: defaultPermission is deprecated in newer Discord.js versions
                // but included for backward compatibility
                defaultPermission: true,
            };

            // Log for debugging
            Logger.debug(`Generated API command for ${this.trigger} with ${options.length} options`, 'CommandMapper');

            return commandData;
        } catch (error) {
            Logger.error(`Failed to generate API command for ${this.trigger}: ${error.message}`, 'CommandMapper', error);
            throw error;
        }
    }

    /**
     * Validates that the command options are correctly configured
     * @returns True if valid, throws error if invalid
     */
    validateCommand() {
        // Command name validation
        if (!this.trigger || !/^[\w-]{1,32}$/.test(this.trigger)) {
            throw new Error(`Invalid command name: ${this.trigger}. Must be 1-32 characters and only contain alphanumeric characters, underscores, and hyphens.`);
        }

        // Description validation
        if (!this.description || this.description.length > 100) {
            throw new Error(`Invalid description for command ${this.trigger}. Must be 1-100 characters.`);
        }

        // Validate all arguments recursively
        if (this.args) {
            this.validateArguments(this.args);
        }

        return true;
    }

    /**
     * Validates arguments recursively
     */
    private validateArguments(args: CommandArgument[], parentType?: string) {
        for (const arg of args) {
            // Argument name validation
            if (!arg.trigger || !/^[\w-]{1,32}$/.test(arg.trigger)) {
                throw new Error(`Invalid argument name: ${arg.trigger} in command ${this.trigger}. Must be 1-32 characters and only contain alphanumeric characters, underscores, and hyphens.`);
            }

            // Description validation
            if (!arg.description || arg.description.length > 100) {
                throw new Error(`Invalid description for argument ${arg.trigger} in command ${this.trigger}. Must be 1-100 characters.`);
            }

            // Type validation - Check if type exists in our mapping object
            // This approach avoids direct type comparisons that cause TypeScript errors
            if (!arg.type || !(arg.type in argumentTypeMappings)) {
                throw new Error(`Invalid type for argument ${arg.trigger} in command ${this.trigger}: ${arg.type}`);
            }

            // Recursive validation for subcommands and subcommand groups
            if ((arg.type === 'Subcommand' || arg.type === 'SubcommandGroup') && arg.args) {
                this.validateArguments(arg.args, arg.type);
            }
        }
    }

    /**
     * The function to run the command.
     * @param ctx The context of the command.
     */
    abstract run(ctx: CommandContext): Promise<any> | any;
}

export default Command;