import { CommandContext } from '../../structures/addons/CommandAddons';
import Command from '../../structures/Command';
import { createBaseEmbed } from '../../utils/embedUtils';
import { config } from '../../config';
import { Logger } from '../../utils/logger';
import { prisma } from '../../database/prisma';
import fs from 'fs';
import path from 'path';

class CheckDBCommand extends Command {
    constructor() {
        super({
            trigger: 'checkdb',
            description: 'Check database health',
            type: 'ChatInput',
            module: 'admin',
            args: [
                {
                    trigger: 'action',
                    description: 'Action to perform',
                    type: 'String',
                    required: true,
                    choices: [
                        { name: 'Check Health', value: 'check' },
                        { name: 'Backup Verifications', value: 'backup' },
                        { name: 'Fix Schema', value: 'fixschema' }
                    ]
                }
            ],
            permissions: [
                {
                    type: 'role',
                    ids: config.permissions.admin,
                    value: true
                }
            ]
        });
    }

    async run(ctx: CommandContext) {
        try {
            await ctx.defer();
            const action = ctx.args['action'] as string;
            Logger.info(`Running checkdb command with action: ${action}`, 'CheckDB');

            if (action === 'check') {
                await this.checkHealth(ctx);
            } else if (action === 'backup') {
                await this.backupVerifications(ctx);
            } else if (action === 'fixschema') {
                await this.fixSchema(ctx);
            } else {
                await ctx.reply({
                    embeds: [
                        createBaseEmbed('danger')
                            .setTitle('Invalid Action')
                            .setDescription('Unknown action specified.')
                    ],
                    ephemeral: true
                });
            }
        } catch (err) {
            Logger.error('Error in checkdb command:', 'CheckDB', err as Error);
            await ctx.reply({
                embeds: [
                    createBaseEmbed('danger')
                        .setTitle('Error')
                        .setDescription(`Failed to check database: ${err.message}`)
                ],
                ephemeral: true
            });
        }
    }

    async checkHealth(ctx: CommandContext) {
        Logger.info('Running database health check', 'CheckDB');
        // Check for SQLite database issues
        const statusReport = {
            databaseExists: false,
            tableCount: 0,
            userCount: 0,
            verificationCount: 0,
            schemaValid: false,
            issuesFound: [] as string[]
        };

        try {
            // Check if database file exists
            const dbPath = path.join(process.cwd(), 'qbotdata.db');
            statusReport.databaseExists = fs.existsSync(dbPath);
            Logger.info(`Database exists: ${statusReport.databaseExists}`, 'CheckDB');

            if (!statusReport.databaseExists) {
                statusReport.issuesFound.push('Database file not found!');
            } else {
                // Check UserLink table structure
                try {
                    // Check if the UserLink table exists and has the right structure
                    const tableInfo = await prisma.$queryRaw`PRAGMA table_info(UserLink)`;

                    const columns = tableInfo as any[];
                    const hasDiscordId = columns.some(col => col.name === 'discordId');
                    const hasRobloxId = columns.some(col => col.name === 'robloxId');

                    if (!hasDiscordId || !hasRobloxId) {
                        statusReport.issuesFound.push('UserLink table is missing required columns!');
                    } else {
                        statusReport.schemaValid = true;
                    }
                } catch (schemaErr) {
                    statusReport.issuesFound.push(`Schema validation error: ${schemaErr.message}`);
                    Logger.error('Schema validation error:', 'CheckDB', schemaErr as Error);
                }

                // Get table counts
                try {
                    const tables = await prisma.$queryRaw`SELECT name FROM sqlite_master WHERE type='table'`;
                    statusReport.tableCount = (tables as any[]).length;
                    Logger.info(`Found ${statusReport.tableCount} tables`, 'CheckDB');
                } catch (tableErr) {
                    statusReport.issuesFound.push(`Failed to count tables: ${tableErr.message}`);
                    Logger.error('Failed to count tables:', 'CheckDB', tableErr as Error);
                }

                // Count user records
                try {
                    const userCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM User`;
                    statusReport.userCount = (userCount as any[])[0].count;
                    Logger.info(`Found ${statusReport.userCount} users`, 'CheckDB');
                } catch (userErr) {
                    statusReport.issuesFound.push(`Failed to count users: ${userErr.message}`);
                    Logger.error('Failed to count users:', 'CheckDB', userErr as Error);
                }

                // Count verification links
                try {
                    const verificationCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM UserLink`;
                    statusReport.verificationCount = (verificationCount as any[])[0].count;
                    Logger.info(`Found ${statusReport.verificationCount} verification links`, 'CheckDB');
                } catch (verErr) {
                    statusReport.issuesFound.push(`Failed to count verifications: ${verErr.message}`);
                    Logger.error('Failed to count verifications:', 'CheckDB', verErr as Error);
                }
            }

            // Create report embed
            const reportEmbed = createBaseEmbed(statusReport.issuesFound.length ? 'warning' : 'success')
                .setTitle('Database Health Check')
                .addFields([
                    { name: 'Database File', value: statusReport.databaseExists ? '✅ Found' : '❌ Missing' },
                    { name: 'Schema Valid', value: statusReport.schemaValid ? '✅ Valid' : '❌ Invalid' },
                    { name: 'Tables', value: statusReport.tableCount.toString() },
                    { name: 'User Records', value: statusReport.userCount.toString() },
                    { name: 'Verification Links', value: statusReport.verificationCount.toString() }
                ]);

            if (statusReport.issuesFound.length) {
                reportEmbed.addFields({
                    name: 'Issues Found',
                    value: statusReport.issuesFound.join('\n')
                });

                reportEmbed.addFields({
                    name: 'Recommendation',
                    value: 'Run `/checkdb action:backup` to back up your verification data, then `/checkdb action:fixschema` to fix any schema issues.'
                });
            }

            Logger.info('Sending database health report to Discord', 'CheckDB');
            await ctx.reply({ embeds: [reportEmbed] });
        } catch (err) {
            Logger.error('Error in checkHealth:', 'CheckDB', err as Error);
            throw err;
        }
    }

