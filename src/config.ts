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
        all: ['1248472145676210237', '1252315853844779099', '1115184793659904020'], // (HICOM) (ENGINEER) (4W SERVER)
        ranking: ['1225166398574301196', '1248472145676210237', '1252315853844779099'], //removexp, , promote (OFFICER) (HICOM) (ENGINEER)
        users: ['1262408265724203068', '1225166398574301196', '1248472145676210237', '1252315853844779099'], // pender perms (CSM) (OFFICER) (HICOM) (ENGINEER) 
        shout: [''],
        join: ['1252321421623824496', '1225166398574301196'], //adxp (NCO) (OFFICER)
        signal: [''],
        admin: ['1248472145676210237', '1252315853844779099'], // (HICOM) (ENGINEER)
    },
    logChannels: {
        actions: '1117017221873537085',
        shout: '1117017221873537085',
        rankup: '1117017221873537085',
    },
    api: true,
    maximumRank: 255,
    verificationChecks: false,
    bloxlinkGuildId: '1225166398532223116',
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