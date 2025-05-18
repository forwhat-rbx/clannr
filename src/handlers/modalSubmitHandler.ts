import { ModalSubmitInteraction, EmbedBuilder } from 'discord.js';
import { robloxClient } from '../main';
import { createBaseEmbed } from '../utils/embedUtils';
import { processInChunks, ProcessingOptions } from '../utils/processingUtils';
import { logAction } from './handleLogging';
import { config } from '../config';

export async function handleModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
    const customId = interaction.customId;

    try {
        if (customId.startsWith('dm_modal:')) {
            await handleDmModalSubmit(interaction);
        } else if (customId.startsWith('dm_role_modal:')) {
            await handleDmRoleModalSubmit(interaction);
        } else if (customId.startsWith('dm_matched_members_modal:')) {
            await handleDmMatchedMembersModalSubmit(interaction);
        } else {
            console.warn(`Unknown modal type: ${customId}`);
            await interaction.reply({
                content: 'Unknown form type. Please try again.',
                ephemeral: true
            });
        }
    } catch (error) {
        console.error('Error in modal submit handler:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: 'An error occurred while processing your submission.',
                ephemeral: true
            }).catch(console.error);
        } else if (interaction.deferred && !interaction.replied) {
            await interaction.editReply({
                content: 'An error occurred while processing your submission.'
            }).catch(console.error);
        }
    }
}

async function handleDmRoleModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
    // Check permissions again
    const member = interaction.guild?.members.cache.get(interaction.user.id);
    if (!member || !member.roles.cache.some(role => config.permissions.admin?.includes(role.id))) {
        await interaction.reply({
            content: 'You do not have permission to DM members.',
            ephemeral: true
        });
        return;
    }

    await interaction.deferReply({ ephemeral: true });

    // Extract role ID from the modal ID
    const roleId = interaction.customId.split(':')[1];
    const role = interaction.guild?.roles.cache.get(roleId);

    if (!role) {
        await interaction.editReply({ content: 'Role not found. It may have been deleted.' });
        return;
    }

    // Get the message content
    const messageSubject = interaction.fields.getTextInputValue('message_subject');
    const messageContent = interaction.fields.getTextInputValue('message_content');

    // Get all members with this role
    const membersWithRole = interaction.guild?.members.cache.filter(member =>
        member.roles.cache.has(roleId)
    );

    if (!membersWithRole || membersWithRole.size === 0) {
        await interaction.editReply({ content: `No members found with the role ${role.name}.` });
        return;
    }

    await interaction.editReply({
        content: `Preparing to send DM to ${membersWithRole.size} members with role ${role.name}...`
    });

    // Process members in chunks
    const options: ProcessingOptions = {
        totalItems: membersWithRole.size,
        chunkSize: 5, // Process 5 users at a time
        initialMessage: `Sending DMs to ${membersWithRole.size} members...`,
        progressInterval: 10, // Update progress every 10%
        completionMessage: "Finished sending all DMs."
    };

    const results = {
        success: 0,
        failed: 0
    };

    const memberArray = Array.from(membersWithRole.values());

    await processInChunks(
        interaction,
        memberArray,
        async (guildMember, index) => {
            try {
                // Add delay to avoid rate limits
                await new Promise(r => setTimeout(r, 500 * (index % 5)));

                // Create a nice embed for the DM
                const dmEmbed = createBaseEmbed()
                    .setTitle(messageSubject)
                    .setDescription(messageContent)
                    .setFooter({ text: `Sent by ${interaction.user.tag} from ${interaction.guild?.name}` })
                    .setTimestamp();

                try {
                    // Try to DM the user
                    await guildMember.user.send({ embeds: [dmEmbed] });
                    results.success++;

                    // Log the action
                    logAction(
                        'DM',
                        interaction.user,
                        `DM sent to ${guildMember.user.tag} from role ${role.name}`,
                        null
                    );
                } catch (err) {
                    results.failed++;
                    // Provide a cleaner error message
                    if (err.code === 50007) {
                        console.log(`Could not DM user ${guildMember.user.tag}: User has DMs disabled`);
                    } else {
                        console.log(`Could not DM user ${guildMember.user.tag}: ${err.message || "Unknown error"}`);
                    }
                }
            } catch (err) {
                console.error(`Error processing member ${guildMember.user.tag}:`, err);
                results.failed++;
            }

            return null;
        },
        options
    );

    // Create results embed
    const resultsEmbed = createBaseEmbed()
        .setTitle('DM Operation Results')
        .setDescription(`DM operation complete for ${membersWithRole.size} members with role ${role.name}.`)
        .addFields(
            { name: 'Successfully Sent', value: `${results.success}`, inline: true },
            { name: 'Failed to Send', value: `${results.failed}`, inline: true }
        )
        .setTimestamp();

    // Send results
    await interaction.followUp({
        content: 'DM operation complete.',
        embeds: [resultsEmbed],
        ephemeral: false
    });
}

