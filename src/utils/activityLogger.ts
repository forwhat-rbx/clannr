import * as fs from 'fs';
import * as path from 'path';
import { discordClient } from '../main';

export interface ModAction {
    timestamp: Date;
    action: string;
    target?: string;
    targetName?: string;
    details?: string;
    reason?: string;
}

export class ActivityLogger {
    // Switch to absolute path to ensure correct directory
    private static readonly BASE_DIR = path.resolve(process.cwd(), 'logs', 'activity');

    /**
     * Logs a moderator action to the appropriate file
     */
    static async logAction(moderatorId: string, moderatorName: string, action: ModAction): Promise<boolean> {
        try {
            // Verify base directory exists
            if (!fs.existsSync(this.BASE_DIR)) {
                fs.mkdirSync(this.BASE_DIR, { recursive: true });
            }

            // Create sanitized moderator name for directory
            const sanitizedName = this.sanitizeFileName(moderatorName);
            const modDir = path.join(this.BASE_DIR, sanitizedName);

            if (!fs.existsSync(modDir)) {
                fs.mkdirSync(modDir, { recursive: true });
            }

            // Get current week's file name
            const weekStart = this.getWeekStartDate(new Date());
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);

            const fileName = `${this.formatDate(weekStart)}_to_${this.formatDate(weekEnd)}.log`;
            const logFilePath = path.join(modDir, fileName);

            // Format the log entry
            const timestamp = action.timestamp.toLocaleString();
            let logEntry = `[${timestamp}] ${action.action}\n`;

            if (action.target) {
                logEntry += `  Target: ${action.targetName || ''} (${action.target})\n`;
            }

            if (action.details) {
                logEntry += `  Details: ${action.details}\n`;
            }

            if (action.reason) {
                logEntry += `  Reason: ${action.reason}\n`;
            }

            logEntry += `\n`;

            // Try to write the file with error handling
            try {
                fs.appendFileSync(logFilePath, logEntry, 'utf8');
            } catch (err) {
                console.error(`[ERROR] Failed to write to ${logFilePath}:`, err);
                return false;
            }

            // Create the all users directory
            const allUserDir = path.join(this.BASE_DIR, 'all_users');
            if (!fs.existsSync(allUserDir)) {
                fs.mkdirSync(allUserDir, { recursive: true });
            }

            const allUserPath = path.join(allUserDir, fileName);
            const allUserEntry = `[${timestamp}] ${moderatorName} (${moderatorId}): ${action.action}\n` +
                (action.target ? `  Target: ${action.targetName || ''} (${action.target})\n` : '') +
                (action.details ? `  Details: ${action.details}\n` : '') +
                (action.reason ? `  Reason: ${action.reason}\n` : '') +
                `\n`;

            try {
                fs.appendFileSync(allUserPath, allUserEntry, 'utf8');
            } catch (err) {
                console.error(`[ERROR] Failed to write to ${allUserPath}:`, err);
                // Continue even if this fails
            }

            return true;
        } catch (error) {
            console.error('[ERROR] Error in ActivityLogger.logAction:', error);
            return false;
        }
    }

    // Add a test method to verify the logging system works
    static testLogging(): boolean {
        try {

            // Create a test directory with absolute path
            const testDir = path.resolve(process.cwd(), 'logs', 'activity', 'test');
            if (!fs.existsSync(testDir)) {
                fs.mkdirSync(testDir, { recursive: true });
            }

            // Try to write a test file
            const testFile = path.join(testDir, 'test.log');
            fs.writeFileSync(testFile, 'Test log entry\n', 'utf8');

            // Try to read it back
            const content = fs.readFileSync(testFile, 'utf8');

            // If we got here, file system operations are working
            return true;
        } catch (error) {
            console.error('[ERROR] Logging test failed:', error);
            return false;
        }
    }

    /**
     * Get all logs for a specific moderator with support for Discord mentions
     */
    static async getModeratorLogs(moderatorInput: string, weeks: number = 1): Promise<string> {
        try {
            let moderatorId = "unknown";
            let moderatorName = moderatorInput;

            // Check if input is a Discord mention
            const mentionMatch = moderatorInput.match(/<@!?(\d+)>/);
            if (mentionMatch) {
                moderatorId = mentionMatch[1];
                try {
                    const discordUser = await discordClient.users.fetch(moderatorId);
                    moderatorName = discordUser.tag || discordUser.username;
                } catch (err) {
                    console.error(`[ERROR] Could not fetch Discord user for ID: ${moderatorId}`, err);
                }
            }

            // Search by ID combined with name
            const baseDir = this.BASE_DIR;
            const allDirs = fs.existsSync(baseDir) ? fs.readdirSync(baseDir) : [];

            // Look for directories that match either ID or name
            const matchingDirs = allDirs.filter(dir =>
                dir === moderatorName ||
                dir.includes(moderatorId) ||
                dir.toLowerCase().includes(moderatorName.toLowerCase())
            );

            if (matchingDirs.length === 0) {
                return `No logs found for ${moderatorName}. Try using their exact username or Discord mention.`;
            }

            let combinedLogs = `### Activity Logs for ${moderatorName} ###\n\n`;

            // Check all matching directories
            for (const dirName of matchingDirs) {
                const modDir = path.join(baseDir, dirName);

                // Get log files sorted by date (newest first)
                const files = fs.readdirSync(modDir)
                    .filter(file => file.endsWith('.log'))
                    .sort()
                    .reverse()
                    .slice(0, weeks);

                for (const file of files) {
                    const filePath = path.join(modDir, file);
                    const fileContent = fs.readFileSync(filePath, 'utf8');

                    combinedLogs += `--- Week of ${file.replace('.log', '')} (${dirName}) ---\n\n`;
                    combinedLogs += fileContent;
                    combinedLogs += '\n';
                }
            }

            return combinedLogs;
        } catch (error) {
            console.error('[ERROR] Error retrieving logs:', error);
            return `Error retrieving logs: ${error.message}`;
        }
    }

    /**
     * Get all logs for all moderators for a specific week
     */
    static async getAllLogs(date: Date = new Date()): Promise<string> {
        try {
            const weekStart = this.getWeekStartDate(date);
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);

            const fileName = `${this.formatDate(weekStart)}_to_${this.formatDate(weekEnd)}.log`;
            const allUserPath = path.join(this.BASE_DIR, 'all_users', fileName);

            if (!fs.existsSync(allUserPath)) {
                return `No logs found for week of ${this.formatDate(weekStart)}`;
            }

            const fileContent = fs.readFileSync(allUserPath, 'utf8');
            return `### All Activity Logs for Week of ${this.formatDate(weekStart)} ###\n\n${fileContent}`;
        } catch (error) {
            console.error('[ERROR] Error retrieving all logs:', error);
            return `Error retrieving logs: ${error.message}`;
        }
    }

    /**
     * Gets the Sunday date for a given date's week
     */
    private static getWeekStartDate(date: Date): Date {
        const result = new Date(date);
        result.setDate(date.getDate() - date.getDay()); // Set to Sunday
        result.setHours(0, 0, 0, 0); // Set to midnight
        return result;
    }

    /**
     * Format date as YYYY-MM-DD
     */
    private static formatDate(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Sanitize file name to avoid directory traversal and invalid characters
     */
    private static sanitizeFileName(name: string): string {
        return name.replace(/[\\/:*?"<>|]/g, '_');
    }
}