import { PrismaClient } from '@prisma/client';
import { Logger } from '../utils/logger';

export async function initializeDatabase() {
    const prisma = new PrismaClient();

    try {
        Logger.info('Checking database schema...', 'Database');

        // Test if the User table exists by running a simple query
        await prisma.user.findFirst();
        Logger.info('Database schema already exists', 'Database');
    } catch (error) {
        if (error.code === 'P2021') {
            Logger.info('Database tables not found, running initialization...', 'Database');

            try {
                // Try to run a manual schema push (safer than migration in production)
                await prisma.$executeRaw`
                CREATE TABLE IF NOT EXISTS "User" (
                    "id" TEXT NOT NULL PRIMARY KEY,
                    "robloxId" TEXT NOT NULL UNIQUE,
                    "xp" INTEGER NOT NULL DEFAULT 0,
                    "raids" INTEGER NOT NULL DEFAULT 0,
                    "defenses" INTEGER NOT NULL DEFAULT 0,
                    "scrims" INTEGER NOT NULL DEFAULT 0,
                    "trainings" INTEGER NOT NULL DEFAULT 0,
                    "suspendedUntil" DATETIME,
                    "unsuspendRank" INTEGER,
                    "isBanned" BOOLEAN NOT NULL DEFAULT false,
                    "lastRaid" DATETIME,
                    "lastDefense" DATETIME,
                    "lastScrim" DATETIME,
                    "lastTraining" DATETIME,
                    "lastActivity" DATETIME
                )`;

                await prisma.$executeRaw`
                CREATE TABLE IF NOT EXISTS "XpLog" (
                    "id" TEXT NOT NULL PRIMARY KEY,
                    "robloxId" TEXT NOT NULL,
                    "amount" INTEGER NOT NULL,
                    "reason" TEXT,
                    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                )`;

                await prisma.$executeRaw`
                CREATE TABLE IF NOT EXISTS "UserLink" (
                    "discordId" TEXT NOT NULL PRIMARY KEY,
                    "robloxId" TEXT NOT NULL
                )`;

                // Add GuildConfig table
                await prisma.$executeRaw`
                CREATE TABLE IF NOT EXISTS "GuildConfig" (
                    "id" TEXT NOT NULL PRIMARY KEY,
                    "guildId" TEXT NOT NULL UNIQUE,
                    "nicknameFormat" TEXT NOT NULL DEFAULT '{robloxUsername}',
                    "verificationChannelId" TEXT,
                    "verificationMessageId" TEXT
                    "autoUpdateEnabled" BOOLEAN DEFAULT true
                )`;

                Logger.info('Database schema created successfully', 'Database');
            } catch (dbError) {
                Logger.error('Failed to create database schema', 'Database', dbError);
            }
        } else {
            Logger.error('Unexpected error during database check', 'Database', error);
        }
    } finally {
        await prisma.$disconnect();
    }
}