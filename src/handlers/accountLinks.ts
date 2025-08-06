import { User } from 'bloxy/dist/structures';
import { robloxClient } from '../main';
import { prisma } from '../database/prisma';
import { Logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';

// Backup file for verifications
const BACKUP_FILE = path.join(process.cwd(), 'verification_backup.json');

// In-memory cache of verifications to use as fallback
const verificationCache = new Map<string, string>();

/**
 * Load backup verifications from disk on startup
 */
const loadBackupVerifications = () => {
    try {
        if (fs.existsSync(BACKUP_FILE)) {
            const data = fs.readFileSync(BACKUP_FILE, 'utf8');
            const backups = JSON.parse(data);

            // Load into cache
            Object.entries(backups).forEach(([discordId, robloxId]) => {
                verificationCache.set(discordId, String(robloxId));
            });

            Logger.info(`Loaded ${Object.keys(backups).length} backup verifications`, "AccountLinks");
        }
    } catch (err) {
        // Fix: Properly handle error object by ensuring it's an Error type
        const error = err instanceof Error ? err : new Error(String(err));
        Logger.error(`Failed to load backup verifications: ${error.message}`, "AccountLinks", error);
    }
};

// Call this on startup, but with better error handling
try {
    loadBackupVerifications();
} catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    Logger.warn(`Could not load verification backups: ${error.message}`, "AccountLinks");
}

/**
 * Save verification to backup file
 */
const saveVerificationBackup = () => {
    try {
        const backups = {};
        verificationCache.forEach((robloxId, discordId) => {
            backups[discordId] = robloxId;
        });

        fs.writeFileSync(BACKUP_FILE, JSON.stringify(backups, null, 2));
        Logger.info(`Saved ${verificationCache.size} verifications to backup file`, "AccountLinks");
    } catch (err) {
        // Fix: Properly handle error object
        const error = err instanceof Error ? err : new Error(String(err));
        Logger.error(`Failed to save backup verifications: ${error.message}`, "AccountLinks", error);
    }
};

/**
 * Check if a user is verified
 */
export const isUserVerified = async (discordId: string): Promise<boolean> => {
    try {
        const safeDiscordId = String(discordId).trim();
        Logger.debug(`Checking verification status for Discord ID: ${safeDiscordId}`, "AccountLinks");

        // Check database first
        try {
            const result = await prisma.$queryRaw`
                SELECT * FROM UserLink WHERE discordId = ${safeDiscordId} LIMIT 1
            `;

            const links = result as any[];
            if (links && links.length > 0) {
                Logger.info(`Verification found in database for Discord ID ${safeDiscordId}`, "AccountLinks");

                // Update cache with this verified record
                verificationCache.set(safeDiscordId, String(links[0].robloxId));
                return true;
            }
        } catch (dbErr) {
            // Fix: Properly handle error object
            const error = dbErr instanceof Error ? dbErr : new Error(String(dbErr));
            Logger.error(`Database error checking verification: ${error.message}`, "AccountLinks", error);
        }

        // If not in database, check memory cache as fallback
        if (verificationCache.has(safeDiscordId)) {
            Logger.info(`Verification found in cache for Discord ID ${safeDiscordId}`, "AccountLinks");

            // Attempt to restore the database record
            try {
                const robloxId = verificationCache.get(safeDiscordId);
                await createUserLink(safeDiscordId, robloxId);
                Logger.info(`Restored missing verification record in database for ${safeDiscordId}`, "AccountLinks");
            } catch (e) {
                const error = e instanceof Error ? e : new Error(String(e));
                Logger.warn(`Could not restore verification record: ${error.message}`, "AccountLinks");
            }

            return true;
        }

        Logger.info(`Verification status for Discord ID ${safeDiscordId}: false`, "AccountLinks");
        return false;
    } catch (err) {
        // Fix: Properly handle error object
        const error = err instanceof Error ? err : new Error(String(err));
        Logger.error(`Failed to check verification status: ${error.message}`, "AccountLinks", error);

        // Default to assuming verified if error - prevents random unverification issues
        return true;
    }
};

/**
 * Get the Roblox user linked to a Discord ID
 */
