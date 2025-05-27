import {
    Message,
    InteractionReplyOptions,
    CommandInteraction,
    User,
    Guild,
    GuildMember,
    BaseInteraction,
    MessageCreateOptions,
    MessagePayload,
    InteractionEditReplyOptions,
    TextBasedChannel,
    TextChannel,
    DMChannel,
    NewsChannel,
    ThreadChannel
} from 'discord.js';
import { Command } from '../Command';
import { Args } from 'lexure';
import { getMissingArgumentsEmbed } from '../../handlers/locale';
import { config } from '../../config';
import { Logger } from '../../utils/logger';
import { CustomReplyOptions } from '../../utils/interactionUtils';

export class CommandContext {
    channel: TextBasedChannel;
    interaction: CommandInteraction | null;
    type: 'interaction' | 'message';
    subject?: CommandInteraction | Message;
    user?: User;
    member?: GuildMember;
    guild?: Guild;
    args?: { [key: string]: any };
    replied: boolean;
    deferred: boolean;
    command: Command;

    /**
     * Command context for getting usage information and replying.
     * 
     * @param payload
     */
    constructor(payload: BaseInteraction | CommandInteraction | Message, command: any, args?: Args) {
        this.type = payload instanceof Message ? 'message' : 'interaction';
        this.subject = payload instanceof BaseInteraction ? payload as CommandInteraction : payload;
        this.user = payload instanceof Message ? payload.author : payload.user;
        this.member = payload.member as GuildMember;
        this.guild = payload.guild;
        this.command = new command();
        this.replied = false;
        this.deferred = false;
        this.interaction = payload instanceof BaseInteraction ? payload as CommandInteraction : null;

        // Store the channel with proper type
        this.channel = (payload instanceof Message ? payload.channel :
            (payload as CommandInteraction).channel) as TextBasedChannel;

        this.args = {};
        if (payload instanceof BaseInteraction) {
            const interaction = payload as CommandInteraction;
            interaction.options.data.forEach(async (arg) => {
                this.args[arg.name] = interaction.options.get(arg.name).value;
            });
        } else {
            // Removed sendTyping as it's deprecated in Discord.js v14+

            this.command.args.forEach((arg, index) => {
                if (!arg.isLegacyFlag) this.args[arg.trigger] = args.single()
            });

            const filledOutArgs = Object.keys(Object.fromEntries(Object.entries(this.args).filter(([_, v]) => v !== null)));
            const requiredArgs = this.command.args.filter((arg) => (arg.required === undefined || arg.required === null ? true : arg.required) && !arg.isLegacyFlag);

            if (filledOutArgs.length < requiredArgs.length) {
                this.reply({ embeds: [getMissingArgumentsEmbed(this.command.trigger, this.command.args)] });
                throw new Error('INVALID_USAGE');
            } else {
                if (args.length > requiredArgs.length) {
                    const extraArgs = args.many(1000, requiredArgs.length);
                    this.args[Object.keys(this.args).filter((key) => !this.command.args.find((arg) => arg.trigger === key).isLegacyFlag).at(-1)] = [this.args[Object.keys(this.args).filter((key) => !this.command.args.find((arg) => arg.trigger === key).isLegacyFlag).at(-1)], ...extraArgs.map((arg) => arg.value)].join(' ');
                }
                let areAllRequiredFlagsEntered = true;
                this.command.args.filter((arg) => arg.isLegacyFlag).forEach((arg) => {
                    const flagValue = args.option(arg.trigger);
                    if (!flagValue && arg.required) areAllRequiredFlagsEntered = false;
                    this.args[arg.trigger] = flagValue;
                });
                if (!areAllRequiredFlagsEntered) {
                    this.reply({ embeds: [getMissingArgumentsEmbed(this.command.trigger, this.command.args)] });
                    throw new Error('INVALID_USAGE');
                }
            }
        }
    }

