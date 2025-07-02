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
        all: ['1297746235922452597', '1297746235922452598'], // VICE ADMIRAL, ADMIRAL
        ranking: ['1298718941224370276', '1297746235922452597', '1297746235922452598'], // OFFICER , 
        users: ['1297746235922452597', '1297746235922452598'],
        shout: ['1297746235922452597', '1297746235922452598'],
        join: ['1297746235922452597', '1297746235922452598'],
        signal: ['1297746235922452597', '1297746235922452598'],
        admin: ['1297746235922452597', '1297746235922452598'],
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