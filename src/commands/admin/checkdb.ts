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
            description: 'Check database health and fix verification issues',
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
                        { name: 'Restore Verifications', value: 'restore' },
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

            if (action === 'check') {
                return this.checkHealth(ctx);
            } else if (action === 'backup') {
                return this.backupVerifications(ctx);
            } else if (action === 'restore') {
                return this.restoreVerifications(ctx);
            } else if (action === 'fixschema') {
                return this.fixSchema(ctx);
            }
        } catch (err) {
            Logger.error('Error in checkdb command:', 'CheckDB', err as Error);
            return ctx.reply({
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
                }

                // Get table counts
                try {
                    const tables = await prisma.$queryRaw`SELECT name FROM sqlite_master WHERE type='table'`;
                    statusReport.tableCount = (tables as any[]).length;
                } catch (tableErr) {
                    statusReport.issuesFound.push(`Failed to count tables: ${tableErr.message}`);
                }

                // Count user records
                try {
                    const userCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM User`;
                    statusReport.userCount = (userCount as any[])[0].count;
                } catch (userErr) {
                    statusReport.issuesFound.push(`Failed to count users: ${userErr.message}`);
                }

                // Count verification links
                try {
                    const verificationCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM UserLink`;
                    statusReport.verificationCount = (verificationCount as any[])[0].count;
                } catch (verErr) {
                    statusReport.issuesFound.push(`Failed to count verifications: ${verErr.message}`);
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

            return ctx.reply({ embeds: [reportEmbed] });
        } catch (err) {
            throw err;
        }
    }

    async backupVerifications(ctx: CommandContext) {
        try {
            // Get all verification links
            const verificationLinks = await prisma.userLink.findMany();

            // Create backup object
            const backup = {};
            verificationLinks.forEach(link => {
                backup[link.discordId] = link.robloxId;
            });

            // Save to file
            const backupPath = path.join(process.cwd(), 'verification_backup.json');
            fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));

            return ctx.reply({
                embeds: [
                    createBaseEmbed('success')
                        .setTitle('Backup Complete')
                        .setDescription(`Backed up ${verificationLinks.length} verification links to ${backupPath}`)
                ]
            });
        } catch (err) {
            throw err;
        }
    }

    async restoreVerifications(ctx: CommandContext) {
        try {
            // Check if backup file exists
            const backupPath = path.join(process.cwd(), 'verification_backup.json');
            if (!fs.existsSync(backupPath)) {
                return ctx.reply({
                    embeds: [
                        createBaseEmbed('danger')
                            .setTitle('Restore Failed')
                            .setDescription('No backup file found! Run `/checkdb action:backup` first.')
                    ]
                });
            }

            // Read backup file
            const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
            const entries = Object.entries(backupData);

            // Start restoration
            const progressMessage = await ctx.channel.send(`Restoring 0/${entries.length} verification links...`);

            let restoredCount = 0;
            let errorCount = 0;

            for (let i = 0; i < entries.length; i++) {
                const [discordId, robloxId] = entries[i];

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

                    // Update progress every 10 records
                    if (i % 10 === 0 || i === entries.length - 1) {
                        await progressMessage.edit(
                            `Restoring ${i + 1}/${entries.length} verification links... ` +
                            `(${restoredCount} restored, ${errorCount} errors)`
                        );
                    }
                } catch (err) {
                    errorCount++;
                    Logger.error(`Failed to restore link for ${discordId}:`, 'CheckDB', err as Error);
                }
            }

            return ctx.reply({
                embeds: [
                    createBaseEmbed('success')
                        .setTitle('Restore Complete')
                        .setDescription(`Restored ${restoredCount} verification links (${errorCount} errors)`)
                ]
            });
        } catch (err) {
            throw err;
        }
    }

    async fixSchema(ctx: CommandContext) {
        try {
            // Try to fix UserLink table if needed
            try {
                // Check if UserLink table exists
                const tables = await prisma.$queryRaw`
                    SELECT name FROM sqlite_master 
                    WHERE type='table' AND name='UserLink'
                `;

                if ((tables as any[]).length === 0) {
                    // Create UserLink table
                    await prisma.$executeRaw`
                        CREATE TABLE UserLink (
                            discordId TEXT PRIMARY KEY,
                            robloxId TEXT NOT NULL,
                            verifiedAt DATETIME DEFAULT CURRENT_TIMESTAMP
                        )
                    `;
                } else {
                    // Check if verifiedAt column exists
                    const columns = await prisma.$queryRaw`PRAGMA table_info(UserLink)`;
                    const hasVerifiedAt = (columns as any[]).some(col => col.name === 'verifiedAt');

                    if (!hasVerifiedAt) {
                        // Add verifiedAt column
                        await prisma.$executeRaw`
                            ALTER TABLE UserLink 
                            ADD COLUMN verifiedAt DATETIME DEFAULT CURRENT_TIMESTAMP
                        `;
                    }
                }
            } catch (schemaErr) {
                throw new Error(`Failed to fix schema: ${schemaErr.message}`);
            }

            return ctx.reply({
                embeds: [
                    createBaseEmbed('success')
                        .setTitle('Schema Fixed')
                        .setDescription('Database schema has been fixed. Run `/checkdb action:check` to verify.')
                ]
            });
        } catch (err) {
            throw err;
        }
    }
}

export default CheckDBCommand;