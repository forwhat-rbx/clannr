import { ButtonInteraction, Message, InteractionReplyOptions, ModalSubmitInteraction, CommandInteraction } from 'discord.js';
import { CommandContext } from '../structures/addons/CommandAddons';

export interface ProcessingOptions {
    totalItems: number;
    chunkSize: number;
    initialMessage: string;
    progressInterval: number;
    completionMessage: string;
}

// Update the type to include all interaction types
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

/**
 * Process items in chunks with progress updates
 */
export async function processInChunks<T, R>(
    interaction: InteractionOrContext,
    items: T[],
    processorFn: (item: T, index: number) => Promise<R>,
    options: ProcessingOptions
): Promise<R[]> {
    const { totalItems, chunkSize, initialMessage, progressInterval, completionMessage } = options;
    const results: R[] = [];

    // Send initial status message based on interaction type - fix type narrowing
    let statusMessage;

    // Handle CommandContext
    if ('subject' in interaction && 'reply' in interaction) {
        statusMessage = await interaction.reply({ content: initialMessage, fetchReply: true });
    }
    // Handle deferred CommandInteraction/ButtonInteraction/ModalSubmitInteraction
    else if (isInteractionWithEditReply(interaction) && 'deferred' in interaction && interaction.deferred) {
        statusMessage = await interaction.editReply({ content: initialMessage });
    }
    // Handle ButtonInteraction with update
    else if (isButtonInteraction(interaction)) {
        statusMessage = await interaction.update({ content: initialMessage, fetchReply: true });
    }
    // Fallback
    else {
        console.error('No appropriate method found to send/update message');
        return results;
    }

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

            try {
                // Edit the existing message
                if (statusMessage && 'edit' in statusMessage) {
                    await statusMessage.edit({
                        content: `${initialMessage} (${processedCount}/${totalItems}, ${progressPercentage}% complete)`
                    });
                } else if (isInteractionWithEditReply(interaction)) {
                    await interaction.editReply({
                        content: `${initialMessage} (${processedCount}/${totalItems}, ${progressPercentage}% complete)`
                    });
                }
            } catch (err) {
                console.error('Failed to update progress message:', err);
            }

            // Small delay to avoid rate limits
            await new Promise(r => setTimeout(r, 500));
        }
    }

    // Update with completion message
    if (completionMessage) {
        try {
            if (statusMessage && 'edit' in statusMessage) {
                await statusMessage.edit({ content: completionMessage });
            } else if (isInteractionWithEditReply(interaction)) {
                await interaction.editReply({ content: completionMessage });
            }
        } catch (err) {
            console.error('Failed to update completion message:', err);
        }
    }

    return results;
}

// Type guard functions to help TypeScript narrow types correctly
function isInteractionWithEditReply(interaction: InteractionOrContext): interaction is CommandInteraction | ButtonInteraction | ModalSubmitInteraction {
    return 'editReply' in interaction;
}

function isButtonInteraction(interaction: InteractionOrContext): interaction is ButtonInteraction {
    return 'update' in interaction;
}