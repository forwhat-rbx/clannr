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
        // Use raw SQL query to bypass schema validation
        const result = await prisma.$queryRaw`
            SELECT * FROM UserLink WHERE discordId = ${discordId} LIMIT 1
        `;

        // Fix line 17: Properly type-check the result before accessing length
        const links = result as any[];
        if (!links || links.length === 0) {
            return null;
        }

        const userLink = links[0];

        // Use the Roblox ID from our database to fetch the Roblox user through bloxy API
        const robloxUser = await robloxClient.getUser(Number(userLink.robloxId));
        return robloxUser;
    } catch (err) {
        Logger.error("Failed to get linked Roblox user:", "AccountLinks", err as Error);
        return null;
    }
};

/**
 * Store a link between Discord ID and Roblox ID
 */
export const createUserLink = async (discordId: string, robloxId: string) => {
    try {
        Logger.info(`Creating link: Discord ID ${discordId} -> Roblox ID ${robloxId}`, "AccountLinks");

        // Ensure robloxId is always a string
        const robloxIdString = String(robloxId);

        // Check if link already exists
        const existingLinks = await prisma.$queryRaw`
            SELECT * FROM UserLink WHERE discordId = ${discordId}
        `;

        // Fix line 47: Properly type-check before accessing length
        const links = existingLinks as any[];
        if (links && links.length > 0) {
            // Update existing link
            await prisma.$executeRaw`
                UPDATE UserLink 
                SET robloxId = ${robloxIdString} 
                WHERE discordId = ${discordId}
            `;
            Logger.info(`Link updated successfully via raw query`, "AccountLinks");
            return { discordId, robloxId: robloxIdString };
        } else {
            // Create new link - try with verifiedAt first, fall back if needed
            try {
                await prisma.$executeRaw`
                    INSERT INTO UserLink (discordId, robloxId, verifiedAt)
                    VALUES (${discordId}, ${robloxIdString}, ${new Date()})
                `;
            } catch (error) {
                // If verifiedAt column doesn't exist, try without it
                await prisma.$executeRaw`
                    INSERT INTO UserLink (discordId, robloxId)
                    VALUES (${discordId}, ${robloxIdString})
                `;
            }
            Logger.info(`Link created successfully via raw query`, "AccountLinks");
            return { discordId, robloxId: robloxIdString };
        }
    } catch (err) {
        Logger.error("Failed to create user link:", "AccountLinks", err as Error);
        throw err;
    }
};

/**
 * Remove a link between Discord ID and Roblox ID
 */
export const removeUserLink = async (discordId: string) => {
    try {
        return await prisma.$executeRaw`DELETE FROM UserLink WHERE discordId = ${discordId}`;
    } catch (err) {
        Logger.error("Failed to remove user link:", "AccountLinks", err as Error);
        throw err;
    }
};

/**
 * Check if a Discord user is verified
 */
export const isUserVerified = async (discordId: string): Promise<boolean> => {
    try {
        const count = await prisma.$queryRaw`SELECT COUNT(*) as count FROM UserLink WHERE discordId = ${discordId}`;
        return (count as any[])[0].count > 0;
    } catch (err) {
        Logger.error("Failed to check verification status:", "AccountLinks", err as Error);
        return false;
    }
};