async function handleDmMatchedMembersModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
    // Check permissions again
    const member = interaction.guild?.members.cache.get(interaction.user.id);
    if (!member || !member.roles.cache.some(role => config.permissions.admin?.includes(role.id))) {
        await interaction.reply({
            content: 'You do not have permission to DM members.',
            ephemeral: true
        });
        return;
    }

    await interaction.deferReply({ ephemeral: true });

    // Extract info from the modal ID
    const [_, groupId, userId] = interaction.customId.split(':');

    // Get the message content
    const messageSubject = interaction.fields.getTextInputValue('message_subject');
    const messageContent = interaction.fields.getTextInputValue('message_content');

    // Get the cached Discord IDs
    const cacheKey = `${groupId}:${userId}`;
    const discordIdsToMessage = global.matchedDiscordCache?.[cacheKey] || [];

    if (discordIdsToMessage.length === 0) {
        await interaction.editReply({
            content: 'No members found to message. The data may have expired.'
        });
        return;
    }

    await interaction.editReply({
        content: `Preparing to send DM to ${discordIdsToMessage.length} matched members...`
    });

    const results = {
        success: 0,
        failed: 0,
        notFound: 0
    };

    // Process each Discord ID
    for (const discordId of discordIdsToMessage) {
        try {
            // Try to get the member
            const member = await interaction.guild?.members.fetch(discordId).catch(() => null);

            if (!member) {
                results.notFound++;
                continue;
            }

            // Create a nice embed for the DM
            const dmEmbed = createBaseEmbed()
                .setTitle(messageSubject)
                .setDescription(messageContent)
                .setFooter({ text: `Sent by ${interaction.user.tag} from ${interaction.guild?.name || 'the server'}` })
                .setTimestamp();

            try {
                // Try to DM the user
                await member.send({ embeds: [dmEmbed] });
                results.success++;

                // Log the action
                logAction(
                    'DM',
                    interaction.user,
                    `DM sent to ${member.user.tag} via comparegroups command`,
                    null
                );
            } catch (err) {
                results.failed++;
                // Provide a cleaner error message
                if (err.code === 50007) {
                    console.log(`Could not DM user ${member.user.tag}: User has DMs disabled`);
                } else {
                    console.log(`Could not DM user ${member.user.tag}: ${err.message || "Unknown error"}`);
                }
            }

            // Add a small delay to avoid rate limits
            await new Promise(r => setTimeout(r, 500));
        } catch (err) {
            console.error(`Error processing discord ID ${discordId}:`, err);
            results.failed++;
        }
    }

    // Create results embed
    const resultsEmbed = createBaseEmbed()
        .setTitle('DM Operation Results')
        .setDescription(`DM operation complete for ${discordIdsToMessage.length} matched members.`)
        .addFields(
            { name: 'Successfully Sent', value: `${results.success}`, inline: true },
            { name: 'Failed to Send', value: `${results.failed}`, inline: true },
            { name: 'Users Not Found', value: `${results.notFound}`, inline: true }
        )
        .setTimestamp();

    // Send results
    await interaction.followUp({
        content: 'DM operation complete.',
        embeds: [resultsEmbed],
        ephemeral: false
    });
}

// Original DM modal for Roblox user DMs (keep if needed)
async function handleDmModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
    // Check permissions
    const member = interaction.guild?.members.cache.get(interaction.user.id);
    if (!member || !member.roles.cache.some(role => config.permissions.admin?.includes(role.id))) {
        await interaction.reply({
            content: 'You do not have permission to DM members.',
            ephemeral: true
        });
        return;
    }

    await interaction.deferReply({ ephemeral: true });

    // Extract info from the modal ID
    const [_, groupId, userId] = interaction.customId.split(':');

    // Get the message content
    const messageSubject = interaction.fields.getTextInputValue('message_subject');
    const messageContent = interaction.fields.getTextInputValue('message_content');

    // Get the cached members
    const cacheKey = `${groupId}:${userId}`;
    const membersToDm = global.matchedMembersCache?.[cacheKey] || [];

    if (!membersToDm.length) {
        await interaction.editReply({
            content: 'No members found to DM. The data may have expired.'
        });
        return;
    }

    await interaction.editReply({
        content: `Preparing to send DM to ${membersToDm.length} members...`
    });

    // Process members in chunks
    const options: ProcessingOptions = {
        totalItems: membersToDm.length,
        chunkSize: 3, // Process 3 users at a time
        initialMessage: `Sending DMs to ${membersToDm.length} members...`,
        progressInterval: 10, // Update progress every 10%
        completionMessage: "Finished sending all DMs."
    };

    const results = {
        success: 0,
        failed: 0,
        notFound: 0
    };

    await processInChunks(
        interaction,
        membersToDm,
        async (userId, index) => {
            try {
                // Add delay to avoid rate limits
                await new Promise(r => setTimeout(r, 1000 * (index % 3)));

                // Get Roblox user info
                const robloxUser = await robloxClient.getUser(userId);

                // Create a nice embed for the DM
                const dmEmbed = createBaseEmbed()
                    .setTitle(messageSubject)
                    .setDescription(messageContent)
                    .setFooter({ text: `Sent by ${interaction.user.tag}` })
                    .setTimestamp();

                // Since this handler is for Roblox users, you'd need to implement
                // your own logic to find associated Discord users
                // This is a placeholder for that implementation
                results.notFound++;
            } catch (err) {
                console.error(`Error processing user ${userId}:`, err);
                results.failed++;
            }

            return null;
        },
        options
    );

    // Create results embed
    const resultsEmbed = createBaseEmbed()
        .setTitle('DM Operation Results')
        .setDescription(`DM operation complete for ${membersToDm.length} users.`)
        .addFields(
            { name: 'Successfully Sent', value: `${results.success}`, inline: true },
            { name: 'Failed to Send', value: `${results.failed}`, inline: true },
            { name: 'Users Not Found', value: `${results.notFound}`, inline: true }
        )
        .setTimestamp();

    // Send results
    await interaction.followUp({
        content: 'DM operation complete.',
        embeds: [resultsEmbed],
        ephemeral: false
    });
}