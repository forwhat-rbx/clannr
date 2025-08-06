import { prisma } from '../database/prisma';
import { Logger } from './logger';
import fs from 'fs';
import path from 'path';

// Path to backup file
const BACKUP_FILE = path.join(process.cwd(), 'verification_backup.json');

export class DatabaseMonitor {
    // Run this daily to keep the backup file updated
    static async updateBackup() {
        try {
            // Get all verification links
            const verificationLinks = await prisma.userLink.findMany();

            // Create backup object
            const backup = {};
            verificationLinks.forEach(link => {
                backup[link.discordId] = link.robloxId;
            });

            // Save to file
            fs.writeFileSync(BACKUP_FILE, JSON.stringify(backup, null, 2));

            Logger.info(`Updated verification backup with ${verificationLinks.length} links`, "DatabaseMonitor");
            return true;
        } catch (err) {
            Logger.error('Failed to update verification backup:', "DatabaseMonitor", err as Error);
            return false;
        }
    }

    // Run this on startup to detect issues
    static async checkDatabase() {
        try {
            // Check if we need to restore from backup
            let shouldRestore = false;

            try {
                // Check if UserLink table exists and has records
                const result = await prisma.$queryRaw`SELECT COUNT(*) as count FROM UserLink`;
                const count = (result as any[])[0].count;

                // If we have fewer records in DB than backup, restore
                if (fs.existsSync(BACKUP_FILE)) {
                    const backupData = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf8'));
                    const backupCount = Object.keys(backupData).length;

                    if (backupCount > count) {
                        Logger.warn(`Backup has more records (${backupCount}) than database (${count})`, "DatabaseMonitor");
                        shouldRestore = true;
                    }
                }
            } catch (err) {
                Logger.error('Error checking database records:', "DatabaseMonitor", err as Error);
                shouldRestore = true;
            }

            if (shouldRestore) {
                await this.restoreFromBackup();
            }

            return true;
        } catch (err) {
            Logger.error('Failed to check database:', "DatabaseMonitor", err as Error);
            return false;
        }
    }

    // Restore verification data from backup file
    static async restoreFromBackup() {
        try {
            if (!fs.existsSync(BACKUP_FILE)) {
                Logger.warn('No backup file found for restoration', "DatabaseMonitor");
                return false;
            }

            const backupData = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf8'));
            const entries = Object.entries(backupData);

            Logger.info(`Restoring ${entries.length} verification links from backup`, "DatabaseMonitor");

            let restoredCount = 0;
            let errorCount = 0;

            for (const [discordId, robloxId] of entries) {
                try {
                    // Check if link already exists
                    const existingLink = await prisma.userLink.findUnique({
                        where: { discordId }
                    });

                    if (!existingLink) {
                        // Create new link
                        await prisma.userLink.create({
                            data: {
                                discordId,
                                robloxId: String(robloxId),
                                verifiedAt: new Date()
                            }
                        });
                        restoredCount++;
                    }
                } catch (err) {
                    errorCount++;
                    Logger.error(`Failed to restore link for ${discordId}:`, "DatabaseMonitor", err as Error);
                }
            }

            Logger.info(`Restored ${restoredCount} verification links (${errorCount} errors)`, "DatabaseMonitor");
            return true;
        } catch (err) {
            Logger.error('Failed to restore from backup:', "DatabaseMonitor", err as Error);
            return false;
        }
    }
}