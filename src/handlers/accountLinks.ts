import { config } from '../config';
import { robloxClient } from '../main';
import { prisma } from '../database/prisma';
import { User } from 'bloxy/dist/structures';

/**
 * Get a Roblox user linked to a Discord ID from the database
 */
export const getLinkedRobloxUser = async (discordId: string): Promise<User | null> => {
    try {
        // Use findFirst instead of findUnique to avoid schema conflicts
        const userLink = await prisma.userLink.findFirst({
            where: {
                discordId: discordId
            }
        });

        if (!userLink) return null;

        // Use the Roblox ID from our database to fetch the Roblox user through bloxy API
        const robloxUser = await robloxClient.getUser(Number(userLink.robloxId));
        return robloxUser;
    } catch (err) {
        console.error("Failed to get linked Roblox user:", err);
        return null;
    }
};

/**
 * Store a link between Discord ID and Roblox ID
 */
export const createUserLink = async (discordId: string, robloxId: string) => {
    try {
        console.log(`[LINK DEBUG] Creating link: Discord ID ${discordId} -> Roblox ID ${robloxId}`);

        // Ensure robloxId is always a string
        const robloxIdString = String(robloxId);

        // Use upsert with findFirst precondition instead of relying on unique constraints
        const existingLink = await prisma.userLink.findFirst({
            where: { discordId: discordId }
        });

        if (existingLink) {
            // Update existing link
            const result = await prisma.userLink.update({
                where: { discordId: discordId },
                data: {
                    robloxId: robloxIdString,
                    verifiedAt: new Date()
                }
            });
            console.log(`[LINK DEBUG] Link updated successfully:`, result);
            return result;
        } else {
            // Create new link
            const result = await prisma.$queryRaw`
                INSERT INTO UserLink (discordId, robloxId, verifiedAt)
                VALUES (${discordId}, ${robloxIdString}, ${new Date()})
            `;
            console.log(`[LINK DEBUG] Link created successfully via raw query`);
            return { discordId, robloxId: robloxIdString, verifiedAt: new Date() };
        }
    } catch (err) {
        console.error("Failed to create user link:", err);
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
        console.error("Failed to remove user link:", err);
        throw err;
    }
};

/**
 * Check if a Discord user is verified
 */
export const isUserVerified = async (discordId: string): Promise<boolean> => {
    try {
        const count = await prisma.$queryRaw`SELECT COUNT(*) as count FROM UserLink WHERE discordId = ${discordId}`;
        return count[0].count > 0;
    } catch (err) {
        console.error("Failed to check verification status:", err);
        return false;
    }
};