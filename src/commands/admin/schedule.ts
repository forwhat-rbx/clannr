import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    CommandInteraction
} from 'discord.js';
import { config } from '../../config';
import { Logger } from '../../utils/logger';
import { createBaseEmbed } from '../../utils/embedUtils';
import * as chrono from 'chrono-node';

class ScheduleEventCommand extends Command {
    constructor() {
        super({
            trigger: 'schedule',
            description: 'Create a new event announcement',
            type: 'ChatInput',
            module: 'admin',
            permissions: [
                {
                    type: 'role',
                    ids: config.permissions.admin,
                    value: true,
                }
            ]
        });
    }

    async run(ctx: CommandContext) {
        try {
            // ADD DEBUGGING LOGS
            Logger.info(`Running schedule command with ctx type: ${typeof ctx}`, 'ScheduleDebug');
            Logger.info(`Context has interaction: ${Boolean(ctx.interaction)}`, 'ScheduleDebug');

            if (ctx.interaction) {
                Logger.info(`Interaction type: ${ctx.interaction.constructor.name}`, 'ScheduleDebug');
                Logger.info(`Interaction has showModal: ${Boolean(ctx.interaction.showModal)}`, 'ScheduleDebug');
                Logger.info(`showModal type: ${typeof ctx.interaction.showModal}`, 'ScheduleDebug');
                Logger.info(`Interaction properties: ${Object.keys(ctx.interaction).join(', ')}`, 'ScheduleDebug');
            }

            // Create a modal for the event details
            const modal = new ModalBuilder()
                .setCustomId(`event_create_modal:${ctx.user.id}`)
                .setTitle('Schedule New Event');

            // Event type select
            const eventTypeInput = new TextInputBuilder()
                .setCustomId('event_type')
                .setLabel('Event Type (TRAINING/RAID/DEFENSE/SCRIM)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Type: TRAINING, RAID, DEFENSE, or SCRIM')
                .setRequired(true)
                .setMaxLength(10);

            // Time input
            const timeInput = new TextInputBuilder()
                .setCustomId('event_time')
                .setLabel('Time (YYYY-MM-DD HH:MM or Unix timestamp)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g., 2025-05-30 20:00 or 1749262500')
                .setRequired(true);

            // Location input
            const locationInput = new TextInputBuilder()
                .setCustomId('event_location')
                .setLabel('Location')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Where will this event take place?')
                .setRequired(true);

            // Notes input
            const notesInput = new TextInputBuilder()
                .setCustomId('event_notes')
                .setLabel('Notes')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Any additional information for participants')
                .setRequired(false);

            // Add inputs to rows
            const firstRow = new ActionRowBuilder<TextInputBuilder>().addComponents(eventTypeInput);
            const secondRow = new ActionRowBuilder<TextInputBuilder>().addComponents(timeInput);
            const thirdRow = new ActionRowBuilder<TextInputBuilder>().addComponents(locationInput);
            const fourthRow = new ActionRowBuilder<TextInputBuilder>().addComponents(notesInput);

            // Add rows to the modal
            modal.addComponents(firstRow, secondRow, thirdRow, fourthRow);

            // Try alternative approaches to check interaction
            Logger.info(`Testing alternative checks...`, 'ScheduleDebug');

            // Detailed check 1: Check if interaction is a CommandInteraction
            const isCommandInteraction = ctx.interaction instanceof CommandInteraction;
            Logger.info(`Is CommandInteraction: ${isCommandInteraction}`, 'ScheduleDebug');

            // Detailed check 2: Try a direct cast and check
            try {
                const testInteraction = ctx.interaction as CommandInteraction;
                Logger.info(`Direct cast successful, has showModal: ${Boolean(testInteraction?.showModal)}`, 'ScheduleDebug');
            } catch (e) {
                Logger.error(`Direct cast failed: ${e.message}`, 'ScheduleDebug');
            }

            // Check if we're using slash commands and have access to modal functionality
            if (ctx.interaction && typeof ctx.interaction.showModal === 'function') {
                Logger.info(`Condition passed, showing modal`, 'ScheduleDebug');
                // Cast to CommandInteraction to access showModal
                const interaction = ctx.interaction as CommandInteraction;

                // Show the modal
                await interaction.showModal(modal);
                try {
                    // Wait for modal submission
                    const filter = i => i.customId === `event_create_modal:${ctx.user.id}`;
                    const submission = await interaction.awaitModalSubmit({
                        filter,
                        time: 300000 // 5 minute timeout
                    });

                    // Process the submission
                    // ...rest of code remains the same...
                } catch (error) {
                    Logger.error('Error processing event modal submission', 'EventScheduling', error);
                    // ...error handling...
                }
            } else {
                Logger.info(`Condition failed, showing error message`, 'ScheduleDebug');
                Logger.info(`ctx.interaction exists: ${Boolean(ctx.interaction)}`, 'ScheduleDebug');
                if (ctx.interaction) {
                    Logger.info(`showModal is a function: ${typeof ctx.interaction.showModal === 'function'}`, 'ScheduleDebug');
                    Logger.info(`showModal type: ${typeof ctx.interaction.showModal}`, 'ScheduleDebug');
                }

                // Try another approach without checking
                try {
                    Logger.info(`Attempting direct modal show without condition check`, 'ScheduleDebug');
                    // Force-cast the interaction
                    const forcedInteraction = ctx.interaction as any;
                    // Try showing the modal directly
                    await forcedInteraction.showModal(modal);

                    Logger.info(`Direct modal show worked!`, 'ScheduleDebug');

                    // Return to avoid showing the error message
                    return;
                } catch (e) {
                    Logger.error(`Direct modal show failed: ${e.message}`, 'ScheduleDebug', e);
                }

                await ctx.reply({
                    content: 'This command can only be used with slash commands. Debug info has been logged.',
                    ephemeral: true
                });
            }
        } catch (error) {
            Logger.error('Error showing event creation modal', 'EventScheduling', error);
            await ctx.reply({
                content: 'An error occurred while trying to schedule an event. Check logs for details.',
                ephemeral: true
            });
        }
    }
}

export default ScheduleEventCommand;