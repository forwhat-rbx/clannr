import { ActivityType } from 'discord.js';
import { BotConfig } from './structures/types';

export const config: BotConfig = {
    groupId: 32651490,
    slashCommands: true,
    legacyCommands: {
        enabled: true,
        prefixes: ['-'],
    },
    permissions: {
        all: ['1115184793659904020'],
        ranking: ['1115184793659904020'],
        users: ['1115184793659904020'],
        shout: ['1115184793659904020'],
        join: ['1115184793659904020'],
        signal: ['1115184793659904020'],
        admin: ['1115184793659904020'],
    },
    logChannels: {
        actions: '1304989133026099251',
        shout: '1304989133026099251',
        rankup: '1304989133026099251',
        verification: '1304989133026099251',
    },
    api: true,
    maximumRank: 255,
    verificationChecks: false,
    bloxlinkGuildId: '1115179981866278933',
    firedRank: 1,
    suspendedRank: 1,
    recordManualActions: true,
    memberCount: {
        enabled: true,
        channelId: '1117017221873537085',
        milestone: 1000,
        onlyMilestones: false,
    },
    xpSystem: {
        enabled: true,
        autoRankup: true,
        roles: [
            {
                rank: 3,
                xp: 10,
            },
            {
                rank: 4,
                xp: 25,
            },
            {
                rank: 5,
                xp: 50,
            },
            {
                rank: 6,
                xp: 70,
            },
            {
                rank: 7,
                xp: 100,
            },
            {
                rank: 8,
                xp: 150,
            },
        ],
    },
    antiAbuse: {
        enabled: false,
        clearDuration: 1 * 60,
        threshold: 10,
        demotionRank: 1,
    },
    activity: {
        enabled: true,
        type: ActivityType.Playing,
        value: 'Port Maersk',
    },
    status: 'dnd',
    deleteWallURLs: false,
};