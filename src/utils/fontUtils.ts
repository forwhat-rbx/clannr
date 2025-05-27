import Jimp from 'jimp';
import { Logger } from './logger';
import path from 'path';
import fs from 'fs';

// Font cache for performance
const fontCache: Record<string, any> = {};

// Define default Jimp fonts instead of custom paths
const FONT_PATHS = {
    SANS_14_BLACK: Jimp.FONT_SANS_14_BLACK,
    SANS_16_BLACK: Jimp.FONT_SANS_16_BLACK,
    SANS_32_BLACK: Jimp.FONT_SANS_32_BLACK,
    SANS_64_BLACK: Jimp.FONT_SANS_64_BLACK
};

/**
 * Load a font by size, with optional bold variant
 */
export async function loadFont(size: number, bold: boolean = false): Promise<any> {
    const fontKey = `${size}_${bold ? 'bold' : 'regular'}`;

    // Check cache first
    if (fontCache[fontKey]) {
        return fontCache[fontKey];
    }

    try {
        // Use Jimp's built-in fonts directly
        let fontConst;
        if (size <= 14) {
            fontConst = Jimp.FONT_SANS_14_BLACK;
        } else if (size <= 16) {
            fontConst = Jimp.FONT_SANS_16_BLACK;
        } else if (size <= 32) {
            fontConst = Jimp.FONT_SANS_32_BLACK;
        } else {
            fontConst = Jimp.FONT_SANS_64_BLACK;
        }

        // Load the font
        Logger.debug(`Loading font size: ${size}, bold: ${bold}, using: ${fontConst}`, 'FontUtils');
        const font = await Jimp.loadFont(fontConst);
        fontCache[fontKey] = font;
        return font;
    } catch (error) {
        Logger.error(`Failed to load font for size ${size}`, 'FontUtils', error);

        // Try to use the smallest font as fallback
        try {
            const fallbackFont = await Jimp.loadFont(Jimp.FONT_SANS_14_BLACK);
            fontCache[fontKey] = fallbackFont;
            return fallbackFont;
        } catch (fallbackError) {
            Logger.error('Failed to load fallback font', 'FontUtils', fallbackError);
            throw error;
        }
    }
}