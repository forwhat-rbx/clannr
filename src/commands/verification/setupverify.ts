import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { createBaseEmbed } from '../../utils/embedUtils';
import { config } from '../../config';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } from 'discord.js';
import { Logger } from '../../utils/logger';
import { prisma } from '../../database/prisma';

class SetupVerifyCommand extends Command {
    constructor() {
        super({
            trigger: 'setupverify',
            description: 'Set up a verification channel with persistent embed',
            type: 'ChatInput',
            module: 'verification',
            args: [
                {
                    trigger: 'channel',
                    description: 'The channel to set up verification in',
                    type: 'DiscordChannel',
                    required: true
                }
            ],
            permissions: [
                {
                    type: 'role',
                    ids: config.permissions.admin,
                    value: true,
                }
            ],
            enabled: true
        });
    }

    async run(ctx: CommandContext) {
        try {
            await ctx.defer();

            const channelId = ctx.args['channel'] as string;

            // Verify the channel exists and is a text channel
            const channel = await ctx.guild.channels.fetch(channelId);
            if (!channel || !channel.isTextBased() || channel.isThread()) {
                return ctx.reply({
                    embeds: [
                        createBaseEmbed('danger')
                            .setTitle('Invalid Channel')
                            .setDescription('Please select a valid text channel for verification.')
                    ],
                    ephemeral: true
                });
            }

            // Check bot permissions in the channel
            const permissions = channel.permissionsFor(ctx.guild.members.me);
            if (!permissions.has([
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks
            ])) {
                return ctx.reply({
                    embeds: [
                        createBaseEmbed('danger')
                            .setTitle('Missing Permissions')
                            .setDescription('I need permissions to view the channel, send messages, and embed links in the selected channel.')
                    ],
                    ephemeral: true
                });
            }

            // Create the verification embed
            const verifyEmbed = createBaseEmbed()
                .setTitle('Verification System')
                .setDescription(
                    '**Welcome to our verification system!**\n\n' +
                    'To gain access to the server, you need to verify your Roblox account.\n\n' +
                    '**How to verify:**\n' +
                    '1. Click the "Verify" button below\n' +
                    '2. Enter your Roblox username when prompted\n' +
                    '3. Add the verification code to your Roblox profile\n' +
                    '4. Click the verification button in the DM\n\n' +
                    'Once verified, you\'ll automatically receive the appropriate roles based on your group rank.'
                )
                .setImage('https://i.imgur.com/6YTtbDY.png') // Optional: Add a verification guide image
                .setFooter({ text: 'Questions? Contact a server admin for help.' });

            // Create the verification button
            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('verify_start')
                        .setLabel('Verify')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('✅')
                );

            // Send the verification embed and save the message ID
            const message = await channel.send({
                embeds: [verifyEmbed],
                components: [row]
            });

            // Store the verification channel and message ID in the database
            // First update the guild config schema to include these fields
            await prisma.guildConfig.upsert({
                where: {
                    guildId: ctx.guild.id
                },
                update: {
                    verificationChannelId: channel.id,
                    verificationMessageId: message.id
                },
                create: {
                    id: ctx.guild.id,
                    guildId: ctx.guild.id,
                    nicknameFormat: '{robloxUsername}',
                    verificationChannelId: channel.id,
                    verificationMessageId: message.id
                }
            });

            // Confirm setup success
            return ctx.reply({
                embeds: [
                    createBaseEmbed('success')
                        .setTitle('Verification Channel Setup')
                        .setDescription(`Successfully set up verification in <#${channel.id}>!`)
                ],
                ephemeral: true
            });
        } catch (err) {
            Logger.error('Error in setupverify command', 'SetupVerifyCommand', err);
            return ctx.reply({
                embeds: [
                    createBaseEmbed('danger')
                        .setTitle('Setup Error')
                        .setDescription(`An error occurred while setting up verification: ${err.message}`)
                ],
                ephemeral: true
            });
        }
    }
}

export default SetupVerifyCommand;