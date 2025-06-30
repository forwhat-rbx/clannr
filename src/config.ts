import { ActivityType } from 'discord.js';
import { BotConfig } from './structures/types';

export const config: BotConfig = {
    groupId: 35102492,
    slashCommands: true,
    legacyCommands: {
        enabled: false,
        prefixes: ['-'],
    },
    permissions: {
        all: ['1297746235922452597', '1297746235922452598'], // VICE ADMIRAL, ADMIRAL
        ranking: ['1298718941224370276'], // OFFICER , 
        users: [''],
        shout: [''],
        join: [''],
        signal: [''],
        admin: [''],
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
        value: 'Valkyris Guard',
    },
    status: 'dnd',
    deleteWallURLs: false,
};