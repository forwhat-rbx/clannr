import { EmbedBuilder, ColorResolvable } from 'discord.js';

// Change the footer text as desired.
const GLOBAL_FOOTER_TEXT = "Powered by Valkyris Systems";

// Enhanced color system
export const embedColors = {
    normal: '#72DCFF',   // Default blue
    primary: '#72DCFF',  // Same as normal for backward compatibility
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
        : (color.startsWith('#') ? color : '#72DCFF'); // Use default if invalid color provided

    return new EmbedBuilder()
        .setFooter({ text: GLOBAL_FOOTER_TEXT })
        .setTimestamp()
        .setColor(colorValue as ColorResolvable);
}