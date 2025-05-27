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

interface RobloxUsernamesResponse {
    data: Array<{
        id: number;
        name: string;
        displayName: string;
    }>;
}

interface RobloxUserResponse {
    id: number;
    name: string;
    displayName: string;
    description?: string;
    created?: string;
    isBanned?: boolean;
    hasVerifiedBadge?: boolean;
}

interface RobloxAuditLogResponse {
    previousPageCursor: string | null;
    nextPageCursor: string | null;
    data: Array<any>;
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
 * Directly fetch Roblox users by username without using Bloxy
 * @param cookie Roblox security cookie
 * @param usernames Array of usernames to look up
 * @returns Array of user objects with id, name and displayName
 */
export async function directGetUsersByUsernames(cookie: string, usernames: string[]): Promise<any[]> {
    try {
        Logger.info(`Directly fetching users by usernames: ${usernames.join(', ')}`, 'DirectAuth');

        // Get CSRF token for the request
        const csrfToken = await getXCSRFToken(cookie);

        // Make the API request
        const response = await fetch('https://users.roblox.com/v1/usernames/users', {
            method: 'POST',
            headers: {
                'Cookie': `.ROBLOSECURITY=${cookie}`,
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': csrfToken
            },
            body: JSON.stringify({
                usernames: usernames,
                excludeBannedUsers: false
            })
        });

        if (!response.ok) {
            throw new Error(`Failed to get users with status: ${response.status}`);
        }

        const data = await response.json();
        Logger.info(`Successfully found ${data.data.length} users by username`, 'DirectAuth');

        // Transform the response to match the format expected by the application
        return data.data.map(user => ({
            id: user.id,
            name: user.name,
            displayName: user.displayName
        }));
    } catch (error) {
        Logger.error(`Failed to get users by username: ${error.message}`, 'DirectAuth');
        return [];
    }
}

/**
 * Directly fetch a single Roblox user by ID
 * @param cookie Roblox security cookie
 * @param userId Roblox user ID to look up
 * @returns User object with id, name and displayName or null if not found
 */
export async function directGetUserById(cookie: string, userId: number): Promise<any> {
    try {
        Logger.info(`Directly fetching user by ID: ${userId}`, 'DirectAuth');

        const response = await fetch(`https://users.roblox.com/v1/users/${userId}`, {
            method: 'GET',
            headers: {
                'Cookie': `.ROBLOSECURITY=${cookie}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to get user with status: ${response.status}`);
        }

        // Type cast the response to our interface
        const user = await response.json() as RobloxUserResponse;
        Logger.info(`Successfully found user: ${user.name} (${user.id})`, 'DirectAuth');

        return {
            id: user.id,
            name: user.name,
            displayName: user.displayName
        };
    } catch (error) {
        Logger.error(`Failed to get user by ID: ${error.message}`, 'DirectAuth');
        return null;
    }
}

export async function directGetGroupAuditLogs(cookie: string, groupId: number, params: any = {}): Promise<any> {
    try {
        Logger.info(`Directly fetching audit logs for group ${groupId}...`, 'DirectAuth');

        // Get a CSRF token first which is required for this endpoint
        const csrfToken = await getXCSRFToken(cookie);

        // Build URL with parameters if provided
        let url = `https://groups.roblox.com/v1/groups/${groupId}/audit-log`;
        if (params && Object.keys(params).length > 0) {
            const queryParams = new URLSearchParams();
            if (params.actionType) queryParams.append('actionType', params.actionType);
            if (params.limit) queryParams.append('limit', params.limit.toString());
            if (params.cursor) queryParams.append('cursor', params.cursor);
            if (params.sortOrder) queryParams.append('sortOrder', params.sortOrder);
            url += `?${queryParams.toString()}`;
        }

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Cookie': `.ROBLOSECURITY=${cookie}`,
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': csrfToken
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to get audit logs with status: ${response.status}`);
        }

        // Type cast the response to our interface
        const data = await response.json() as RobloxAuditLogResponse;
        Logger.info(`Successfully fetched audit logs for group ${groupId}`, 'DirectAuth');
        return data;
    } catch (error) {
        Logger.error('Failed to get group audit logs directly:', 'DirectAuth', error);
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