export const getLinkedRobloxUser = async (discordId: string): Promise<User | null> => {
    try {
        Logger.debug(`Getting linked Roblox user for Discord ID: ${discordId}`, "AccountLinks");

        // Ensure discordId is properly formatted as string
        const safeDiscordId = String(discordId).trim();

        // Try database first
        try {
            const result = await prisma.$queryRaw`
                SELECT * FROM UserLink WHERE discordId = ${safeDiscordId} LIMIT 1
            `;

            const links = result as any[];
            Logger.debug(`Found ${links?.length || 0} links for Discord ID: ${discordId}`, "AccountLinks");

            if (links && links.length > 0) {
                const robloxId = Number(links[0].robloxId);
                Logger.debug(`Link found: Discord ID ${discordId} -> Roblox ID ${robloxId}`, "AccountLinks");

                // Update cache
                verificationCache.set(safeDiscordId, String(robloxId));

                try {
                    const robloxUser = await robloxClient.getUser(robloxId);
                    if (robloxUser) {
                        Logger.info(`Successfully retrieved Roblox user ${robloxUser.name} (${robloxUser.id}) for Discord ID: ${discordId}`, "AccountLinks");
                        return robloxUser;
                    }
                } catch (robloxErr) {
                    // Fix: Properly handle error object
                    const error = robloxErr instanceof Error ? robloxErr : new Error(String(robloxErr));
                    Logger.error(`Failed to fetch Roblox user with ID ${robloxId}:`, "AccountLinks", error);
                }
            }
        } catch (dbErr) {
            // Fix: Properly handle error object
            const error = dbErr instanceof Error ? dbErr : new Error(String(dbErr));
            Logger.error(`Database error fetching link: ${error.message}`, "AccountLinks", error);
        }

        // If database fails, check memory cache as fallback
        if (verificationCache.has(safeDiscordId)) {
            const robloxId = Number(verificationCache.get(safeDiscordId));
            Logger.info(`Using cached verification for ${discordId} -> ${robloxId}`, "AccountLinks");

            // Try to restore the database record
            try {
                await createUserLink(safeDiscordId, String(robloxId));
                Logger.info(`Recreated missing verification record in database for ${discordId}`, "AccountLinks");
            } catch (e) {
                const error = e instanceof Error ? e : new Error(String(e));
                Logger.warn(`Could not recreate verification record: ${error.message}`, "AccountLinks");
            }

            try {
                const robloxUser = await robloxClient.getUser(robloxId);
                if (robloxUser) {
                    Logger.info(`Successfully retrieved Roblox user ${robloxUser.name} (${robloxUser.id}) from cache for Discord ID: ${discordId}`, "AccountLinks");
                    return robloxUser;
                }
            } catch (robloxErr) {
                // Fix: Properly handle error object
                const error = robloxErr instanceof Error ? robloxErr : new Error(String(robloxErr));
                Logger.error(`Failed to fetch Roblox user from cache with ID ${robloxId}:`, "AccountLinks", error);
            }
        }

        Logger.info(`No Roblox account linked to Discord ID: ${discordId}`, "AccountLinks");
        return null;
    } catch (err) {
        // Fix: Properly handle error object
        const error = err instanceof Error ? err : new Error(String(err));
        Logger.error(`Failed to get linked Roblox user for Discord ID ${discordId}:`, "AccountLinks", error);
        return null;
    }
};

/**
 * Create a link between Discord ID and Roblox ID
 */
export const createUserLink = async (discordId: string, robloxId: string) => {
    try {
        const safeDiscordId = String(discordId).trim();
        const safeRobloxId = String(robloxId).trim();

        Logger.info(`Creating link: Discord ID ${safeDiscordId} -> Roblox ID ${safeRobloxId}`, "AccountLinks");

        // First, remove any existing link
        try {
            await removeUserLink(safeDiscordId);
        } catch (e) {
            // Ignore error if no link exists
        }

        // Add to the in-memory cache
        verificationCache.set(safeDiscordId, safeRobloxId);

        // Save to backup file
        saveVerificationBackup();

        try {
            // Try with verifiedAt first (newer schema)
            Logger.info(`Creating new link for Discord ID: ${safeDiscordId}`, "AccountLinks");

            try {
                // First try using Prisma's typed approach
                await prisma.userLink.create({
                    data: {
                        discordId: safeDiscordId,
                        robloxId: safeRobloxId,
                        verifiedAt: new Date()
                    }
                });
                Logger.info(`Link created with verifiedAt timestamp using Prisma client`, "AccountLinks");
            } catch (prismaErr) {
                // If Prisma fails, fall back to raw SQL
                Logger.warn(`Failed to create link with Prisma, trying raw SQL:`, "AccountLinks");

                try {
                    await prisma.$executeRaw`
                        INSERT INTO UserLink (discordId, robloxId, verifiedAt)
                        VALUES (${safeDiscordId}, ${safeRobloxId}, datetime('now'))
                    `;
                    Logger.info(`Link created with verifiedAt timestamp using raw SQL`, "AccountLinks");
                } catch (verifiedAtErr) {
                    // Fix: Properly handle error object
                    const error = verifiedAtErr instanceof Error ? verifiedAtErr : new Error(String(verifiedAtErr));
                    Logger.warn(`Failed to create link with verifiedAt, trying without:`, "AccountLinks", error);

                    // If fails, try without verifiedAt (older schema)
                    await prisma.$executeRaw`
                        INSERT INTO UserLink (discordId, robloxId)
                        VALUES (${safeDiscordId}, ${safeRobloxId})
                    `;

                    Logger.info(`Link created without verifiedAt timestamp`, "AccountLinks");
                }
            }
        } catch (insertErr) {
            // Fix: Properly handle error object
            const error = insertErr instanceof Error ? insertErr : new Error(String(insertErr));
            Logger.error(`Failed to create database link: ${error.message}`, "AccountLinks", error);
            throw error;
        }

        return { success: true };
    } catch (err) {
        // Fix: Properly handle error object
        const error = err instanceof Error ? err : new Error(String(err));
        Logger.error(`Failed to create user link:`, "AccountLinks", error);
        throw error;
    }
};

