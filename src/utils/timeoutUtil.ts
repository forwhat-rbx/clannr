import { Logger } from './logger';

/**
 * Wraps a promise with a timeout
 * @param promise The promise to wrap
 * @param timeoutMs Timeout in milliseconds
 * @param errorMessage Error message to throw on timeout
 */
export async function promiseWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    errorMessage: string
): Promise<T> {
    let timeoutId: NodeJS.Timeout;

    // Create a promise that rejects after the specified timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
            Logger.error(`TIMEOUT: ${errorMessage}`, 'PromiseTimeout');
            reject(new Error(errorMessage));
        }, timeoutMs);
    });

    // Race the original promise against the timeout
    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        clearTimeout(timeoutId);
    }
}