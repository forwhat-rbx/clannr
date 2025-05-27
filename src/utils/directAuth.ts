import { Logger } from './logger';
import fetch from 'node-fetch';

// Define interfaces for the API responses
interface RobloxAuthenticatedUser {
    id: number;
    name: string;
    displayName?: string;
}

interface RobloxGroup {
    id: number;
    name: string;
    memberCount: number;
    hasVerifiedBadge: boolean;
    owner?: {
        userId: number;
        username: string;
        displayName: string;
    };
    shout?: {
        body: string;
        poster: {
            userId: number;
            username: string;
        };
        created: string;
        updated: string;
    };
}

interface RobloxGroupRolesResponse {
    roles: Array<{
        id: number;
        name: string;
        rank: number;
        memberCount?: number;
    }>;
}

/**
 * Directly authenticates with Roblox using the cookie
 * This bypasses the problematic Bloxy login flow
 */
export async function directAuthenticate(cookie: string): Promise<{
    id: number;
    name: string;
}> {
    Logger.info('Using direct authentication method...', 'DirectAuth');

    try {
        // Fetch authenticated user info directly
        const response = await fetch('https://users.roblox.com/v1/users/authenticated', {
            method: 'GET',
            headers: {
                'Cookie': `.ROBLOSECURITY=${cookie}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Authentication failed with status: ${response.status}`);
        }

        // Type cast the response to our interface
        const userData = await response.json() as RobloxAuthenticatedUser;

        // Validate that the required properties exist
        if (typeof userData.id !== 'number' || typeof userData.name !== 'string') {
            throw new Error('Invalid user data returned from Roblox API');
        }

        Logger.info(`Direct authentication successful: ${userData.name} (${userData.id})`, 'DirectAuth');

        return {
            id: userData.id,
            name: userData.name
        };
    } catch (error) {
        Logger.error('Direct authentication failed:', 'DirectAuth', error);
        throw error;
    }
}

/**
 * Gets a CSRF token directly
 */
export async function getXCSRFToken(cookie: string): Promise<string> {
    try {
        const response = await fetch('https://auth.roblox.com/v2/logout', {
            method: 'POST',
            headers: {
                'Cookie': `.ROBLOSECURITY=${cookie}`
            }
        });

        const token = response.headers.get('x-csrf-token');
        if (!token) {
            throw new Error('Failed to get X-CSRF-Token');
        }

        return token;
    } catch (error) {
        Logger.error('Failed to get CSRF token:', 'DirectAuth', error);
        throw error;
    }
}

/**
 * Directly fetches group info from Roblox
 */
export async function directGetGroup(cookie: string, groupId: number): Promise<RobloxGroup> {
    try {
        Logger.info(`Directly fetching group ${groupId} info...`, 'DirectAuth');

        const response = await fetch(`https://groups.roblox.com/v1/groups/${groupId}`, {
            method: 'GET',
            headers: {
                'Cookie': `.ROBLOSECURITY=${cookie}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to get group with status: ${response.status}`);
        }

        const groupData = await response.json() as RobloxGroup;
        Logger.info(`Successfully fetched group: ${groupData.name} (${groupData.id})`, 'DirectAuth');
        return groupData;
    } catch (error) {
        Logger.error('Failed to get group directly:', 'DirectAuth', error);
        throw error;
    }
}

/**
 * Get group roles directly
 */
export async function directGetGroupRoles(cookie: string, groupId: number): Promise<any[]> {
    try {
        Logger.info(`Directly fetching roles for group ${groupId}...`, 'DirectAuth');

        const response = await fetch(`https://groups.roblox.com/v1/groups/${groupId}/roles`, {
            method: 'GET',
            headers: {
                'Cookie': `.ROBLOSECURITY=${cookie}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to get group roles with status: ${response.status}`);
        }

        // Type cast the response to our interface
        const rolesData = await response.json() as RobloxGroupRolesResponse;

        // Now TypeScript knows rolesData.roles exists
        const roles = rolesData.roles || [];
        Logger.info(`Successfully fetched ${roles.length} roles for group ${groupId}`, 'DirectAuth');
        return roles;
    } catch (error) {
        Logger.error('Failed to get group roles directly:', 'DirectAuth', error);
        throw error;
    }
}