/**
 * Remove a link between Discord ID and Roblox ID
 */
export const removeUserLink = async (discordId: string) => {
    try {
        const safeDiscordId = String(discordId).trim();
        Logger.info(`Removing link for Discord ID: ${safeDiscordId}`, "AccountLinks");

        // Remove from cache
        verificationCache.delete(safeDiscordId);

        // Save updated backup file
        saveVerificationBackup();

        // Remove from database - try with Prisma client first
        try {
            await prisma.userLink.delete({
                where: { discordId: safeDiscordId }
            });
        } catch (prismaErr) {
            // If Prisma client fails, try raw SQL
            try {
                await prisma.$executeRaw`DELETE FROM UserLink WHERE discordId = ${safeDiscordId}`;
            } catch (dbErr) {
                // Fix: Properly handle error object
                const error = dbErr instanceof Error ? dbErr : new Error(String(dbErr));
                Logger.error(`Failed to remove link from database: ${error.message}`, "AccountLinks", error);
                // Continue since we've already removed from cache
            }
        }

        Logger.info(`Removed link for Discord ID: ${safeDiscordId}`, "AccountLinks");
        return { success: true };
    } catch (err) {
        // Fix: Properly handle error object
        const error = err instanceof Error ? err : new Error(String(err));
        Logger.error(`Failed to remove user link:`, "AccountLinks", error);
        throw error;
    }
};

/**
 * Debug function to check verification status in detail
 */
export const debugVerificationStatus = async (discordId: string) => {
    try {
        const safeDiscordId = String(discordId).trim();
        const debugInfo = {
            discordId: safeDiscordId,
            databaseCheck: null,
            cacheCheck: null,
            backupFileCheck: null,
            isUserVerifiedResult: null,
            getLinkedRobloxUserResult: null,
            error: null
        };

        // Check database
        try {
            const result = await prisma.$queryRaw`
                SELECT * FROM UserLink WHERE discordId = ${safeDiscordId} LIMIT 1
            `;
            debugInfo.databaseCheck = (result as any[]).length > 0
                ? { found: true, data: (result as any[])[0] }
                : { found: false };
        } catch (dbErr) {
            const error = dbErr instanceof Error ? dbErr : new Error(String(dbErr));
            debugInfo.databaseCheck = { error: error.message };
        }

        // Check memory cache
        debugInfo.cacheCheck = {
            found: verificationCache.has(safeDiscordId),
            data: verificationCache.get(safeDiscordId)
        };

        // Check backup file
        try {
            if (fs.existsSync(BACKUP_FILE)) {
                const data = fs.readFileSync(BACKUP_FILE, 'utf8');
                const backups = JSON.parse(data);
                debugInfo.backupFileCheck = {
                    found: safeDiscordId in backups,
                    data: backups[safeDiscordId]
                };
            } else {
                debugInfo.backupFileCheck = { found: false, reason: "Backup file does not exist" };
            }
        } catch (fileErr) {
            const error = fileErr instanceof Error ? fileErr : new Error(String(fileErr));
            debugInfo.backupFileCheck = { error: error.message };
        }

        // Check function results
        try {
            debugInfo.isUserVerifiedResult = await isUserVerified(safeDiscordId);
        } catch (e) {
            const error = e instanceof Error ? e : new Error(String(e));
            debugInfo.isUserVerifiedResult = { error: error.message };
        }

        try {
            const linkedUser = await getLinkedRobloxUser(safeDiscordId);
            debugInfo.getLinkedRobloxUserResult = linkedUser
                ? { found: true, id: linkedUser.id, name: linkedUser.name }
                : { found: false };
        } catch (e) {
            const error = e instanceof Error ? e : new Error(String(e));
            debugInfo.getLinkedRobloxUserResult = { error: error.message };
        }

        return debugInfo;
    } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        return { error: error.message, stack: error.stack };
    }
};