    checkPermissions() {
        if (!this.command.permissions || this.command.permissions.length === 0) {
            return true;
        } else {
            let hasPermission = null;
            let permissions = [];
            this.command.permissions.map((permission) => {
                permission.ids.forEach((id) => {
                    return permissions.push({
                        type: permission.type,
                        id,
                        value: permission.value,
                    });
                });
            });
            const permission = permissions.forEach((permission) => {
                let fitsCriteria: boolean;
                if (!hasPermission) {
                    if (config.permissions.all && this.member.roles.cache.some((role) => config.permissions.all.includes(role.id))) {
                        fitsCriteria = true;
                    } else {
                        if (permission.type === 'role') fitsCriteria = this.member.roles.cache.has(permission.id);
                        if (permission.type === 'user') fitsCriteria = this.member.id === permission.id;
                    }
                    if (fitsCriteria) hasPermission = true;
                }
            });
            return hasPermission || false;
        }
    }

    /**
     * Send a message in the channel of the command message, or directly reply to a command interaction.
     * 
     * @param payload
     */
    async reply(payload: string | MessagePayload | CustomReplyOptions) {
        this.replied = true;

        // Handle string or message payload directly
        if (typeof payload === 'string' || payload instanceof MessagePayload) {
            if (this.subject instanceof CommandInteraction) {
                try {
                    if (this.deferred) {
                        return await this.subject.editReply(payload);
                    } else {
                        return await this.subject.reply({
                            content: typeof payload === 'string' ? payload : undefined,
                            ...(payload instanceof MessagePayload ? { payload } : {})
                        });
                    }
                } catch (err) {
                    Logger.error('Error in reply (string/MessagePayload):', 'CommandContext', err);
                }
            } else if (this.subject instanceof Message) {
                if (this.channel && 'send' in this.channel) {
                    return await this.channel.send(payload);
                }
            }
            return;
        }

        // Handle object payload with potential ephemeral property
        const { ephemeral, ...messageOptions } = payload;

        if (this.subject instanceof CommandInteraction) {
            try {
                const subject = this.subject as CommandInteraction;
                if (this.deferred) {
                    // For deferred interactions, use editReply (remove ephemeral as it's not valid for editReply)
                    return await subject.editReply(messageOptions as InteractionEditReplyOptions);
                } else {
                    // For regular interactions, use reply with ephemeral if provided
                    return await subject.reply({
                        ...messageOptions,
                        ephemeral: ephemeral
                    } as InteractionReplyOptions);
                }
            } catch (err) {
                Logger.error('Error in reply (interaction):', 'CommandContext', err);
                try {
                    const subject = this.subject as CommandInteraction;
                    if (this.deferred) {
                        return await subject.editReply(messageOptions as InteractionEditReplyOptions);
                    } else {
                        return await subject.reply({
                            ...messageOptions,
                            ephemeral: ephemeral
                        } as InteractionReplyOptions);
                    }
                } catch (secondErr) {
                    Logger.error('Error in reply (retry):', 'CommandContext', secondErr);
                }
            }
        } else if (this.subject instanceof Message) {
            // For message-based commands, use channel.send with type guard
            if (this.channel && 'send' in this.channel) {
                return await this.channel.send(messageOptions as MessageCreateOptions);
            } else {
                Logger.error('Cannot send message: channel does not support sending', 'CommandContext');
            }
        }
    }

    async editReply(payload: string | MessagePayload | InteractionEditReplyOptions) {
        if (this.subject instanceof CommandInteraction) {
            return await this.subject.editReply(payload);
        }
    }

    async followUp(payload: string | MessagePayload | CustomReplyOptions) {
        if (this.subject instanceof CommandInteraction) {
            if (typeof payload === 'object' && !Buffer.isBuffer(payload) && 'ephemeral' in payload) {
                const { ephemeral, ...messageOptions } = payload;
                return await this.subject.followUp({
                    ...messageOptions,
                    ephemeral: ephemeral
                } as InteractionReplyOptions);
            } else {
                return await this.subject.followUp(payload as InteractionReplyOptions);
            }
        }
    }

    async defer(p0: { ephemeral: boolean } = { ephemeral: false }) {
        try {
            if (this.subject instanceof CommandInteraction) {
                const interaction = this.subject as CommandInteraction;
                if (!interaction.deferred && !interaction.replied) {
                    // Use the ephemeral option if provided
                    await this.subject.deferReply({ ephemeral: p0?.ephemeral || false });
                }
            } else {
                // No need to call sendTyping as it's deprecated
                // Instead, we'll just set the deferred flag
            }
            this.deferred = true;
        } catch (err) {
            Logger.error('Error in defer:', 'CommandContext', err);
        }
    }
}