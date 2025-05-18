import { robloxClient, robloxGroup } from '../main';

/**
 * Safely update a group member's role with automatic authentication refresh
 */
export async function safeUpdateMember(userId: number, roleId: number): Promise<void> {
    try {
        await robloxGroup.updateMember(userId, roleId);
    } catch (error: any) {
        // Check if it's an XSRF token error (by properties rather than instanceof)
        if (error?.statusCode === 403 &&
            error?.body?.errors?.some((e: any) => e.message?.includes('XSRF'))) {

            console.log(`XSRF token expired, refreshing token and retrying for user ${userId}`);

            // Using a direct fetch to get a new CSRF token - most reliable approach
            try {
                await fetchWithRetry('https://auth.roblox.com/v2/logout', {
                    method: 'POST',
                    headers: {
                        'Cookie': `.ROBLOSECURITY=${process.env.ROBLOX_COOKIE}`
                    }
                });

                // Re-login to refresh the token
                await robloxClient.login();

                // Use await instead of return to maintain void return type
                await robloxGroup.updateMember(userId, roleId);
                return;
            } catch (refreshError) {
                console.error('Error during token refresh:', refreshError);
                throw error; // Throw the original error if refresh fails
            }
        }

        // If it's not an XSRF error, rethrow
        throw error;
    }
}

/**
 * Get information about the currently authenticated Roblox user
 */
export async function getAuthenticatedUser() {
    try {
        return await robloxClient.apis.usersAPI.getAuthenticatedUserInformation();
    } catch (err) {
        console.error('Failed to get authenticated user:', err);
        throw new Error('Not authenticated or API changed');
    }
}

/**
 * Fetch with retry logic and increased timeout
 */
export async function fetchWithRetry(url: string, options: any, retries = 3, delay = 5000): Promise<Response> {
    try {
        // Add longer timeout
        const timeout = 30000; // 30 seconds
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);

        const fetchOptions = {
            ...options,
            signal: controller.signal
        };

        const response = await fetch(url, fetchOptions);
        clearTimeout(id);
        return response;
    } catch (err) {
        if (retries > 0) {
            console.log(`Fetch failed, retrying in ${delay / 1000} seconds... (${retries} retries left)`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchWithRetry(url, options, retries - 1, delay * 1.5);
        }
        throw err;
    }
}