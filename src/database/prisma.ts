import { PrismaClient } from '@prisma/client';
import { DatabaseProvider } from '../structures/DatabaseProvider';
import { DatabaseUser } from '../structures/types';
import { ActivityLogger } from '../utils/activityLogger';
import { robloxClient } from '../main';
import { discordClient } from '../main';
import { Logger } from '../utils/logger';

require('dotenv').config();

export const prisma = new PrismaClient();

class PrismaProvider extends DatabaseProvider {
    db: PrismaClient;

    constructor() {
        super();
        this.db = prisma;
    }

    async findUser(robloxId: string): Promise<DatabaseUser> {
        console.log(`[DB DEBUG] Looking up user with Roblox ID: ${robloxId}`);

        // Always use string format for IDs to ensure consistency
        const idString = String(robloxId);

        let userData = await this.db.user.findUnique({
            where: { robloxId: idString }
        });

        console.log(`[DB DEBUG] Found user data:`, userData ? 'yes' : 'no');

        if (!userData) {
            console.log(`[DB DEBUG] Creating new user record for ${idString}`);
            userData = await this.db.user.create({
                data: {
                    robloxId: idString,
                    xp: 0
                }
            });
        }

        // Ensure XP is always a number
        if (userData) {
            userData.xp = Number(userData.xp || 0);
        }

        return userData;
    }

    async updateUser(robloxId: string, data: any) {
        try {
            console.log(`[DB DEBUG] Updating user ${robloxId} with data:`, data);

            // Always use string format for IDs to ensure consistency
            const idString = String(robloxId);

            // Ensure we have a user record
            let userData = await this.db.user.findUnique({ where: { robloxId: idString } });
            if (!userData) {
                console.log(`[DB DEBUG] Creating user during update as they don't exist: ${idString}`);
                userData = await this.db.user.create({
                    data: {
                        robloxId: idString,
                        xp: 0
                    }
                });
            }

            // Create a clean update object with only valid fields
            const updateData = {};
            Object.keys(data).forEach(key => {
                if (data[key] !== undefined && data[key] !== null) {
                    updateData[key] = data[key];
                }
            });

            // If updating XP, ensure it's a number
            if ('xp' in updateData) {
                updateData['xp'] = Number(updateData['xp']);
            }

            // Perform the update
            const result = await this.db.user.update({
                where: { robloxId: idString },
                data: updateData
            });

            console.log(`[DB DEBUG] Update completed for user ${idString}`);
            return result;
        } catch (error) {
            console.error(`[DB ERROR] Failed to update user ${robloxId}:`, error);
            throw error;
        }
    }

    async findSuspendedUsers(): Promise<DatabaseUser[]> {
        return await this.db.user.findMany({ where: { suspendedUntil: { not: null } } });
    }

    async findBannedUsers(): Promise<DatabaseUser[]> {
        return await this.db.user.findMany({ where: { isBanned: true } });
    }

    async getAllUsers(): Promise<DatabaseUser[]> {
        return await this.db.user.findMany();
    }

    async deleteUser(robloxId: string) {
        return await this.db.user.delete({ where: { robloxId } });
    }

    async safeDeleteUser(robloxId: string) {
        try {
            // First check if the user exists
            const userExists = await this.db.user.findUnique({
                where: { robloxId }
            });

            if (!userExists) {
                // User doesn't exist, just return success
                return true;
            }

            // Delete related records in a transaction
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
            Logger.error(`Error in safeDeleteUser for ${robloxId}:`, error);
            throw error;
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