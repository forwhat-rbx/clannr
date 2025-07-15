import { MessageCreateOptions, InteractionReplyOptions } from 'discord.js';

// Custom type that extends MessageCreateOptions to include ephemeral
export interface CustomReplyOptions extends MessageCreateOptions {
    ephemeral?: boolean;
}

/**
 * Create a reply payload that works with both interactions and regular messages
 */
export function createReplyOptions(options: {
    content?: string;
    embeds?: any[];
    components?: any[];
    ephemeral?: boolean;
    files?: any[];
}): CustomReplyOptions {
    return options;
}