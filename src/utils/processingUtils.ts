import { ButtonInteraction, Message, InteractionReplyOptions, ModalSubmitInteraction, CommandInteraction } from 'discord.js';
import { CommandContext } from '../structures/addons/CommandAddons';

export interface ProcessingOptions {
    totalItems: number;
    chunkSize: number;
    initialMessage: string;
    progressInterval: number;
    completionMessage: string;
}

// Update the type to include ButtonInteraction
export type InteractionOrContext = CommandContext | ButtonInteraction | ModalSubmitInteraction | CommandInteraction;

async function sendUpdate(
    interaction: InteractionOrContext,
    message: string
): Promise<void> {
    try {
        // Handle CommandContext differently
        if ('subject' in interaction) {
            if (interaction.subject) {
                const subject = interaction.subject;
                if ('deferred' in subject && subject.deferred) {
                    await subject.followUp({ content: message });
                } else if ('replied' in subject && subject.replied) {
                    await subject.followUp({ content: message });
                } else if ('reply' in subject) {
                    await subject.reply({ content: message, ephemeral: true });
                }
            }
            return;
        }

        // For regular interactions - add type assertions to help TypeScript understand
        if ('deferred' in interaction && interaction.deferred) {
            if ('editReply' in interaction) {
                // The error is here - TypeScript doesn't recognize the method
                await (interaction as CommandInteraction | ButtonInteraction | ModalSubmitInteraction).editReply({ content: message });
            } else if ('followUp' in interaction) {
                // This is where the error occurs - fix with type assertion
                await (interaction as CommandInteraction | ButtonInteraction | ModalSubmitInteraction).followUp({ content: message });
            }
        } else if ('replied' in interaction && interaction.replied) {
            if ('followUp' in interaction) {
                await (interaction as CommandInteraction | ButtonInteraction | ModalSubmitInteraction).followUp({ content: message });
            }
        } else if ('reply' in interaction) {
            await (interaction as CommandInteraction | ButtonInteraction | ModalSubmitInteraction).reply({
                content: message,
                ephemeral: true,
                fetchReply: true
            });
        }
    } catch (error) {
        console.error('Error sending update:', error);
    }
}

export async function processInChunks<T, R>(
    ctx: CommandContext,
    items: T[],
    processorFn: (item: T, index: number) => Promise<R>,
    options: ProcessingOptions
): Promise<R[]> {
    const { totalItems, chunkSize, initialMessage, progressInterval, completionMessage } = options;
    const results: R[] = [];

    // Send initial status message
    const statusMessage = await ctx.reply({ content: initialMessage });

    // Process in chunks
    let processedCount = 0;
    let lastProgressUpdate = 0;

    for (let i = 0; i < items.length; i++) {
        const result = await processorFn(items[i], i);
        if (result !== null) {
            results.push(result);
        }

        processedCount++;
        const progressPercentage = Math.floor((processedCount / totalItems) * 100);

        // Only update progress at defined intervals to avoid rate limits
        if (progressPercentage >= lastProgressUpdate + progressInterval || processedCount === totalItems) {
            lastProgressUpdate = Math.floor(progressPercentage / progressInterval) * progressInterval;

            // Edit the existing message instead of sending a new one
            await statusMessage.edit({
                content: `${initialMessage} (${processedCount}/${totalItems}, ${progressPercentage}% complete)`
            }).catch(err => console.error('Failed to update progress message:', err));

            // Small delay to avoid rate limits
            await new Promise(r => setTimeout(r, 500));
        }
    }

    // Update with completion message if not immediately followed by results
    if (completionMessage) {
        await statusMessage.edit({
            content: completionMessage
        }).catch(err => console.error('Failed to update completion message:', err));
    }

    return results;
}