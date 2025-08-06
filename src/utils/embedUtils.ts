import { EmbedBuilder, ColorResolvable } from 'discord.js';

// Change the footer text as desired.
const GLOBAL_FOOTER_TEXT = "Powered by Stryder Robotics";

// Enhanced color system
export const embedColors = {
    normal: '#333333',   // Default
    primary: '#333333',  // Same as normal for backward compatibility
    success: '#4CAF50',  // Green
    danger: '#992D22',   // Crimson red (not too bright)
    warning: '#FFA726',  // Orange

    // Verification-specific colors
    verificationSuccess: '#4CAF50',  // Same as success
    verificationFailed: '#992D22',   // Same as danger
    verificationPending: '#9157D6',  // Same as primary
    accountUnlinked: '#FFA726'       // Same as warning
};

export function createBaseEmbed(color: keyof typeof embedColors | string = 'normal'): EmbedBuilder {
    const colorValue = color in embedColors
        ? embedColors[color as keyof typeof embedColors]
        : (color.startsWith('#') ? color : '#373737ff'); // Use default if invalid color provided

    return new EmbedBuilder()
        .setFooter({ text: GLOBAL_FOOTER_TEXT })
        .setTimestamp()
        .setColor(colorValue as ColorResolvable);
}