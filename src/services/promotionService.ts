import { TextChannel, User as DiscordUser } from 'discord.js';
import { config } from '../config';
import { robloxClient, robloxGroup, discordClient } from '../main';
import { provider } from '../database';
import { createBaseEmbed } from '../utils/embedUtils';
import { findHighestEligibleRole, getRankName } from '../commands/ranking/xprankup';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { safeUpdateMember } from '../utils/robloxUtils';
import { logSystemAction, logAction as legacyLogAction } from '../handlers/handleLogging';
import { PartialUser, User as RobloxUser } from 'bloxy/dist/structures';
import { Logger } from '../utils/logger';


export class promotionService {
    public static instance: promotionService;
    public pendingPromotions: Array<{ robloxId: string; name: string; currentRank: string; newRank: string; roleId: number }> = [];
    public lastMessageId: string | null = null;

    private constructor() { }

    public static getInstance(): promotionService {
        if (!promotionService.instance) {
            promotionService.instance = new promotionService();
        }
        return promotionService.instance;
    }

    private async purgeChannel(channel: TextChannel): Promise<void> {
        const actor = "Promotion Service";
        logSystemAction('Channel Purge Start', actor, undefined, undefined, `Attempting to purge messages from promotion channel #${channel.name} (${channel.id}).`);
        try {
            const messages = await channel.messages.fetch({ limit: 100 });
            const messagesToDelete = messages.filter(msg => !(this.lastMessageId && msg.id === this.lastMessageId));

            if (messagesToDelete.size === 0) {
                logSystemAction('Channel Purge Info', actor, undefined, undefined, `No messages to purge in #${channel.name}.`);
                return;
            }

            const twoWeeksAgo = Date.now() - 13 * 24 * 60 * 60 * 1000;
            const recentMessages = messagesToDelete.filter(msg => msg.createdTimestamp > twoWeeksAgo);
            const oldMessages = messagesToDelete.filter(msg => msg.createdTimestamp <= twoWeeksAgo);

            let purgedCount = 0;
            let failedCount = 0;

            // Handle bulk deletion for recent messages
            if (recentMessages.size > 0) {
                try {
                    const deletedMessages = await channel.bulkDelete(recentMessages, true);
                    purgedCount += deletedMessages.size;
                    logSystemAction('Channel Purge Success', actor, undefined, undefined,
                        `Bulk deleted ${deletedMessages.size} recent messages from #${channel.name}.`);
                } catch (bulkError) {
                    logSystemAction('Channel Purge Error', actor,
                        `Failed to bulk delete recent messages from #${channel.name}.`, undefined, bulkError.message);
                }
            }

            // Handle individual deletion for older messages
            if (oldMessages.size > 0) {
                logSystemAction('Channel Purge Info', actor, undefined, undefined,
                    `Attempting to delete ${oldMessages.size} old messages individually from #${channel.name}.`);

                // Delete older messages one by one with better error handling
                for (const message of oldMessages.values()) {
                    try {
                        await message.delete();
                        purgedCount++;
                    } catch (err) {
                        // Don't log every individual error, just count them
                        failedCount++;

                        // Only log serious errors, not "Unknown Message" errors
                        if (err.message !== "Unknown Message") {
                            logSystemAction('Channel Purge Error', actor,
                                `Failed to delete message from #${channel.name}.`, undefined, err.message);
                        }
                    }
                }

                // Log a summary of individual deletions
                if (failedCount > 0) {
                    logSystemAction('Channel Purge Info', actor, undefined, undefined,
                        `Deleted ${purgedCount - (recentMessages.size || 0)} old messages, ${failedCount} deletions failed (message may no longer exist).`);
                } else if (purgedCount > recentMessages.size) {
                    logSystemAction('Channel Purge Success', actor, undefined, undefined,
                        `Successfully deleted ${purgedCount - recentMessages.size} old messages from #${channel.name}.`);
                }
            }

            // Log final summary
            logSystemAction('Channel Purge Complete', actor, undefined, undefined,
                `Total messages purged: ${purgedCount}, Failed: ${failedCount} from #${channel.name}.`);

        } catch (err) {
            logSystemAction('Channel Purge Error', actor, `Error purging promotion channel #${channel.name}.`, undefined, err.message);
        }
    }

