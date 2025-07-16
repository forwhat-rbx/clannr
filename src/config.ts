import { ActivityType } from 'discord.js';
import { BotConfig } from './structures/types';

export const config: BotConfig = {
    // ROBLOX GROUP CONFIGURATION
    groupId: 35102492, // Replace with your Roblox group ID (found in group URL)

    // COMMAND SETTINGS
    slashCommands: true, // Enable Discord slash commands
    legacyCommands: {
        enabled: true, // Enable traditional prefix commands
        prefixes: ['-'], // Command prefixes (e.g., -rank, -promote)
    },

    // USER PERMISSIONS (Discord User IDs)
    // Add Discord user IDs to grant specific permissions
    permissions: {
        all: [''], // Full bot permissions - ADMIN ONLY
        ranking: [''], // Can promote/demote users
        shout: [''], // Can send group shouts/
        join: [''], // Can accept/decline join requests as well as add XP. If you want to change this, you need to change the permission in the file (src/commands/xp/xp.ts)
        signal: [''], // Can send signals/announcements
        admin: [''], // Administrative functions
    },

    // DISCORD CHANNEL IDS FOR LOGGING
    // Replace with your Discord channel IDs where you want logs
    logChannels: {
        actions: '', // Logs rank changes, warnings, kicks, etc.
        shout: '', // Logs when group shouts are sent
        rankup: '', // Logs automatic rank promotions from XP system
        verification: '', // Logs user verification events
    },

    // API AND VERIFICATION SETTINGS
    api: true, // Enable API endpoints for external integrations
    maximumRank: 255, // Highest rank the bot can promote to (Roblox rank number)
    verificationChecks: false, // Enable additional verification requirements
    bloxlinkGuildId: '', // Your Discord server ID (for Bloxlink integration)

    // PUNISHMENT RANKS, I don't personally use these, but they are here for you to use
    firedRank: 1, // Roblox rank number for fired members
    suspendedRank: 1, // Roblox rank number for suspended members
    recordManualActions: true, // Log manual promotions/demotions done outside the bot

    // MEMBER COUNT DISPLAY
    memberCount: {
        enabled: true, // Show member count in a Discord channel
        channelId: '', // Discord channel ID to display count in
        milestone: 1000, // Celebrate when reaching multiples of this number
        onlyMilestones: false, // Only update on milestones vs. real-time updates
    },

    // XP RANKING SYSTEM
    // Users gain XP over time and automatically rank up
    // Ranks are listed from lowest to highest
    xpSystem: {
        enabled: true, // Enable automatic XP-based promotions
        autoRankup: true, // Automatically promote when XP threshold is met
        roles: [
            // Each entry: rank = Roblox rank number, xp = XP required to reach it
            {
                rank: 5, // Roblox rank number
                xp: 40, // XP required to reach this rank
            },
            {
                rank: 10,
                xp: 100,
            },
            {
                rank: 15,
                xp: 150,
            },
            {
                rank: 20,
                xp: 300,
            },
            {
                rank: 25,
                xp: 500,
            },
            {
                rank: 40,
                xp: 1000,
            },
            // Add more ranks as needed - make sure XP values increase
        ],
    },

    // ANTI-ABUSE PROTECTION
    antiAbuse: {
        enabled: false, // Prevent spam/abuse of ranking commands
        clearDuration: 1 * 60, // Reset abuse counter after X seconds
        threshold: 10, // Number of actions before triggering protection
        demotionRank: 1, // Rank to demote abusers to
    },

    // BOT DISCORD PRESENCE
    activity: {
        enabled: true, // Show custom activity status
        type: ActivityType.Playing, // Playing, Watching, Listening, Streaming
        value: 'Typescript', // The text shown in bot's status
    },
    status: 'dnd', // Bot's online status: 'dnd', 'online', 'idle', 'invisible'

    // MODERATION SETTINGS
    deleteWallURLs: false, // Automatically delete URLs posted on group wall

    // DEVELOPMENT SETTINGS
    testGuildId: '1115179981866278933' // Discord server ID for testing new features
};