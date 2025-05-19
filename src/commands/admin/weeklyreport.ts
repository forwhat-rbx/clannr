import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { config } from '../../config';
import { AttachmentBuilder } from 'discord.js';
import { ActivityLogger } from '../../utils/activityLogger';
import * as fs from 'fs';
import * as path from 'path';
import { createBaseEmbed } from '../../utils/embedUtils';

class WeeklyReportCommand extends Command {
    constructor() {
        super({
            trigger: 'weeklyreport',
            description: 'Generate and view the weekly activity report',
            type: 'ChatInput',
            module: 'admin',
            args: [
                {
                    trigger: 'weeks-ago',
                    description: 'How many weeks ago (0 for current week)',
                    type: 'Number',
                    required: false
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
        await ctx.defer();

        try {
            const weeksAgo = ctx.args['weeks-ago'] ? Number(ctx.args['weeks-ago']) : 0;

            if (isNaN(weeksAgo) || weeksAgo < 0 || weeksAgo > 52) {
                return ctx.reply({ content: 'Please provide a valid number of weeks ago (0-52).' });
            }

            // Calculate the target week date
            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() - (weeksAgo * 7));

            // Get all logs for that week
            const logs = await ActivityLogger.getAllLogs(targetDate);

            // Get the week start date for display
            const weekStart = this.getWeekStartDate(targetDate);
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);

            // Create temporary file
            const tempDir = path.join(process.cwd(), 'temp');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            const fileName = `weekly_report_${this.formatDate(weekStart)}.txt`;
            const filePath = path.join(tempDir, fileName);
            fs.writeFileSync(filePath, logs);

            // Create embed
            const embed = createBaseEmbed('primary')
                .setTitle('Weekly Activity Report')
                .setDescription(`Report for week of ${weekStart.toLocaleDateString()} to ${weekEnd.toLocaleDateString()}`)
                .setTimestamp();

            // Send file as attachment
            const attachment = new AttachmentBuilder(filePath, { name: fileName });

            return ctx.reply({
                content: `Here is the weekly activity report for ${weekStart.toLocaleDateString()} to ${weekEnd.toLocaleDateString()}:`,
                embeds: [embed],
                files: [attachment]
            });
        } catch (err) {
            console.error('Error generating weekly report:', err);
            return ctx.reply({ content: 'An error occurred while generating the weekly report.' });
        }
    }

    /**
     * Gets the Sunday date for a given date's week
     */
    private getWeekStartDate(date: Date): Date {
        const result = new Date(date);
        result.setDate(date.getDate() - date.getDay()); // Set to Sunday
        result.setHours(0, 0, 0, 0); // Set to midnight
        return result;
    }

    /**
     * Format date as YYYY-MM-DD
     */
    private formatDate(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
}

export default WeeklyReportCommand;