    public async checkForPromotions(): Promise<void> {
        const actor = "Promotion Service";
        logSystemAction('Promotion Check Start', actor, undefined, undefined, 'System automatically checking for eligible promotions.');
        try {
            if (!robloxGroup) {
                logSystemAction('Promotion Check Error', actor, undefined, undefined, 'Roblox group not initialized.');
                return;
            }

            this.pendingPromotions = []; // Clear before check
            const groupRoles = await robloxGroup.getRoles();
            const allUsers = await provider.getAllUsers();

            for (const userData of allUsers) {
                try {
                    const robloxId = Number(userData.robloxId);
                    const robloxUser = await robloxClient.getUser(robloxId);
                    const robloxMember = await robloxGroup.getMember(robloxUser.id);

                    if (!robloxMember) continue;

                    const nextRole = await findHighestEligibleRole(robloxMember, groupRoles, userData.xp);
                    if (nextRole && nextRole.rank > robloxMember.role.rank) {
                        this.pendingPromotions.push({
                            robloxId: userData.robloxId,
                            name: robloxUser.name,
                            currentRank: robloxMember.role.name,
                            newRank: getRankName(nextRole.rank, groupRoles),
                            roleId: nextRole.id
                        });
                    }
                } catch (err) {
                    logSystemAction('Promotion Check Error', actor, `Error processing user ${userData.robloxId} during promotion check.`, undefined, err.message);
                }
            }

            logSystemAction('Promotion Check Finish', actor, undefined, undefined, `Found ${this.pendingPromotions.length} users eligible for promotion.`);
            await this.updatePromotionEmbed();
        } catch (err) {
            logSystemAction('Promotion Check Error', actor, 'Overall error during checkForPromotions.', undefined, err.message);
        }
    }

    public async updatePromotionEmbed(): Promise<void> {
        const actor = "Promotion Service";
        const channelId = '1389399967478710272'; //promotion check

        console.log(`[PROMOTION DEBUG] Using channel ID: ${channelId} for promotions`);
        Logger.info(`Using channel ID: ${channelId} for promotions`, 'PromotionService');



        if (!channelId) {
            console.error('[PROMOTION ERROR] No channel ID configured');
            logSystemAction('Embed Update Error', actor, undefined, undefined, 'Promotion channel ID not configured.');
            return;
        }

        let channel: TextChannel | null = null;
        try {
            console.log(`[PROMOTION DEBUG] Fetching channel ${channelId}`);
            // Add better error handling for channel fetching
            const fetchedChannel = await discordClient.channels.fetch(channelId).catch(err => {
                console.error(`[PROMOTION ERROR] Failed to fetch channel: ${err.message}`);
                return null;
            });

            if (!fetchedChannel) {
                console.error(`[PROMOTION ERROR] Channel ${channelId} not found`);
                logSystemAction('Embed Update Error', actor, undefined, undefined, `Failed to fetch channel ${channelId}`);
                return;
            }

            if (!fetchedChannel.isTextBased()) {
                console.error(`[PROMOTION ERROR] Channel ${channelId} is not a text channel`);
                logSystemAction('Embed Update Error', actor, undefined, undefined, `Channel ${channelId} is not a text channel`);
                return;
            }

            channel = fetchedChannel as TextChannel;
            console.log(`[PROMOTION DEBUG] Successfully fetched channel #${channel.name}`);
        } catch (err) {
            console.error(`[PROMOTION ERROR] Error fetching channel: ${err.message}`);
            logSystemAction('Embed Update Error', actor, `Failed to fetch promotion channel ${channelId}.`, undefined, err.message);
            return;
        }

        logSystemAction('Embed Update Start', actor, undefined, undefined, `Updating promotion embed in #${channel.name}.`);
        await this.purgeChannel(channel); // Purge happens before sending/editing

        const embed = this.createPromotionEmbed();
        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('promote_all')
                    .setLabel(`Promote All (${this.pendingPromotions.length})`)
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(this.pendingPromotions.length === 0),
                new ButtonBuilder()
                    .setCustomId('check_promotions')
                    .setLabel('Check for Promotions')
                    .setStyle(ButtonStyle.Primary)
            );

