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
import * as chronoEn from 'chrono-node/dist/en';

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
                        // Try parsing as YYYY-MM-DD HH:MM
                        try {
                            const parsedDate = chronoEn.parse(eventTimeInput, new Date(), {
                                forwardDate: true
                            })[0]?.date();

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