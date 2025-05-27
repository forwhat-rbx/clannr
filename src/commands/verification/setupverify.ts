import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { createBaseEmbed } from '../../utils/embedUtils';
import { config } from '../../config';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } from 'discord.js';
import { Logger } from '../../utils/logger';
import { prisma } from '../../database/prisma';
import { initializeDatabase } from '../../database/dbInit';

class SetupVerifyCommand extends Command {
    constructor() {
        super({
            trigger: 'setupverify',
            description: 'Set up a verification channel.',
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
                .setTitle('Sistema de verificação')
                .setDescription(
                    '**Bem-vindo ao nosso sistema de verificação!**\n\n' +
                    'Para obter acesso ao servidor, você precisa verificar sua conta Roblox.\n\n' +
                    '**Como verificar:**\n' +
                    '1. Clique no botão "Verify" abaixo\n' +
                    '2. Digite seu nome de usuário do Roblox quando solicitado\n' +
                    '3. Adicione o código de verificação ao seu perfil do Roblox\n' +
                    '4. Clique no botão de verificação na DM\n\n' +
                    'Depois de verificado, você receberá automaticamente as funções apropriadas com base na classificação do seu grupo.'
                );

            // Create the verification button
            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('verify')
                        .setLabel('Verificar')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('✅')
                );

            // Send the verification embed and save the message ID
            const message = await channel.send({
                embeds: [verifyEmbed],
                components: [row]
            });

            // Try to save the verification setup to the database
            await this.saveVerificationSetup(ctx, channel, message);

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

    // Helper method to save verification setup to database with retry logic
    private async saveVerificationSetup(ctx: CommandContext, channel: any, message: any) {
        try {
            // Try to store the verification channel and message ID in the database
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
        } catch (dbError) {
            Logger.error('Database error in setupverify command', 'SetupVerifyCommand', dbError);

            // If the table doesn't exist, try to initialize the database
            if (dbError.code === 'P2021') {
                return this.handleMissingTable(ctx, channel, message);
            }

            // For other database errors
            return ctx.reply({
                embeds: [
                    createBaseEmbed('danger')
                        .setTitle('Database Error')
                        .setDescription(`The verification channel was created, but I couldn't save it to the database: ${dbError.message}`)
                ],
                ephemeral: true
            });
        }
    }

    // Helper method to handle missing database table
    private async handleMissingTable(ctx: CommandContext, channel: any, message: any) {
        try {
            Logger.info('Attempting to initialize missing database tables', 'SetupVerifyCommand');
            await initializeDatabase();

            // Wait a moment for database to finish initializing
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Try again after initialization
            try {
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

                // Success after retry
                return ctx.reply({
                    embeds: [
                        createBaseEmbed('success')
                            .setTitle('Verification Channel Setup')
                            .setDescription(`Successfully set up verification in <#${channel.id}>! (Database was initialized)`)
                    ],
                    ephemeral: true
                });
            } catch (upsertError) {
                // Handle error from the second upsert attempt
                return this.handleManualTableCreation(ctx, channel, message, upsertError);
            }
        } catch (initError) {
            // Database initialization failed
            Logger.error('Failed to initialize database', 'SetupVerifyCommand', initError);
            return ctx.reply({
                embeds: [
                    createBaseEmbed('danger')
                        .setTitle('Database Error')
                        .setDescription('The verification channel was created, but I couldn\'t initialize the database. Please contact the bot administrator.')
                ],
                ephemeral: true
            });
        }
    }

    // Helper method for manual table creation as last resort
    private async handleManualTableCreation(ctx: CommandContext, channel: any, message: any, error: any) {
        Logger.error('Failed to upsert after database initialization', 'SetupVerifyCommand', error);

        // Try a manual SQL approach as a last resort
        try {
            await prisma.$executeRaw`
            CREATE TABLE IF NOT EXISTS "GuildConfig" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "guildId" TEXT NOT NULL UNIQUE,
                "nicknameFormat" TEXT NOT NULL DEFAULT '{robloxUsername}',
                "verificationChannelId" TEXT,
                "verificationMessageId" TEXT
            )`;

            // Try one more time after direct SQL creation
            await prisma.guildConfig.upsert({
                where: { guildId: ctx.guild.id },
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

            return ctx.reply({
                embeds: [
                    createBaseEmbed('success')
                        .setTitle('Verification Channel Setup')
                        .setDescription(`Successfully set up verification in <#${channel.id}>! (Manual database initialization)`)
                ],
                ephemeral: true
            });
        } catch (finalError) {
            return ctx.reply({
                embeds: [
                    createBaseEmbed('danger')
                        .setTitle('Database Error')
                        .setDescription('The verification channel was created, but I couldn\'t save it to the database. Please contact the bot administrator to initialize the database.')
                ],
                ephemeral: true
            });
        }
    }
}

export default SetupVerifyCommand;