        try {
            if (this.lastMessageId) {
                try {
                    const message = await channel.messages.fetch(this.lastMessageId);
                    await message.edit({ embeds: [embed], components: [row] });
                    logSystemAction('Embed Update Success', actor, undefined, undefined, `Edited existing promotion embed in #${channel.name}.`);
                    return;
                } catch {
                    logSystemAction('Embed Update Info', actor, undefined, undefined, `Previous promotion message ${this.lastMessageId} not found. Sending new one.`);
                    this.lastMessageId = null;
                }
            }

            const message = await channel.send({ embeds: [embed], components: [row] });
            this.lastMessageId = message.id;
            logSystemAction('Embed Update Success', actor, undefined, undefined, `Sent new promotion embed to #${channel.name}. Message ID: ${message.id}`);
        } catch (err) {
            logSystemAction('Embed Update Error', actor, `Failed to send or edit promotion embed in #${channel.name}.`, undefined, err.message);
        }
    }

    private createPromotionEmbed(): EmbedBuilder {
        const embed = createBaseEmbed('primary') // Assuming this is defined elsewhere
            .setTitle('Pending Promotions')
            .setDescription(
                this.pendingPromotions.length > 0
                    ? this.pendingPromotions.map(p => `[${p.name}](https://www.roblox.com/users/${p.robloxId}/profile): ${p.currentRank} → ${p.newRank}`).join('\n')
                    : 'No users are currently eligible for promotion.'
            )
            .setTimestamp();
        return embed;
    }

    public async executePromotions(staffDiscordId: string): Promise<number> {
        let staffActor: DiscordUser | string = staffDiscordId; // Default to ID if user fetch fails
        let staffDiscordUser: DiscordUser | undefined;
        try {
            staffDiscordUser = await discordClient.users.fetch(staffDiscordId);
            if (staffDiscordUser) staffActor = staffDiscordUser;
        } catch (fetchErr) {
            logSystemAction('Promotion Execution Warning', 'Promotion Service', `Could not fetch Discord user for staff ID ${staffDiscordId}. Logging with ID only.`, undefined, fetchErr.message);
        }

        if (this.pendingPromotions.length === 0) {
            // Use legacyLogAction if you want this specific action by a user to appear in Discord logs via getLogEmbed
            // Or logSystemAction if console/file log is sufficient
            legacyLogAction('Promotion Execution Info', staffActor, undefined, undefined, 'No pending promotions to execute.');
            return 0;
        }

        let successCount = 0;
        const initialPendingCount = this.pendingPromotions.length; // Store initial count

        // Create a temporary list to iterate over, so we can modify the main list
        const promotionsToExecute = [...this.pendingPromotions];
        this.pendingPromotions = []; // Clear the main list immediately

        for (const promotion of promotionsToExecute) {
            let robloxUser: RobloxUser | PartialUser | undefined;
            try {
                robloxUser = await robloxClient.getUser(Number(promotion.robloxId));
                await safeUpdateMember(Number(promotion.robloxId), promotion.roleId);
                // Log individual success using legacyLogAction to ensure it uses getLogEmbed for Discord channel
                legacyLogAction('XP Rankup', staffActor, `Promoted via 'Promote All' button.`, robloxUser, `${promotion.currentRank} → ${promotion.newRank}`);
                successCount++;
            } catch (err) {
                // Log individual failure
                legacyLogAction('Promotion Execution Error', staffActor, `Failed to promote user ${promotion.name} (${promotion.robloxId}).`, robloxUser, err.message);
            }
        }

        this.lastMessageId = null; // Force new message after promotions attempt

        await this.updatePromotionEmbed(); // This will now show an empty list or new pending ones if any occurred during execution
        return successCount;
    }
}

export function schedulePromotionChecks(): void {
    const service = promotionService.getInstance();
    const schedulerActor = "System Scheduler";

    const attemptCheck = async (retries = 3, delay = 10000) => {
        try {
            if (!robloxGroup) {
                if (retries > 0) {
                    logSystemAction('Scheduler Info', schedulerActor, undefined, undefined, `Roblox group not initialized for promotion service, retrying in ${delay / 1000}s... (${retries} retries left).`);
                    setTimeout(() => attemptCheck(retries - 1, delay), delay);
                    return;
                }
                logSystemAction('Scheduler Error', schedulerActor, undefined, undefined, 'Failed to initialize promotion service after multiple retries: Roblox group unavailable.');
                return;
            }

            logSystemAction('Scheduler Info', schedulerActor, undefined, undefined, 'Promotion service initial check starting.');
            await service.checkForPromotions(); // This will log its own start/finish
            logSystemAction('Scheduler Info', schedulerActor, undefined, undefined, 'Promotion service initialized successfully. Scheduling periodic tasks.');

            setInterval(() => {
                logSystemAction('Scheduled Task Trigger', schedulerActor, undefined, undefined, '24-hour promotion check initiated.');
                service.checkForPromotions();
            }, 24 * 60 * 60 * 1000);

            setInterval(async () => {
                logSystemAction('Scheduled Task Trigger', schedulerActor, undefined, undefined, '6-hour embed update and channel purge initiated.');
                try {
                    const channelId = config.logChannels.actions;
                    if (!channelId) {
                        logSystemAction('Scheduled Task Error', schedulerActor, undefined, undefined, 'Promotion channel ID not configured for 6-hour cleanup.');
                        return;
                    }
                    const channel = await discordClient.channels.fetch(channelId) as TextChannel;
                    if (channel && channel.isTextBased()) {
                        await service.updatePromotionEmbed(); // This will log its own start/finish
                    } else {
                        logSystemAction('Scheduled Task Error', schedulerActor, undefined, undefined, `Promotion channel ${channelId} not found or not text-based for 6-hour cleanup.`);
                    }
                } catch (err) {
                    logSystemAction('Scheduled Task Error', schedulerActor, 'Error during 6-hour periodic channel cleanup.', undefined, err.message);
                }
            }, 6 * 60 * 60 * 1000);

        } catch (err) {
            logSystemAction('Scheduler Error', schedulerActor, 'Error initializing promotion service.', undefined, err.message);
        }
    };
    attemptCheck();
}