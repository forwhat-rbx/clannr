import { config } from '../config';
import { robloxClient } from '../main';
import { prisma } from '../database/prisma';
import { User } from 'bloxy/dist/structures';
import { Logger } from '../utils/logger';

/**
 * Get a Roblox user linked to a Discord ID from the database
 */
export const getLinkedRobloxUser = async (discordId: string): Promise<User | null> => {
    try {
        Logger.debug(`Getting linked Roblox user for Discord ID: ${discordId}`, "AccountLinks");

        // Ensure discordId is properly formatted as string
        const safeDiscordId = String(discordId).trim();

        // Use raw SQL query to bypass schema validation
        const result = await prisma.$queryRaw`
            SELECT * FROM UserLink WHERE discordId = ${safeDiscordId} LIMIT 1
        `;

        // Properly type-check and log the result
        const links = result as any[];
        Logger.debug(`Found ${links?.length || 0} links for Discord ID: ${discordId}`, "AccountLinks");

        if (!links || links.length === 0) {
            Logger.info(`No Roblox account linked to Discord ID: ${discordId}`, "AccountLinks");
            return null;
        }

        const userLink = links[0];
        Logger.debug(`Link found: Discord ID ${discordId} -> Roblox ID ${userLink.robloxId}`, "AccountLinks");

        // Use the Roblox ID from our database to fetch the Roblox user through bloxy API
        const robloxId = Number(userLink.robloxId);
        Logger.debug(`Fetching Roblox user with ID: ${robloxId}`, "AccountLinks");

        try {
            const robloxUser = await robloxClient.getUser(robloxId);
            if (!robloxUser) {
                Logger.warn(`Roblox API returned null for user ID: ${robloxId}`, "AccountLinks");
                return null;
            }
            Logger.info(`Successfully retrieved Roblox user ${robloxUser.name} (${robloxUser.id}) for Discord ID: ${discordId}`, "AccountLinks");
            return robloxUser;
        } catch (robloxErr) {
            Logger.error(`Failed to fetch Roblox user with ID ${robloxId}:`, "AccountLinks", robloxErr as Error);
            return null;
        }
    } catch (err) {
        Logger.error(`Failed to get linked Roblox user for Discord ID ${discordId}:`, "AccountLinks", err as Error);

        // Try debugging the database connection
        try {
            await prisma.$queryRaw`SELECT 1 as test`;
            Logger.debug(`Database connection is working`, "AccountLinks");
        } catch (dbErr) {
            Logger.error(`Database connection error:`, "AccountLinks", dbErr as Error);
        }

        return null;
    }
};

/**
 * Store a link between Discord ID and Roblox ID
 */
export const createUserLink = async (discordId: string, robloxId: string) => {
    try {
        // Ensure IDs are properly formatted as strings
        const safeDiscordId = String(discordId).trim();
        const safeRobloxId = String(robloxId).trim();

        Logger.info(`Creating link: Discord ID ${safeDiscordId} -> Roblox ID ${safeRobloxId}`, "AccountLinks");

        // Check if link already exists
        const existingLinks = await prisma.$queryRaw`
            SELECT * FROM UserLink WHERE discordId = ${safeDiscordId}
        `;

        // Properly type-check before accessing length
        const links = existingLinks as any[];
        if (links && links.length > 0) {
            // Update existing link
            Logger.info(`Updating existing link for Discord ID: ${safeDiscordId}`, "AccountLinks");
            await prisma.$executeRaw`
                UPDATE UserLink 
                SET robloxId = ${safeRobloxId} 
                WHERE discordId = ${safeDiscordId}
            `;
            Logger.info(`Link updated successfully via raw query`, "AccountLinks");
            return { discordId: safeDiscordId, robloxId: safeRobloxId };
        } else {
            // Create new link - try with verifiedAt first, fall back if needed
            Logger.info(`Creating new link for Discord ID: ${safeDiscordId}`, "AccountLinks");
            try {
                await prisma.$executeRaw`
                    INSERT INTO UserLink (discordId, robloxId, verifiedAt)
                    VALUES (${safeDiscordId}, ${safeRobloxId}, ${new Date()})
                `;
                Logger.info(`Link created with verifiedAt timestamp`, "AccountLinks");
            } catch (error) {
                // If verifiedAt column doesn't exist, try without it
                Logger.warn(`Failed to create link with verifiedAt, trying without: ${error.message}`, "AccountLinks");
                await prisma.$executeRaw`
                    INSERT INTO UserLink (discordId, robloxId)
                    VALUES (${safeDiscordId}, ${safeRobloxId})
                `;
                Logger.info(`Link created without verifiedAt timestamp`, "AccountLinks");
            }
            return { discordId: safeDiscordId, robloxId: safeRobloxId };
        }
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

        const result = await prisma.$executeRaw`DELETE FROM UserLink WHERE discordId = ${safeDiscordId}`;
        Logger.info(`Removed ${result} link(s) for Discord ID: ${safeDiscordId}`, "AccountLinks");
        return result;
    } catch (err) {
        Logger.error(`Failed to remove user link:`, "AccountLinks", err as Error);
        throw err;
    }
};

