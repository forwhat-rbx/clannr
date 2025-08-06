import { ActivityType } from 'discord.js';
import { BotConfig } from './structures/types';

export const config: BotConfig = {
    groupId: 35102492,
    slashCommands: true,
    legacyCommands: {
        enabled: true,
        prefixes: ['-'],
    },
    permissions: {
        all: ['1298718776996659300', '1297746235922452596', '1115184793659904020'], // COMMAND, +, FORWHAT
        ranking: ['1298718776996659300', '1297746235922452596', '1115184793659904020'],// COMMAND, +, FORWHAT
        users: ['1298718776996659300', '1297746235922452596', '1115184793659904020'],// COMMAND, +, FORWHAT
        shout: ['1298718776996659300', '1297746235922452596', '1115184793659904020'],// COMMAND, +, FORWHAT
        join: ['1298718776996659300', '1297746235922452596', '1298718941224370276', '1115184793659904020'],// COMMAND, +, OFFICER, FORWHAT
        signal: ['1298718776996659300', '1297746235922452596', '1115184793659904020'],// COMMAND, +, FORWHAT
        admin: ['1298718776996659300', '1297746235922452596', '1115184793659904020'],// COMMAND, +, FORWHAT
    },
    logChannels: {
        actions: '1389327967691214858',
        shout: '1389327967691214858',
        rankup: '1389327967691214858',
        verification: '1389327967691214858',
    },
    api: true,
    maximumRank: 255,
    verificationChecks: false,
    bloxlinkGuildId: '1297746235889025156',
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
                rank: 5,
                xp: 40,
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
        value: 'Valkyris Guard',
    },
    status: 'dnd',
    deleteWallURLs: false,
    testGuildId: '1115179981866278933'
};