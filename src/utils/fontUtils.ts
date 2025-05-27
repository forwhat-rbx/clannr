import Jimp from 'jimp';
import { Logger } from './logger';
import path from 'path';

// Font cache for performance
const fontCache: Record<string, any> = {};

// Font constants - use string paths instead of deprecated constants
const FONT_PATHS = {
    SANS_14_BLACK: path.join(process.cwd(), 'node_modules/jimp/fonts/open-sans/open-sans-14-black.fnt'),
    SANS_16_BLACK: path.join(process.cwd(), 'node_modules/jimp/fonts/open-sans/open-sans-16-black.fnt'),
    SANS_32_BLACK: path.join(process.cwd(), 'node_modules/jimp/fonts/open-sans/open-sans-32-black.fnt'),
    SANS_64_BLACK: path.join(process.cwd(), 'node_modules/jimp/fonts/open-sans/open-sans-64-black.fnt')
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

    // Determine which font to load based on size
    let fontPath;
    if (size <= 14) {
        fontPath = FONT_PATHS.SANS_14_BLACK;
    } else if (size <= 16) {
        fontPath = FONT_PATHS.SANS_16_BLACK;
    } else if (size <= 32) {
        fontPath = FONT_PATHS.SANS_32_BLACK;
    } else {
        fontPath = FONT_PATHS.SANS_64_BLACK;
    }

    try {
        // Load the font and cache it
        const font = await Jimp.loadFont(fontPath);
        fontCache[fontKey] = font;
        return font;
    } catch (error) {
        Logger.error(`Failed to load font: ${fontPath}`, 'FontUtils', error);
        // Fallback to a default font
        return await Jimp.loadFont(FONT_PATHS.SANS_16_BLACK);
    }
}