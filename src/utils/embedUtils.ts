import { EmbedBuilder, ColorResolvable } from 'discord.js';

// Change the footer text as desired.
const GLOBAL_FOOTER_TEXT = "SOH Bot v2";

// Enhanced color system
export const embedColors = {
    normal: '#6699ff',  // Default blue
    success: '#4CAF50', // Green
    danger: '#992D22',  // Crimson red (not too bright)
    warning: '#FFA726'  // Orange
};

export function createBaseEmbed(color: keyof typeof embedColors | string = 'normal'): EmbedBuilder {
    const colorValue = color in embedColors
        ? embedColors[color as keyof typeof embedColors]
        : color;

    return new EmbedBuilder()
        .setFooter({ text: GLOBAL_FOOTER_TEXT })
        .setTimestamp()
        .setColor(colorValue as ColorResolvable);
}