import { config } from '../config';
import { robloxClient } from '../main';
import { prisma } from '../database/prisma';
import { User } from 'bloxy/dist/structures';

/**
 * Get a Roblox user linked to a Discord ID from the database
 */
export const getLinkedRobloxUser = async (discordId: string): Promise<User | null> => {
    try {
        // Find the user link in our database
        const userLink = await prisma.userLink.findUnique({
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
        return await prisma.userLink.upsert({
            where: {
                discordId: discordId
            },
            update: {
                robloxId: robloxId,
                verifiedAt: new Date()
            },
            create: {
                discordId: discordId,
                robloxId: robloxId,
                verifiedAt: new Date()
            }
        });
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
        return await prisma.userLink.delete({
            where: { discordId: discordId }
        });
    } catch (err) {
        console.error("Failed to remove user link:", err);
        throw err;
    }
};

/**
 * Check if a Discord user is verified
 */
export const isUserVerified = async (discordId: string): Promise<boolean> => {
    const userLink = await prisma.userLink.findUnique({
        where: { discordId: discordId }
    });

    return !!userLink;
};