    async backupVerifications(ctx: CommandContext) {
        Logger.info('Starting verification backup', 'CheckDB');
        try {
            // Get all verification links
            const verificationLinks = await prisma.userLink.findMany();
            Logger.info(`Found ${verificationLinks.length} verification links to back up`, 'CheckDB');

            // Create backup object
            const backup = {};
            verificationLinks.forEach(link => {
                backup[link.discordId] = link.robloxId;
            });

            // Save to file
            const backupPath = path.join(process.cwd(), 'verification_backup.json');
            fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));

            Logger.info(`Saved backup to ${backupPath}`, 'CheckDB');
            await ctx.reply({
                embeds: [
                    createBaseEmbed('success')
                        .setTitle('Backup Complete')
                        .setDescription(`Backed up ${verificationLinks.length} verification links to ${backupPath}`)
                ]
            });
        } catch (err) {
            Logger.error('Error in backupVerifications:', 'CheckDB', err as Error);
            throw err;
        }
    }

    async fixSchema(ctx: CommandContext) {
        Logger.info('Starting schema fix', 'CheckDB');
        try {
            // Try to fix UserLink table if needed
            try {
                // Check if UserLink table exists
                const tables = await prisma.$queryRaw`
                    SELECT name FROM sqlite_master 
                    WHERE type='table' AND name='UserLink'
                `;

                const tableExists = (tables as any[]).length > 0;
                Logger.info(`UserLink table exists: ${tableExists}`, 'CheckDB');

                if (!tableExists) {
                    // Create UserLink table
                    await prisma.$executeRaw`
                        CREATE TABLE UserLink (
                            discordId TEXT PRIMARY KEY,
                            robloxId TEXT NOT NULL,
                            verifiedAt DATETIME DEFAULT CURRENT_TIMESTAMP
                        )
                    `;
                    Logger.info('Created UserLink table', 'CheckDB');
                } else {
                    // Check if verifiedAt column exists
                    const columns = await prisma.$queryRaw`PRAGMA table_info(UserLink)`;
                    const hasVerifiedAt = (columns as any[]).some(col => col.name === 'verifiedAt');
                    Logger.info(`verifiedAt column exists: ${hasVerifiedAt}`, 'CheckDB');

                    if (!hasVerifiedAt) {
                        // Add verifiedAt column
                        await prisma.$executeRaw`
                            ALTER TABLE UserLink 
                            ADD COLUMN verifiedAt DATETIME DEFAULT CURRENT_TIMESTAMP
                        `;
                        Logger.info('Added verifiedAt column to UserLink table', 'CheckDB');
                    }
                }
            } catch (schemaErr) {
                Logger.error('Failed to fix schema:', 'CheckDB', schemaErr as Error);
                throw new Error(`Failed to fix schema: ${schemaErr.message}`);
            }

            Logger.info('Schema fix completed successfully', 'CheckDB');
            await ctx.reply({
                embeds: [
                    createBaseEmbed('success')
                        .setTitle('Schema Fixed')
                        .setDescription('Database schema has been fixed. Run `/checkdb action:check` to verify.')
                ]
            });
        } catch (err) {
            Logger.error('Error in fixSchema:', 'CheckDB', err as Error);
            throw err;
        }
    }
}

export default CheckDBCommand;