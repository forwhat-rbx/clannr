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

export async function processInChunks<T>(
    interaction: CommandInteraction | ModalSubmitInteraction | ButtonInteraction | CommandContext,
    items: T[],
    processFunction: (item: T, index: number) => Promise<any>,
    options: ProcessingOptions
): Promise<any[]> {
    const results: any[] = [];
    const { totalItems, chunkSize, initialMessage, progressInterval, completionMessage } = options;

    // Extract the interaction if it's wrapped in a CommandContext
    const actualInteraction =
        'subject' in interaction && interaction.subject ?
            interaction.subject :
            interaction;

    // Check if the interaction is already replied or deferred
    const isInteractionReplied =
        ('replied' in actualInteraction && actualInteraction.replied) ||
        ('deferred' in actualInteraction && actualInteraction.deferred);

    // Send initial message if needed
    if (!isInteractionReplied && initialMessage) {
        await sendUpdate(interaction, initialMessage);
    }

    // Process in chunks
    for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);

        // Process all items in the chunk in parallel
        const chunkPromises = chunk.map((item, chunkIndex) =>
            processFunction(item, i + chunkIndex)
        );

        const chunkResults = await Promise.all(chunkPromises);
        results.push(...chunkResults);

        // Send progress update if needed
        const progress = Math.floor((i + chunk.length) / totalItems * 100);
        if (progressInterval && progress % progressInterval === 0 && progress < 100) {
            await sendUpdate(interaction, `Processing... ${progress}% complete (${i + chunk.length}/${totalItems})`);
        }
    }

    // Send completion message
    if (completionMessage) {
        await sendUpdate(interaction, completionMessage);
    }

    return results.filter(r => r !== null);
}