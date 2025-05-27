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
// Remove problematic chrono-node import

// Custom date parser function to replace chrono-node
function parseDate(text: string): Date | null {
    // First, try standard date format YYYY-MM-DD HH:MM
    const dateRegex = /(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}))?/;
    const match = text.match(dateRegex);

    if (match) {
        const year = parseInt(match[1]);
        const month = parseInt(match[2]) - 1; // JS months are 0-indexed
        const day = parseInt(match[3]);
        const hour = match[4] ? parseInt(match[4]) : 0;
        const minute = match[5] ? parseInt(match[5]) : 0;

        return new Date(year, month, day, hour, minute);
    }

    // Try natural language formats
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (/today/i.test(text)) {
        // Extract time if available (e.g., "today at 3pm")
        const timeMatch = text.match(/(\d{1,2})(?::(\d{1,2}))?(?:\s*(am|pm))?/i);
        if (timeMatch) {
            let hour = parseInt(timeMatch[1]);
            const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
            const ampm = timeMatch[3]?.toLowerCase();

            if (ampm === 'pm' && hour < 12) hour += 12;
            if (ampm === 'am' && hour === 12) hour = 0;

            today.setHours(hour, minute, 0, 0);
        }
        return today;
    }

    if (/tomorrow/i.test(text)) {
        // Extract time if available
        const timeMatch = text.match(/(\d{1,2})(?::(\d{1,2}))?(?:\s*(am|pm))?/i);
        if (timeMatch) {
            let hour = parseInt(timeMatch[1]);
            const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
            const ampm = timeMatch[3]?.toLowerCase();

            if (ampm === 'pm' && hour < 12) hour += 12;
            if (ampm === 'am' && hour === 12) hour = 0;

            tomorrow.setHours(hour, minute, 0, 0);
        }
        return tomorrow;
    }

    // Try to parse month names (e.g., "May 30 at 3pm")
    const monthNameRegex = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:[a-z]{2})?\s+(?:at\s+)?(\d{1,2})(?::(\d{1,2}))?(?:\s*(am|pm))?/i;
    const monthMatch = text.match(monthNameRegex);

    if (monthMatch) {
        const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
        const monthIndex = monthNames.findIndex(m => monthMatch[1].toLowerCase().startsWith(m));

        if (monthIndex !== -1) {
            const day = parseInt(monthMatch[2]);
            let hour = parseInt(monthMatch[3]);
            const minute = monthMatch[4] ? parseInt(monthMatch[4]) : 0;
            const ampm = monthMatch[5]?.toLowerCase();

            if (ampm === 'pm' && hour < 12) hour += 12;
            if (ampm === 'am' && hour === 12) hour = 0;

            const date = new Date();
            date.setMonth(monthIndex);
            date.setDate(day);
            date.setHours(hour, minute, 0, 0);

            // If the date is in the past, assume next year
            if (date < new Date()) {
                date.setFullYear(date.getFullYear() + 1);
            }

            return date;
        }
    }

    return null;
}

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

            // Check if we're using slash commands and have access to modal functionality
            if (ctx.type === 'interaction' && ctx.interaction) {
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
                    const eventType = submission.fields.getTextInputValue('event_type').trim().toUpperCase();
                    const eventTimeInput = submission.fields.getTextInputValue('event_time').trim();
                    const eventLocation = submission.fields.getTextInputValue('event_location').trim();
                    const eventNotes = submission.fields.getTextInputValue('event_notes').trim();

                    // Validate event type
                    const validTypes = ['TRAINING', 'RAID', 'DEFENSE', 'SCRIM'];
                    if (!validTypes.includes(eventType)) {
                        await submission.reply({
                            content: 'Invalid event type. Please use TRAINING, RAID, DEFENSE, or SCRIM.',
                            ephemeral: true
                        });
                        return;
                    }

                    // Parse time input to get Unix timestamp
                    let unixTimestamp: number;

                    // Try parsing as Unix timestamp first
                    if (/^\d+$/.test(eventTimeInput)) {
                        unixTimestamp = parseInt(eventTimeInput);
                    } else {
                        // Try parsing with our custom parser
                        try {
                            const parsedDate = parseDate(eventTimeInput);

                            if (!parsedDate) {
                                throw new Error('Could not understand the date format');
                            }
                            unixTimestamp = Math.floor(parsedDate.getTime() / 1000);
                        } catch (error) {
                            await submission.reply({
                                content: 'Could not understand your date format. Try something like "tomorrow at 8pm" or "May 30 at 3pm".',
                                ephemeral: true
                            });
                            return;
                        }
                    }

                    // Create the event embed
                    const eventEmbed = createBaseEmbed('primary')
                        .setTitle(`${eventType} EVENT`)
                        .addFields([
                            { name: 'Host', value: `<@${ctx.user.id}>`, inline: false },
                            { name: 'Time', value: `<t:${unixTimestamp}:F> (<t:${unixTimestamp}:R>)`, inline: false },
                            { name: 'Location', value: eventLocation, inline: false }
                        ]);

                    // Add notes if provided
                    if (eventNotes) {
                        eventEmbed.addFields({ name: 'Notes', value: eventNotes, inline: false });
                    }

                    // Set color based on event type
                    switch (eventType) {
                        case 'TRAINING':
                            eventEmbed.setColor('#4CAF50'); // Green
                            break;
                        case 'RAID':
                            eventEmbed.setColor('#F44336'); // Red
                            break;
                        case 'DEFENSE':
                            eventEmbed.setColor('#2196F3'); // Blue
                            break;
                        case 'SCRIM':
                            eventEmbed.setColor('#FF9800'); // Orange
                            break;
                    }

                    // Add buttons for RSVP (optional)
                    const rsvpRow = new ActionRowBuilder<ButtonBuilder>()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(`event_rsvp_yes:${Date.now()}`)
                                .setLabel('Attending')
                                .setStyle(ButtonStyle.Success)
                                .setEmoji('✅'),
                            new ButtonBuilder()
                                .setCustomId(`event_rsvp_no:${Date.now()}`)
                                .setLabel('Not Attending')
                                .setStyle(ButtonStyle.Danger)
                                .setEmoji('❌'),
                            new ButtonBuilder()
                                .setCustomId(`event_rsvp_maybe:${Date.now()}`)
                                .setLabel('Maybe')
                                .setStyle(ButtonStyle.Secondary)
                                .setEmoji('❓')
                        );

                    // Send the event announcement
                    await submission.reply({
                        content: 'Event scheduled successfully!',
                        ephemeral: true
                    });

                    // Send the actual announcement to the channel
                    await ctx.channel.send({
                        content: '@everyone',
                        embeds: [eventEmbed],
                        components: [rsvpRow]
                    });

                    // Log the event creation
                    Logger.info(`Event scheduled by ${ctx.user.tag}: ${eventType} at ${new Date(unixTimestamp * 1000).toISOString()}`, 'EventScheduling');

                } catch (error) {
                    Logger.error('Error processing event modal submission', 'EventScheduling', error);
                    if (ctx.interaction.deferred || ctx.interaction.replied) {
                        await ctx.editReply({ content: 'Failed to process event creation. Please try again.' });
                    } else {
                        await ctx.reply({ content: 'Failed to process event creation. Please try again.', ephemeral: true });
                    }
                }
            } else {
                await ctx.reply({ content: 'This command can only be used with slash commands.', ephemeral: true });
            }
        } catch (error) {
            Logger.error('Error showing event creation modal', 'EventScheduling', error);
            await ctx.reply({ content: 'An error occurred while trying to schedule an event.', ephemeral: true });
        }
    }
}

export default ScheduleEventCommand;