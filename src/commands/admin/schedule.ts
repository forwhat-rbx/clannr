import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    CommandInteraction,
    ChatInputCommandInteraction,
    ModalSubmitInteraction
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
            // Extract the subject (interaction) from context
            const interaction = ctx.subject as CommandInteraction;

            // Debug logging
            Logger.info(`Subject check: ${Boolean(interaction)}`, 'ScheduleDebug');

            // Check if we actually have an interaction
            if (!interaction) {
                Logger.error('No interaction found in context', 'ScheduleDebug');
                await ctx.reply({
                    content: 'This command can only be used with slash commands.',
                    ephemeral: true
                });
                return;
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

            try {
                // Just show the modal - the handling is now in modalSubmitHandler.ts
                Logger.info('Attempting to show modal', 'ScheduleDebug');
                await interaction.showModal(modal);

                // Don't await the modal submission here - that's handled by the modal submit handler
            } catch (error) {
                Logger.error('Error showing modal', 'ScheduleDebug', error);
                await ctx.reply({
                    content: 'Failed to show event creation form. Please try again.',
                    ephemeral: true
                });
            }
        } catch (error) {
            Logger.error('General error in schedule command', 'ScheduleDebug', error);
            await ctx.reply({
                content: 'An error occurred while trying to schedule an event. Please try again later.',
                ephemeral: true
            });
        }
    }
}

export default ScheduleEventCommand;