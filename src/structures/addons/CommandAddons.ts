import {
    Message,
    InteractionReplyOptions,
    CommandInteraction,
    User,
    Guild,
    GuildMember,
    BaseInteraction,
    MessageCreateOptions,
    TextBasedChannel,
    MessagePayload,
    WebhookMessageEditOptions
} from 'discord.js';
import { Command } from '../Command';
import { Args } from 'lexure';
import { getMissingArgumentsEmbed } from '../../handlers/locale';
import { config } from '../../config';
import { Logger } from '../../utils/logger';

export class CommandContext {
    // Properties organized at the top
    public type: 'interaction' | 'message';
    public subject: CommandInteraction | Message;
    public user: User;
    public member: GuildMember;
    public guild: Guild;
    public channel: TextBasedChannel;
    public args: { [key: string]: any };
    public replied: boolean;
    public deferred: boolean;
    public command: Command;
    public message: Message | null;
    public interaction: CommandInteraction | null;

    /**
     * Command context for getting usage information and replying.
     * 
     * @param payload Interaction or message that triggered the command
     * @param command Command instance being executed
     * @param args Arguments for the command (for message commands)
     */
    constructor(payload: BaseInteraction | CommandInteraction | Message, command: Command, args?: Args) {
        this.type = payload instanceof Message ? 'message' : 'interaction';
        this.subject = payload instanceof BaseInteraction ? payload as CommandInteraction : payload;
        this.user = payload instanceof Message ? payload.author : payload.user;
        this.member = payload.member as GuildMember;
        this.guild = payload.guild;
        this.channel = payload instanceof Message ? payload.channel : payload.channel;
        this.command = command;
        this.replied = false;
        this.deferred = false;

        // Set message or interaction properties based on payload type
        this.message = payload instanceof Message ? payload : null;
        this.interaction = payload instanceof BaseInteraction ? payload as CommandInteraction : null;

        this.args = {};

        try {
            if (payload instanceof BaseInteraction) {
                const interaction = payload as CommandInteraction;
                interaction.options.data.forEach((arg) => {
                    const option = interaction.options.get(arg.name);
                    if (option) {
                        this.args[arg.name] = option.value;
                    }
                });
            } else if (args) {
                if (this.channel) {
                    this.channel.sendTyping().catch(err =>
                        Logger.warn(`Failed to send typing indicator: ${err.message}`, 'CommandContext')
                    );
                }

                this.command.args.forEach((arg, index) => {
                    if (!arg.isLegacyFlag) {
                        this.args[arg.trigger] = args.single();
                    }
                });

                const filledOutArgs = Object.keys(Object.fromEntries(Object.entries(this.args).filter(([_, v]) => v !== null)));
                const requiredArgs = this.command.args.filter((arg) => (arg.required === undefined || arg.required === null ? true : arg.required) && !arg.isLegacyFlag);

                if (filledOutArgs.length < requiredArgs.length) {
                    this.reply({ embeds: [getMissingArgumentsEmbed(this.command.trigger, this.command.args)] });
                    throw new Error('INVALID_USAGE');
                } else {
                    if (args.length > requiredArgs.length) {
                        const extraArgs = args.many(1000, requiredArgs.length);
                        const lastArgKey = Object.keys(this.args)
                            .filter((key) => this.command.args.find((arg) => arg.trigger === key) &&
                                !this.command.args.find((arg) => arg.trigger === key).isLegacyFlag)
                            .at(-1);

                        if (lastArgKey) {
                            this.args[lastArgKey] = [this.args[lastArgKey], ...extraArgs.map((arg) => arg.value)].join(' ');
                        }
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
        } catch (error) {
            if (error.message !== 'INVALID_USAGE') {
                Logger.error(`Error processing command arguments: ${error.message}`, 'CommandContext', error);
            }
            throw error;
        }
    }

    /**
     * Edit the reply to this command
     * @param options Options for editing the reply
     */
    async editReply(options: string | MessagePayload | WebhookMessageEditOptions): Promise<any> {
        try {
            // Check what type of subject we have
            if (this.type === 'interaction') {
                // For slash commands and other interactions
                if (this.subject instanceof CommandInteraction && (this.subject.deferred || this.subject.replied)) {
                    return await this.subject.editReply(options);
                } else {
                    throw new Error('Cannot edit reply before deferring or replying');
                }
            } else if (this.type === 'message') {
                // For legacy commands (messages)
                if (this.replied && this.message) {
                    if (typeof options === 'string') {
                        return await this.message.edit({ content: options });
                    } else {
                        return await this.message.edit(options);
                    }
                } else {
                    throw new Error('Cannot edit reply for legacy command before sending initial reply');
                }
            } else {
                throw new Error(`Cannot edit reply for unknown context type: ${this.type}`);
            }
        } catch (error) {
            Logger.error(`Failed to edit reply: ${error.message}`, 'CommandContext', error);
            throw error;
        }
    }

    /**
     * Check if the user has permission to use this command
     */
    checkPermissions(): boolean {
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

            permissions.forEach((permission) => {
                if (hasPermission !== null) return;

                let fitsCriteria: boolean = false;

                if (config.permissions.all && this.member?.roles?.cache?.some((role) =>
                    config.permissions.all.includes(role.id))) {
                    fitsCriteria = true;
                } else {
                    if (permission.type === 'role') {
                        fitsCriteria = this.member?.roles?.cache?.has(permission.id) || false;
                    }
                    if (permission.type === 'user') {
                        fitsCriteria = this.member?.id === permission.id;
                    }
                }

                if (fitsCriteria) {
                    hasPermission = true;
                }
            });

            return hasPermission || false;
        }
    }

    /**
     * Send a message in the channel of the command message, or directly reply to a command interaction.
     * 
     * @param payload The content to send as a reply
     */
    async reply(payload: string | InteractionReplyOptions | MessageCreateOptions): Promise<any> {
        try {
            this.replied = true;

            if (this.subject instanceof CommandInteraction) {
                const subject = this.subject as CommandInteraction;

                if (this.deferred) {
                    return await subject.editReply(payload);
                } else {
                    const options = typeof payload === 'string'
                        ? { content: payload } as InteractionReplyOptions
                        : payload as InteractionReplyOptions;

                    return await subject.reply(options);
                }
            } else if (this.subject instanceof Message) {
                const options = typeof payload === 'string'
                    ? { content: payload } as MessageCreateOptions
                    : payload as MessageCreateOptions;

                return await this.subject.channel.send(options);
            } else {
                throw new Error(`Unknown subject type: ${typeof this.subject}`);
            }
        } catch (err) {
            Logger.error(`Failed to reply to command: ${err.message}`, 'CommandContext', err);

            // Try once more with a simplified approach
            try {
                if (this.subject instanceof CommandInteraction) {
                    const simplePayload = typeof payload === 'string'
                        ? { content: payload, ephemeral: true }
                        : { ...payload, ephemeral: true };

                    if (this.deferred) {
                        return await this.subject.editReply(simplePayload);
                    } else if (!this.subject.replied) {
                        return await this.subject.reply(simplePayload as InteractionReplyOptions);
                    }
                } else if (this.subject instanceof Message) {
                    return await this.subject.channel.send(typeof payload === 'string'
                        ? { content: payload }
                        : payload as MessageCreateOptions);
                }
            } catch (finalErr) {
                Logger.error(`Failed final attempt to reply: ${finalErr.message}`, 'CommandContext', finalErr);
            }
        }
    }

    /**
     * Defer the reply to this command
     * @param options Options for deferring
     */
    async defer(options: { ephemeral?: boolean } = {}): Promise<void> {
        try {
            if (this.subject instanceof CommandInteraction) {
                if (!this.subject.deferred && !this.subject.replied) {
                    await this.subject.deferReply({
                        ephemeral: options?.ephemeral === true
                    });
                    this.deferred = true;
                }
            } else if (this.subject instanceof Message) {
                if (this.channel) {
                    await this.channel.sendTyping();
                    this.deferred = true;
                }
            }
        } catch (err) {
            Logger.warn(`Failed to defer reply: ${err.message}`, 'CommandContext');
        }
    }
}