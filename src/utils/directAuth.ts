import { Logger } from './logger';
import fetch from 'node-fetch';

// Define interfaces for the API responses
interface RobloxAuthenticatedUser {
    id: number;
    name: string;
    displayName?: string;
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
export async function directGetGroup(cookie: string, groupId: number): Promise<any> {
    try {
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

        return await response.json();
    } catch (error) {
        Logger.error('Failed to get group directly:', 'DirectAuth', error);
        throw error;
    }
}