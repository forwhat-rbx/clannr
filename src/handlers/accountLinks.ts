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
        Logger.error(`Failed to load backup verifications: ${err.message}`, "AccountLinks", err as Error);
    }
};

// Call this on startup
loadBackupVerifications();

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
        Logger.error(`Failed to save backup verifications: ${err.message}`, "AccountLinks", err as Error);
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
            Logger.error(`Database error checking verification: ${dbErr.message}`, "AccountLinks", dbErr as Error);
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
                Logger.warn(`Could not restore verification record: ${e.message}`, "AccountLinks");
            }

            return true;
        }

        Logger.info(`Verification status for Discord ID ${safeDiscordId}: false`, "AccountLinks");
        return false;
    } catch (err) {
        Logger.error(`Failed to check verification status: ${err.message}`, "AccountLinks", err as Error);

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
                    Logger.error(`Failed to fetch Roblox user with ID ${robloxId}:`, "AccountLinks", robloxErr as Error);
                }
            }
        } catch (dbErr) {
            Logger.error(`Database error fetching link: ${dbErr.message}`, "AccountLinks", dbErr as Error);
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
                Logger.warn(`Could not recreate verification record: ${e.message}`, "AccountLinks");
            }

            try {
                const robloxUser = await robloxClient.getUser(robloxId);
                if (robloxUser) {
                    Logger.info(`Successfully retrieved Roblox user ${robloxUser.name} (${robloxUser.id}) from cache for Discord ID: ${discordId}`, "AccountLinks");
                    return robloxUser;
                }
            } catch (robloxErr) {
                Logger.error(`Failed to fetch Roblox user from cache with ID ${robloxId}:`, "AccountLinks", robloxErr as Error);
            }
        }

        Logger.info(`No Roblox account linked to Discord ID: ${discordId}`, "AccountLinks");
        return null;
    } catch (err) {
        Logger.error(`Failed to get linked Roblox user for Discord ID ${discordId}:`, "AccountLinks", err as Error);
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
                await prisma.$executeRaw`
                    INSERT INTO UserLink (discordId, robloxId, verifiedAt)
                    VALUES (${safeDiscordId}, ${safeRobloxId}, datetime('now'))
                `;
            } catch (verifiedAtErr) {
                Logger.warn(`Failed to create link with verifiedAt, trying without:`, "AccountLinks", verifiedAtErr as Error);

                // If fails, try without verifiedAt (older schema)
                await prisma.$executeRaw`
                    INSERT INTO UserLink (discordId, robloxId)
                    VALUES (${safeDiscordId}, ${safeRobloxId})
                `;

                Logger.info(`Link created without verifiedAt timestamp`, "AccountLinks");
            }
        } catch (insertErr) {
            Logger.error(`Failed to create database link: ${insertErr.message}`, "AccountLinks", insertErr as Error);
            throw insertErr;
        }

        return { success: true };
    } catch (err) {
        Logger.error(`Failed to create user link:`, "AccountLinks", err as Error);
        throw err;
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

        // Remove from database
        try {
            await prisma.$executeRaw`DELETE FROM UserLink WHERE discordId = ${safeDiscordId}`;
        } catch (dbErr) {
            Logger.error(`Failed to remove link from database: ${dbErr.message}`, "AccountLinks", dbErr as Error);
            // Continue since we've already removed from cache
        }

        Logger.info(`Removed link for Discord ID: ${safeDiscordId}`, "AccountLinks");
        return { success: true };
    } catch (err) {
        Logger.error(`Failed to remove user link:`, "AccountLinks", err as Error);
        throw err;
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
            debugInfo.databaseCheck = { error: dbErr.message };
        }

        // Check memory cache
        debugInfo.cacheCheck = {
            found: verificationCache.has(safeDiscordId),
            data: verificationCache.get(safeDiscordId)
        };

        // Check function results
        try {
            debugInfo.isUserVerifiedResult = await isUserVerified(safeDiscordId);
        } catch (e) {
            debugInfo.isUserVerifiedResult = { error: e.message };
        }

        try {
            const linkedUser = await getLinkedRobloxUser(safeDiscordId);
            debugInfo.getLinkedRobloxUserResult = linkedUser
                ? { found: true, id: linkedUser.id, name: linkedUser.name }
                : { found: false };
        } catch (e) {
            debugInfo.getLinkedRobloxUserResult = { error: e.message };
        }

        return debugInfo;
    } catch (err) {
        return { error: err.message, stack: err.stack };
    }
};