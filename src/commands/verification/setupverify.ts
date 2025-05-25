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
                .setTitle('Sistema de verificação')
                .setDescription(
                    '**Bem-vindo ao nosso sistema de verificação!**\n\n' +
                    'Para obter acesso ao servidor, você precisa verificar sua conta Roblox.\n\n' +
                    '**Como verificar:**\n' +
                    '1. Clique no botão “Verify” abaixo\n' +
                    '2. Digite seu nome de usuário do Roblox quando solicitado\n' +
                    '3. Adicione o código de verificação ao seu perfil do Roblox\n' +
                    '4. Clique no botão de verificação no DM\n\n' +
                    'Depois de verificado, você receberá automaticamente as funções apropriadas com base na classificação do seu grupo.'
                )

            // Create the verification button
            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('verify_start')
                        .setLabel('Verificar')
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