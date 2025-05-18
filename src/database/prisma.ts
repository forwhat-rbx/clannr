import { PrismaClient } from '@prisma/client';
import { DatabaseProvider } from '../structures/DatabaseProvider';
import { DatabaseUser } from '../structures/types';
import { ActivityLogger } from '../utils/activityLogger';
import { robloxClient } from '../main';
import { discordClient } from '../main';

require('dotenv').config();

class PrismaProvider extends DatabaseProvider {
    db: PrismaClient;

    constructor() {
        super();
        this.db = new PrismaClient();
    }

    async findUser(robloxId: string): Promise<DatabaseUser> {
        let userData = await this.db.user.findUnique({ where: { robloxId } });
        if (!userData) userData = await this.db.user.create({ data: { robloxId } });
        return userData;
    }

    async findSuspendedUsers(): Promise<DatabaseUser[]> {
        return await this.db.user.findMany({ where: { suspendedUntil: { not: null } } });
    }

    async findBannedUsers(): Promise<DatabaseUser[]> {
        return await this.db.user.findMany({ where: { isBanned: true } });
    }

    async updateUser(robloxId: string, data: any) {
        try {
            let userData = await this.db.user.findUnique({ where: { robloxId } });
            if (!userData) userData = await this.db.user.create({ data: { robloxId } });

            // Create a clean update object with only valid fields
            const updateData = {};

            // First copy known valid fields that exist in the schema
            const validFields = [
                'xp', 'raids', 'defenses', 'scrims', 'trainings',
                'lastRaid', 'lastDefense', 'lastScrim', 'lastTraining', 'lastActivity',
                'suspendedUntil', 'unsuspendRank', 'isBanned'
            ];

            for (const key of validFields) {
                if (key in data) {
                    updateData[key] = data[key];
                }
            }

            // Update the user with only valid fields
            return await this.db.user.update({
                where: { robloxId },
                data: updateData
            });
        } catch (error) {
            console.error(`Failed to update user ${robloxId}:`, error);
            // Return the user or null so the command doesn't completely crash
            return await this.db.user.findUnique({ where: { robloxId } });
        }
    }

    async getAllUsers(): Promise<DatabaseUser[]> {
        return await this.db.user.findMany();
    }

    async deleteUser(robloxId: string) {
        return await this.db.user.delete({ where: { robloxId } });
    }

    async safeDeleteUser(robloxId: string) {
        try {
            // First delete all related records in a transaction
            await this.db.$transaction([
                // Delete any XP logs referencing this user
                this.db.xpLog.deleteMany({
                    where: { robloxId }
                }),

                // Finally delete the user
                this.db.user.delete({
                    where: { robloxId }
                })
            ]);

            return true;
        } catch (error) {
            console.error(`Error in safeDeleteUser for ${robloxId}:`, error);
            throw error; // Re-throw to handle in the command
        }
    }

    async getXpLogs(limit: number = 1000) {
        return await this.db.xpLog.findMany({
            orderBy: {
                timestamp: 'desc'
            },
            take: limit
        });
    }

    async logXpChange(robloxId: string, amount: number, reason?: string, discordUserId?: string) {
        try {

            // Create database entry
            const result = await this.db.xpLog.create({
                data: {
                    robloxId,
                    amount,
                    reason,
                    timestamp: new Date()
                }
            });

            // Extract moderator info
            let moderatorId = discordUserId || "Unknown";
            let moderatorName = "Unknown";

            // If we have a Discord ID, try to get the username
            if (discordUserId) {
                try {
                    const discordUser = await discordClient.users.fetch(discordUserId);
                    moderatorName = discordUser.tag || discordUser.username;
                } catch (err) {
                    console.error(`[ERROR] Failed to fetch Discord user for ID ${discordUserId}:`, err);

                    // Try to parse moderator from reason string as fallback
                    if (reason) {
                        const moderatorMatch = reason.match(/by\s+([^)]+)/i);
                        if (moderatorMatch) {
                            moderatorName = moderatorMatch[1].trim();
                        }
                    }
                }
            }
            // If no Discord ID provided, try to parse from reason
            else if (reason) {
                const moderatorMatch = reason.match(/by\s+([^)]+)/i);
                if (moderatorMatch) {
                    moderatorName = moderatorMatch[1].trim();
                }
            }

            // Get target user name if possible
            let targetName = robloxId;
            try {
                const targetUser = await robloxClient.getUser(Number(robloxId));
                if (targetUser) {
                    targetName = targetUser.name;
                }
            } catch (err) {
                console.log(`[DEBUG] Failed to get Roblox username for ID ${robloxId}`);
            }

            // Log to ActivityLogger if available
            try {
                const success = await ActivityLogger.logAction(moderatorId, moderatorName, {
                    timestamp: new Date(),
                    action: "XP Change",
                    target: robloxId,
                    targetName,
                    details: `${amount > 0 ? '+' : ''}${amount} XP`,
                    reason
                });

                if (success) {
                    console.log(`[DEBUG] Successfully logged action to ActivityLogger`);
                } else {
                    console.error(`[ERROR] Failed to log action to ActivityLogger`);
                }
            } catch (err) {
                console.error(`[ERROR] Error using ActivityLogger:`, err);
            }

            return result;
        } catch (error) {
            console.error(`[ERROR] Error in logXpChange:`, error);
            throw error;
        }
    }
}

export { PrismaProvider };