/**
 * Check if a Discord user is verified
 */
export const isUserVerified = async (discordId: string): Promise<boolean> => {
    try {
        const safeDiscordId = String(discordId).trim();
        Logger.debug(`Checking verification status for Discord ID: ${safeDiscordId}`, "AccountLinks");

        // Try different methods to verify the user exists

        // Method 1: Count query
        const count = await prisma.$queryRaw`SELECT COUNT(*) as count FROM UserLink WHERE discordId = ${safeDiscordId}`;
        const recordExists = (count as any[])[0].count > 0;

        // Method 2: Direct query (as backup)
        if (!recordExists) {
            Logger.debug(`Count query returned 0, trying direct query`, "AccountLinks");
            const directCheck = await prisma.$queryRaw`SELECT * FROM UserLink WHERE discordId = ${safeDiscordId} LIMIT 1`;
            const directExists = (directCheck as any[]).length > 0;

            if (directExists) {
                Logger.warn(`Count query returned 0 but direct query found a record for ${safeDiscordId}`, "AccountLinks");
                return true;
            }
        }

        Logger.info(`Verification status for Discord ID ${safeDiscordId}: ${recordExists}`, "AccountLinks");
        return recordExists;
    } catch (err) {
        Logger.error(`Failed to check verification status:`, "AccountLinks", err as Error);

        // Try a more direct approach if the first method fails
        try {
            Logger.debug(`Trying alternate verification check method`, "AccountLinks");
            const directCheck = await prisma.$queryRaw`SELECT 1 FROM UserLink WHERE discordId = ${discordId} LIMIT 1`;
            return (directCheck as any[]).length > 0;
        } catch (altErr) {
            Logger.error(`Alternate verification check also failed:`, "AccountLinks", altErr as Error);
            return false;
        }
    }
};

/**
 * Debug verification status - useful for troubleshooting
 */
export const debugVerificationStatus = async (discordId: string): Promise<any> => {
    try {
        const safeDiscordId = String(discordId).trim();
        Logger.debug(`Running verification debug for Discord ID: ${safeDiscordId}`, "AccountLinks");

        // Check database connection
        const dbTest = await prisma.$queryRaw`SELECT 1 as test`;
        const dbConnected = (dbTest as any[]).length > 0;

        // Try to get link via normal method
        const link = await prisma.$queryRaw`SELECT * FROM UserLink WHERE discordId = ${safeDiscordId} LIMIT 1`;
        const linkExists = (link as any[]).length > 0;

        // Try count method
        const count = await prisma.$queryRaw`SELECT COUNT(*) as count FROM UserLink WHERE discordId = ${safeDiscordId}`;
        const countResult = (count as any[])[0].count;

        // Try to get Roblox user
        let robloxUser = null;
        if (linkExists) {
            const robloxId = (link as any[])[0].robloxId;
            try {
                robloxUser = await robloxClient.getUser(Number(robloxId));
            } catch (robloxErr) {
                Logger.error(`Error fetching Roblox user:`, "AccountLinks", robloxErr as Error);
            }
        }

        return {
            dbConnected,
            linkExists,
            countResult,
            linkDetails: linkExists ? (link as any[])[0] : null,
            robloxUser: robloxUser ? {
                id: robloxUser.id,
                name: robloxUser.name,
                displayName: robloxUser.displayName
            } : null
        };
    } catch (err) {
        Logger.error(`Error in debug verification:`, "AccountLinks", err as Error);
        return {
            error: err.message,
            stack: err.stack
        };
    }
};