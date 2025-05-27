import { discordClient, robloxClient, robloxGroup } from '../../main';
import { CommandContext } from '../../structures/addons/CommandAddons';
import { Command } from '../../structures/Command';
import { PartialUser, User, GroupMember } from 'bloxy/dist/structures';
import { getLinkedRobloxUser } from '../../handlers/accountLinks';
import { config } from '../../config';
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { provider } from '../../database';
import Jimp from 'jimp';
import { Logger } from '../../utils/logger';
import { findHighestEligibleRole } from '../ranking/xprankup';

// Font cache for performance
const fontCache: Record<string, any> = {};

// Helper function to convert hexadecimal color codes to Jimp color values
function hexToJimpColor(hex: string): number {
    // Remove # if present
    hex = hex.replace('#', '');

    // Handle short form (e.g. #ABC)
    if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }

    // Add alpha if needed
    if (hex.length === 6) {
        hex += 'FF';
    }

    // Convert to integer
    return parseInt(hex, 16);
}

// Helper function to draw rounded rectangle
async function roundedRect(image: Jimp, x: number, y: number, width: number, height: number, radius: number, color: number) {
    // Create a mask image with transparency
    const mask = new Jimp(width, height, 0x00000000);

    // Draw the rounded rectangle on the mask
    for (let i = 0; i < width; i++) {
        for (let j = 0; j < height; j++) {
            // Calculate distance from each corner
            const dx1 = i < radius ? radius - i : 0;
            const dy1 = j < radius ? radius - j : 0;
            const dx2 = i >= width - radius ? i - (width - radius - 1) : 0;
            const dy2 = j < radius ? radius - j : 0;
            const dx3 = i < radius ? radius - i : 0;
            const dy3 = j >= height - radius ? j - (height - radius - 1) : 0;
            const dx4 = i >= width - radius ? i - (width - radius - 1) : 0;
            const dy4 = j >= height - radius ? j - (height - radius - 1) : 0;

            // Check if pixel is inside the rounded rectangle
            if ((dx1 && dy1 && Math.sqrt(dx1 * dx1 + dy1 * dy1) > radius) ||
                (dx2 && dy2 && Math.sqrt(dx2 * dx2 + dy2 * dy2) > radius) ||
                (dx3 && dy3 && Math.sqrt(dx3 * dx3 + dy3 * dy3) > radius) ||
                (dx4 && dy4 && Math.sqrt(dx4 * dx4 + dy4 * dy4) > radius)) {
                continue; // Outside the rounded corners
            }

            // Set pixel as solid
            mask.setPixelColor(0xFFFFFFFF, i, j);
        }
    }

    // Create colored rectangle
    const rect = new Jimp(width, height, color);

    // Apply mask
    rect.mask(mask, 0, 0);

    // Composite onto main image
    image.composite(rect, x, y, {
        mode: Jimp.BLEND_SOURCE_OVER
    });

    return image;
}

// Helper function to draw sharp-edged rectangle
async function sharpRect(image: Jimp, x: number, y: number, width: number, height: number, cornerSize: number = 5, color: number) {
    // Create a mask image with transparency
    const mask = new Jimp(width, height, 0x00000000);

    // Draw the shape on the mask
    mask.scan(0, 0, width, height, (px, py, idx) => {
        // Skip the corners
        if ((px < cornerSize && py < cornerSize) ||
            (px >= width - cornerSize && py < cornerSize) ||
            (px < cornerSize && py >= height - cornerSize) ||
            (px >= width - cornerSize && py >= height - cornerSize)) {
            return;
        }

        // Set pixel as solid
        mask.setPixelColor(0xFFFFFFFF, px, py);
    });

    // Create colored rectangle
    const rect = new Jimp(width, height, color);

    // Apply mask
    rect.mask(mask, 0, 0);

    // Composite onto main image
    image.composite(rect, x, y, {
        mode: Jimp.BLEND_SOURCE_OVER
    });

    return image;
}

// Helper function to draw a star
async function drawStar(image: Jimp, cx: number, cy: number, outerRadius: number, innerRadius: number, color: number) {
    // Create a temporary canvas for the star
    const starSize = Math.max(outerRadius, innerRadius) * 2 + 4; // Add padding
    const starImg = new Jimp(starSize, starSize, 0x00000000);

    // Calculate star points
    const points = [];
    let rot = Math.PI / 2 * 3;
    const step = Math.PI / 5;

    for (let i = 0; i < 5; i++) {
        // Outer point
        let x1 = cx - Math.round(Math.cos(rot) * outerRadius);
        let y1 = cy - Math.round(Math.sin(rot) * outerRadius);
        points.push({ x: x1, y: y1 });
        rot += step;

        // Inner point
        let x2 = cx - Math.round(Math.cos(rot) * innerRadius);
        let y2 = cy - Math.round(Math.sin(rot) * innerRadius);
        points.push({ x: x2, y: y2 });
        rot += step;
    }

    // Draw filled polygon
    const offsetX = starSize / 2 - cx;
    const offsetY = starSize / 2 - cy;

    // Fill the star
    for (let x = 0; x < starSize; x++) {
        for (let y = 0; y < starSize; y++) {
            const realX = x - offsetX;
            const realY = y - offsetY;

            if (isPointInPolygon(realX, realY, points)) {
                starImg.setPixelColor(color, x, y);
            }
        }
    }

    // Composite star onto main image
    image.composite(starImg, cx - starSize / 2, cy - starSize / 2, {
        mode: Jimp.BLEND_SOURCE_OVER
    });

    return image;
}

// Helper function to check if a point is inside a polygon
function isPointInPolygon(x: number, y: number, polygon: { x: number, y: number }[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;

        const intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// Helper function to create worn edge effect
async function createWornEdge(image: Jimp, x: number, y: number, width: number, height: number) {
    const wornAmount = 1.2;
    const noise = 0.7;

    // Draw horizontal worn edges
    for (let i = 0; i < width; i += 12) {
        const distortTop = (Math.random() * noise - noise / 2) * wornAmount;
        const distortBottom = (Math.random() * noise - noise / 2) * wornAmount;

        // Top edge
        image.setPixelColor(0x32323280, x + i, y + Math.floor(distortTop));
        image.setPixelColor(0x32323280, x + i + 1, y + Math.floor(distortTop));

        // Bottom edge
        image.setPixelColor(0x32323280, x + i, y + height + Math.floor(distortBottom));
        image.setPixelColor(0x32323280, x + i + 1, y + height + Math.floor(distortBottom));
    }

    // Draw vertical worn edges
    for (let i = 0; i < height; i += 12) {
        const distortLeft = (Math.random() * noise - noise / 2) * wornAmount;
        const distortRight = (Math.random() * noise - noise / 2) * wornAmount;

        // Left edge
        image.setPixelColor(0x32323280, x + Math.floor(distortLeft), y + i);
        image.setPixelColor(0x32323280, x + Math.floor(distortLeft), y + i + 1);

        // Right edge
        image.setPixelColor(0x32323280, x + width + Math.floor(distortRight), y + i);
        image.setPixelColor(0x32323280, x + width + Math.floor(distortRight), y + i + 1);
    }

    return image;
}

// Print text with shadow
async function printTextWithShadow(image: Jimp, font: any, text: string, x: number, y: number, shadowColor: number = 0x00000080, shadowOffset: number = 1) {
    // Print shadow
    image.print(font, x + shadowOffset, y + shadowOffset, { text: text });

    // Print main text
    image.print(font, x, y, { text: text });

    return image;
}

// Load the font based on size
async function loadFont(size: number, bold: boolean = false): Promise<any> {
    const fontKey = `${size}_${bold ? 'bold' : 'regular'}`;

    // Check cache first
    if (fontCache[fontKey]) {
        return fontCache[fontKey];
    }

    // Determine which font to load based on size
    let fontPath;
    if (size <= 14) {
        fontPath = bold ? Jimp.FONT_SANS_14_BLACK : Jimp.FONT_SANS_14_BLACK;
    } else if (size <= 16) {
        fontPath = bold ? Jimp.FONT_SANS_16_BLACK : Jimp.FONT_SANS_16_BLACK;
    } else if (size <= 32) {
        fontPath = bold ? Jimp.FONT_SANS_32_BLACK : Jimp.FONT_SANS_32_BLACK;
    } else {
        fontPath = bold ? Jimp.FONT_SANS_64_BLACK : Jimp.FONT_SANS_64_BLACK;
    }

    try {
        // Load the font and cache it
        const font = await Jimp.loadFont(fontPath);
        fontCache[fontKey] = font;
        return font;
    } catch (error) {
        Logger.error(`Failed to load font: ${fontPath}`, 'XPCard', error);
        // Fallback to a default font
        return await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
    }
}

// Generate a stunning XP composite image with advanced styling
const generateCompositeImage = async (
    backgroundUrl: string,
    userName: string,
    userRank: string,
    currentXP: number,
    nextXP: number | null,
    avatarUrl: string,
    attendance: {
        raids: number;
        defenses: number;
        scrims: number;
        trainings: number;
    }
) => {
    try {
        // FIXED: Updated URLs to more reliable sources
        const newBackgroundUrl = 'https://i.ibb.co/fYpTNw9/NEW-SOH-BACK.png'; // Dark tech background
        const frontLogoUrl = 'https://i.ibb.co/xSrQvRCW/NEW-SOH-FRONT.png'; // Generic logo placeholder

        const width = 1000;
        const height = 400;

        // Create base canvas
        let image = new Jimp(width, height, 0x00000000);

        // Load and draw main background with better error handling
        try {
            const background = await Jimp.read(newBackgroundUrl);
            background.resize(width, height);
            image.composite(background, 0, 0);

            // Add overlay gradient for better readability (simulated with semi-transparent rectangle)
            const overlay = new Jimp(width, height, 0x0A0C1266);
            image.composite(overlay, 0, 0);
        } catch (error) {
            Logger.error(`Failed to load background image: ${newBackgroundUrl}`, 'XPCard', error);

            // Fallback: create a gradient background by filling with a dark color
            image.scan(0, 0, width, height, (x, y, idx) => {
                // Create a gradient from top to bottom
                const factor = y / height;
                const r = Math.floor(22 + factor * 10);
                const g = Math.floor(25 + factor * 10);
                const b = Math.floor(33 + factor * 10);
                const color = (r << 24) + (g << 16) + (b << 8) + 255;
                image.setPixelColor(color, x, y);
            });
        }

        // Create card background
        const cardX = 40;
        const cardY = 40;
        const cardWidth = width - 80;
        const cardHeight = height - 80;

        // Create the card with a dark semi-transparent background
        await sharpRect(image, cardX, cardY, cardWidth, cardHeight, 8, 0x16161CE6);

        // Add a border to the card
        const borderColor = 0x8A8A9AFF;
        image.scan(cardX, cardY, cardWidth, 2, (x, y, idx) => {
            image.setPixelColor(borderColor, x, y);
        });
        image.scan(cardX, cardY + cardHeight - 2, cardWidth, 2, (x, y, idx) => {
            image.setPixelColor(borderColor, x, y);
        });
        image.scan(cardX, cardY, 2, cardHeight, (x, y, idx) => {
            image.setPixelColor(borderColor, x, y);
        });
        image.scan(cardX + cardWidth - 2, cardY, 2, cardHeight, (x, y, idx) => {
            image.setPixelColor(borderColor, x, y);
        });

        // Add tech pattern overlay
        for (let i = 0; i < width; i += 60) {
            // Vertical lines
            const lineColor = i % 180 === 0 ? 0x90A0FF12 : 0xAAAAAA12;
            const lineWidth = i % 180 === 0 ? 1 : 1;

            for (let y = 0; y < height; y++) {
                for (let w = 0; w < lineWidth; w++) {
                    if (i + w < width) {
                        image.setPixelColor(lineColor, i + w, y);
                    }
                }
            }
        }

        for (let i = 0; i < height; i += 60) {
            // Horizontal lines
            const lineColor = i % 180 === 0 ? 0x90A0FF12 : 0xAAAAAA12;
            const lineWidth = i % 180 === 0 ? 1 : 1;

            for (let x = 0; x < width; x++) {
                for (let w = 0; w < lineWidth; w++) {
                    if (i + w < height) {
                        image.setPixelColor(lineColor, x, i + w);
                    }
                }
            }

            // Add data points at intersections
            if (i % 180 === 0) {
                for (let j = 0; j < width; j += 180) {
                    // Draw small blue dots at intersections
                    for (let dx = -1; dx <= 1; dx++) {
                        for (let dy = -1; dy <= 1; dy++) {
                            if (j + dx >= 0 && j + dx < width && i + dy >= 0 && i + dy < height) {
                                image.setPixelColor(0x78B4FFB3, j + dx, i + dy);
                            }
                        }
                    }
                }
            }
        }

        // Add worn edge effect
        await createWornEdge(image, cardX, cardY, cardWidth, cardHeight);

        // Avatar positioning
        const avatarSize = 100;
        const avatarX = cardX + 60;
        const avatarY = cardY + 30;

        // Load and draw avatar
        let avatar;
        try {
            avatar = await Jimp.read(avatarUrl);
            avatar.resize(avatarSize, avatarSize);

            // Create circular mask for avatar
            const mask = new Jimp(avatarSize, avatarSize, 0x00000000);
            mask.scan(0, 0, avatarSize, avatarSize, (x, y, idx) => {
                const centerX = avatarSize / 2;
                const centerY = avatarSize / 2;
                const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));

                if (distance <= avatarSize / 2) {
                    mask.setPixelColor(0xFFFFFFFF, x, y);
                }
            });

            // Add glow effect around avatar
            const glowSize = 15;
            for (let x = avatarX - glowSize; x < avatarX + avatarSize + glowSize; x++) {
                for (let y = avatarY - glowSize; y < avatarY + avatarSize + glowSize; y++) {
                    if (x >= 0 && x < width && y >= 0 && y < height) {
                        const centerX = avatarX + avatarSize / 2;
                        const centerY = avatarY + avatarSize / 2;
                        const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));

                        if (distance > avatarSize / 2 && distance <= avatarSize / 2 + glowSize) {
                            // Calculate glow intensity (1.0 at edge of avatar, 0.0 at edge of glow)
                            const intensity = 1 - ((distance - avatarSize / 2) / glowSize);
                            const alpha = Math.floor(intensity * 180); // Max alpha of 0.7

                            // Blue glow color
                            const glowColor = (100 << 24) | (150 << 16) | (230 << 8) | alpha;

                            // Only set pixel if it's more intense than what's already there
                            const currentColor = image.getPixelColor(x, y);
                            const currentAlpha = currentColor & 0xFF;

                            if (alpha > currentAlpha) {
                                image.setPixelColor(glowColor, x, y);
                            }
                        }
                    }
                }
            }

            // Apply circular mask to avatar
            avatar.mask(mask, 0, 0);

            // Draw metallic ring around avatar
            for (let angle = 0; angle < Math.PI * 2; angle += 0.01) {
                const ringRadius = avatarSize / 2 + 3;
                const x = Math.round(avatarX + avatarSize / 2 + Math.cos(angle) * ringRadius);
                const y = Math.round(avatarY + avatarSize / 2 + Math.sin(angle) * ringRadius);

                // Gradient based on angle
                let brightness = 176 + Math.floor(80 * Math.sin(angle));
                const ringColor = (brightness << 24) | (brightness << 16) | (brightness << 8) | 0xFF;

                if (x >= 0 && x < width && y >= 0 && y < height) {
                    image.setPixelColor(ringColor, x, y);
                }
            }

            // Draw bolts
            for (let i = 0; i < 4; i++) {
                const angle = i * Math.PI / 2;
                const boltX = Math.round(avatarX + avatarSize / 2 + Math.cos(angle) * (avatarSize / 2 + 6));
                const boltY = Math.round(avatarY + avatarSize / 2 + Math.sin(angle) * (avatarSize / 2 + 6));

                // Draw bolt
                for (let dx = -2; dx <= 2; dx++) {
                    for (let dy = -2; dy <= 2; dy++) {
                        if (boltX + dx >= 0 && boltX + dx < width && boltY + dy >= 0 && boltY + dy < height) {
                            const distance = Math.sqrt(dx * dx + dy * dy);
                            if (distance <= 2.5) {
                                // Metallic gradient for bolt
                                const brightness = 160 + Math.floor(40 * (1 - distance / 2.5));
                                const boltColor = (brightness << 24) | (brightness << 16) | (brightness << 8) | 0xFF;
                                image.setPixelColor(boltColor, boltX + dx, boltY + dy);
                            }
                        }
                    }
                }

                // Bolt highlight
                if (boltX - 1 >= 0 && boltX - 1 < width && boltY - 1 >= 0 && boltY - 1 < height) {
                    image.setPixelColor(0xFFFFFFCC, boltX - 1, boltY - 1);
                }
            }

            // Draw avatar
            image.composite(avatar, avatarX, avatarY);
        } catch (error) {
            Logger.error(`Failed to load avatar image: ${avatarUrl}`, 'XPCard', error);

            // Create a fallback avatar
            const fallbackAvatar = new Jimp(avatarSize, avatarSize, 0x2A2A33FF);

            // Add a question mark to the fallback avatar
            const fallbackFont = await loadFont(32);
            fallbackAvatar.print(fallbackFont, avatarSize / 2 - 10, avatarSize / 2 - 16, { text: '?' });

            // Apply circular mask
            const mask = new Jimp(avatarSize, avatarSize, 0x00000000);
            mask.scan(0, 0, avatarSize, avatarSize, (x, y, idx) => {
                const centerX = avatarSize / 2;
                const centerY = avatarSize / 2;
                const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));

                if (distance <= avatarSize / 2) {
                    mask.setPixelColor(0xFFFFFFFF, x, y);
                }
            });

            fallbackAvatar.mask(mask, 0, 0);
            image.composite(fallbackAvatar, avatarX, avatarY);
        }

        // Determine rank level for decorative emblems
        const rankLevel = userRank.toLowerCase().includes('commander') ? 5 :
            userRank.toLowerCase().includes('officer') ? 4 :
                userRank.toLowerCase().includes('captain') ? 3 :
                    userRank.toLowerCase().includes('sergeant') ? 2 : 1;

        // Username and rank positioning
        const nameX = avatarX + avatarSize + 30;
        const nameY = avatarY + 35;

        // Load fonts for text
        const usernameFont = await loadFont(38, true);
        const rankFont = await loadFont(26);

        // Draw username
        await printTextWithShadow(image, usernameFont, userName, nameX, nameY - 30);

        // Draw rank emblems for higher ranks
        if (rankLevel > 2) {
            // Measure text width (approximate)
            const textWidth = userName.length * 20; // Rough approximation

            for (let i = 0; i < rankLevel - 2; i++) {
                const emblemX = nameX + textWidth + 20 + (i * 25);
                // Draw star with glow
                await drawStar(image, emblemX, nameY - 15, 10, 5, 0xD0D0E0FF);
            }
        }

        // Draw rank badge
        const rankText = `${userRank}`;
        const rankWidth = rankText.length * 12 + 20; // Approximate width
        const rankX = nameX;
        const rankY = nameY + 20;

        // Badge background
        await roundedRect(image, rankX, rankY, rankWidth, 36, 5, 0x1E1E26E6);

        // Badge border
        for (let x = rankX; x < rankX + rankWidth; x++) {
            // Top and bottom border
            image.setPixelColor(0x8A8A9AFF, x, rankY);
            image.setPixelColor(0x8A8A9AFF, x, rankY + 35);
        }

        for (let y = rankY; y < rankY + 36; y++) {
            // Left and right border
            image.setPixelColor(0x8A8A9AFF, rankX, y);
            image.setPixelColor(0x8A8A9AFF, rankX + rankWidth - 1, y);
        }

        // Print rank text in light blue
        image.print(rankFont, rankX + 10, rankY + 5, {
            text: rankText,
            alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT,
            alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE
        }, 0, 0, {
            r: 160, g: 208, b: 255, a: 255
        });

        // Modern tech-style progress bar
        const progressBarWidth = cardWidth - 120;
        const progressBarHeight = 26;
        const progressX = cardX + 60;
        const progressY = avatarY + avatarSize + 25;
        const progress = nextXP ? Math.min(currentXP / nextXP, 1) : 1;
        const filledWidth = Math.round(progress * progressBarWidth);

        // Progress bar background
        const barBg = new Jimp(progressBarWidth, progressBarHeight, 0x16161CF2);
        image.composite(barBg, progressX, progressY);

        // Progress bar border
        for (let x = progressX; x < progressX + progressBarWidth; x++) {
            image.setPixelColor(0x505060FF, x, progressY);
            image.setPixelColor(0x505060FF, x, progressY + progressBarHeight - 1);
        }
        for (let y = progressY; y < progressY + progressBarHeight; y++) {
            image.setPixelColor(0x505060FF, progressX, y);
            image.setPixelColor(0x505060FF, progressX + progressBarWidth - 1, y);
        }

        // Add tech pattern to empty bar
        for (let i = 0; i < progressBarWidth; i += 8) {
            for (let y = progressY; y < progressY + progressBarHeight; y++) {
                image.setPixelColor(0x60607019, progressX + i, y);
            }
        }

        // Fill progress bar
        if (filledWidth > 0) {
            // Create a blue gradient for the progress bar
            const barFill = new Jimp(filledWidth, progressBarHeight, 0x00000000);
            barFill.scan(0, 0, filledWidth, progressBarHeight, (x, y, idx) => {
                // Gradient from left to right
                const factor = x / filledWidth;
                const r = Math.floor(16 + factor * 60);
                const g = Math.floor(96 + factor * 80);
                const b = Math.floor(192 + factor * 63);
                const color = (r << 24) | (g << 16) | (b << 8) | 255;
                barFill.setPixelColor(color, x, y);
            });

            // Add scanline effect
            for (let i = 0; i < progressBarHeight; i += 4) {
                for (let x = 0; x < filledWidth; x++) {
                    const currentColor = barFill.getPixelColor(x, i);
                    // Make it slightly brighter
                    const r = Math.min(255, ((currentColor >> 24) & 0xFF) + 20);
                    const g = Math.min(255, ((currentColor >> 16) & 0xFF) + 20);
                    const b = Math.min(255, ((currentColor >> 8) & 0xFF) + 20);
                    const newColor = (r << 24) | (g << 16) | (b << 8) | 255;
                    barFill.setPixelColor(newColor, x, i);
                }
            }

            image.composite(barFill, progressX, progressY);
        }

        // Add XP text
        const xpFont = await loadFont(16, true);
        const xpText = `XP: ${currentXP} / ${nextXP ?? 'MAX'}`;
        const xpTextX = progressX + progressBarWidth / 2 - (xpText.length * 4);
        const xpTextY = progressY + progressBarHeight / 2 - 8;

        // Print with shadow for better readability
        await printTextWithShadow(image, xpFont, xpText, xpTextX, xpTextY);

        // Add indicator dots
        for (let i = 0.2; i <= 0.8; i += 0.2) {
            const dotX = Math.round(progressX + (progressBarWidth * i));
            const dotY = Math.round(progressY + progressBarHeight / 2);
            const isActive = progress >= i;

            // Draw dot
            const dotColor = isActive ? 0xA0D0FFFF : 0x505050FF;
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    if (dx * dx + dy * dy <= 1) {
                        image.setPixelColor(dotColor, dotX + dx, dotY + dy);
                    }
                }
            }

            // Add glow for active indicators
            if (isActive) {
                for (let dx = -3; dx <= 3; dx++) {
                    for (let dy = -3; dy <= 3; dy++) {
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist > 1 && dist <= 3.5) {
                            const intensity = 1 - (dist - 1) / 2.5;
                            const alpha = Math.floor(intensity * 102); // 0.4 * 255
                            const glowColor = (160 << 24) | (208 << 16) | (255 << 8) | alpha;

                            const x = dotX + dx;
                            const y = dotY + dy;
                            if (x >= progressX && x < progressX + progressBarWidth &&
                                y >= progressY && y < progressY + progressBarHeight) {
                                image.setPixelColor(glowColor, x, y);
                            }
                        }
                    }
                }
            }
        }

        // Combat statistics section
        const statsStartY = progressY + progressBarHeight + 50;
        const statItemWidth = (cardWidth - 120) / 4;
        const statItemHeight = 45;

        // Header text
        const headerFont = await loadFont(16, true);
        const headerText = 'COMBAT STATISTICS';
        const headerX = cardX + cardWidth / 2 - (headerText.length * 5);
        const headerY = statsStartY - 25;

        // Print header
        image.print(headerFont, headerX, headerY, { text: headerText }, 0, 0, {
            r: 160, g: 208, b: 255, a: 255
        });

        // Divider line
        for (let x = cardX + 100; x < cardX + cardWidth - 100; x++) {
            // Gradient divider
            const position = (x - (cardX + 100)) / (cardWidth - 200);
            let alpha;

            if (position < 0.5) {
                alpha = Math.floor((position / 0.5) * 178); // 0.7 * 255
            } else {
                alpha = Math.floor(((1 - position) / 0.5) * 178);
            }

            const dividerColor = (100 << 24) | (150 << 16) | (230 << 8) | alpha;
            image.setPixelColor(dividerColor, x, statsStartY);
        }

        // Stats items
        const statsItems = [
            { label: 'RAIDS', value: attendance.raids },
            { label: 'DEFENSES', value: attendance.defenses },
            { label: 'SCRIMS', value: attendance.scrims },
            { label: 'TRAININGS', value: attendance.trainings }
        ];

        // Center the stats
        const statsStartX = cardX + (cardWidth - statsItems.length * statItemWidth) / 2;

        // Load fonts for stats
        const statLabelFont = await loadFont(13);
        const statValueFont = await loadFont(19, true);

        for (let i = 0; i < statsItems.length; i++) {
            const item = statsItems[i];
            const statX = Math.round(statsStartX + i * statItemWidth);
            const statY = Math.round(statsStartY + 10);
            const statWidth = Math.round(statItemWidth - 10);

            // Background
            const statBg = new Jimp(statWidth, statItemHeight, 0x1A1A24FF);
            image.composite(statBg, statX, statY);

            // Border
            for (let x = statX; x < statX + statWidth; x++) {
                image.setPixelColor(0x606070FF, x, statY);
                image.setPixelColor(0x606070FF, x, statY + statItemHeight - 1);
            }

            for (let y = statY; y < statY + statItemHeight; y++) {
                image.setPixelColor(0x606070FF, statX, y);
                image.setPixelColor(0x606070FF, statX + statWidth - 1, y);
            }

            // Top accent line
            for (let x = statX; x < statX + statWidth; x++) {
                image.setPixelColor(0x4080C0FF, x, statY);
                image.setPixelColor(0x4080C0FF, x, statY + 1);
            }

            // Center position for text
            const centerX = statX + statWidth / 2;

            // Print label
            const labelX = centerX - (item.label.length * 3);
            image.print(statLabelFont, labelX, statY + 4, { text: item.label }, 0, 0, {
                r: 144, g: 160, b: 192, a: 255
            });

            // Print value
            const valueText = item.value.toString();
            const valueX = centerX - (valueText.length * 5);
            image.print(statValueFont, valueX, statY + 20, { text: valueText }, 0, 0, {
                r: 255, g: 255, b: 255, a: 255
            });
        }

        // Try to add front logo
        try {
            const frontLogo = await Jimp.read(frontLogoUrl);
            const logoWidth = 220;
            const logoHeight = 220 * (frontLogo.bitmap.height / frontLogo.bitmap.width);
            frontLogo.resize(logoWidth, logoHeight);

            const logoX = cardX + cardWidth - logoWidth - 20;
            const logoY = cardY + 10;

            // Add with opacity
            frontLogo.opacity(0.3);
            image.composite(frontLogo, logoX, logoY);
        } catch (error) {
            Logger.error(`Failed to load front logo image: ${frontLogoUrl}`, 'XPCard', error);

            // Create a fallback logo
            const logoWidth = 220;
            const logoHeight = 220;
            const logoX = cardX + cardWidth - logoWidth - 20;
            const logoY = cardY + 10;

            // Draw a circular glow as fallback
            for (let x = logoX; x < logoX + logoWidth; x++) {
                for (let y = logoY; y < logoY + logoHeight; y++) {
                    const centerX = logoX + logoWidth / 2;
                    const centerY = logoY + logoHeight / 2;
                    const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));

                    if (distance <= logoWidth / 3) {
                        const intensity = 1 - distance / (logoWidth / 3);
                        const alpha = Math.floor(intensity * 25); // 0.1 * 255
                        const glowColor = (60 << 24) | (100 << 16) | (180 << 8) | alpha;

                        image.setPixelColor(glowColor, x, y);
                    }
                }
            }

            // Add circular detail
            for (let angle = 0; angle < Math.PI * 2; angle += 0.01) {
                const x = Math.round(logoX + logoWidth / 2 + Math.cos(angle) * (logoWidth / 4));
                const y = Math.round(logoY + logoHeight / 2 + Math.sin(angle) * (logoWidth / 4));

                if (x >= 0 && x < width && y >= 0 && y < height) {
                    image.setPixelColor(0x6496E64D, x, y); // 0.3 alpha
                }
            }

            for (let angle = 0; angle < Math.PI * 2; angle += 0.01) {
                const x = Math.round(logoX + logoWidth / 2 + Math.cos(angle) * (logoWidth / 3));
                const y = Math.round(logoY + logoHeight / 2 + Math.sin(angle) * (logoWidth / 3));

                if (x >= 0 && x < width && y >= 0 && y < height) {
                    image.setPixelColor(0x6496E64D, x, y); // 0.3 alpha
                }
            }
        }

        // Convert to buffer and return
        return await image.getBufferAsync(Jimp.MIME_PNG);
    } catch (error) {
        Logger.error('Error generating XP card image', 'XPCard', error);
        throw error;
    }
};

// The rest of the code remains unchanged
function getNextXpRequirement(member: GroupMember, userXp: number) {
    const xpRoles = config.xpSystem.roles
        .slice()
        .sort((a, b) => a.xp - b.xp);

    // Special handling for rank 2 (first rank)
    if (member.role.rank === 2) {
        return xpRoles[0].xp;
    }

    const currentIndex = xpRoles.findIndex(r => r.rank === member.role.rank);
    console.log('Current index:', currentIndex);

    if (currentIndex === -1) {
        console.log('Rank not found');
        return null;
    }

    if (currentIndex === xpRoles.length - 1) {
        console.log('At max rank');
        return null;
    }

    const nextXp = xpRoles[currentIndex + 1].xp;
    console.log('Next XP requirement:', nextXp);
    return nextXp;
}

class XPCommand extends Command {
    constructor() {
        super({
            trigger: 'getxp',
            description: 'Displays XP and attendance information',
            type: 'ChatInput',
            module: 'xp',
            args: [
                {
                    trigger: 'roblox-user',
                    description: 'Who do you want to check XP for?',
                    required: false,
                    type: 'String',
                }
            ]
        });
    }

    async run(ctx: CommandContext) {
        let robloxUser: User | PartialUser;

        try {
            if (ctx.args['roblox-user']) {
                // Try to parse as number first for Roblox ID
                const robloxIdArg = Number(ctx.args['roblox-user']);
                if (!isNaN(robloxIdArg)) {
                    robloxUser = await robloxClient.getUser(robloxIdArg);
                } else {
                    // Fallback to username search
                    const robloxUsers = await robloxClient.getUsersByUsernames([ctx.args['roblox-user'] as string]);
                    if (robloxUsers.length > 0) {
                        robloxUser = robloxUsers[0];
                    }
                }
                if (!robloxUser) throw new Error('User not found by ID or username.');
            } else {
                robloxUser = await getLinkedRobloxUser(ctx.user.id);
            }
            if (!robloxUser) throw new Error('No Roblox user could be determined.');
        } catch (userError) {
            // If initial attempts fail, try to resolve as Discord mention if it's a string
            if (typeof ctx.args['roblox-user'] === 'string') {
                try {
                    const idQuery = (ctx.args['roblox-user'] as string).replace(/[^0-9]/gm, '');
                    if (idQuery) {
                        const discordUser = await discordClient.users.fetch(idQuery).catch(() => null);
                        if (discordUser) {
                            const linkedUser = await getLinkedRobloxUser(discordUser.id);
                            if (linkedUser) robloxUser = linkedUser;
                        }
                    }
                } catch (discordError) {
                    // Silently fail if Discord user resolution fails, rely on previous error
                }
            }
            if (!robloxUser) {
                return ctx.reply({
                    content: 'The specified Roblox user could not be found or is not linked.',
                    ephemeral: true,
                });
            }
        }

        const userData = await provider.findUser(robloxUser.id.toString());
        // Add debug logging
        console.log(`[XP CARD DEBUG] User: ${robloxUser.name} (${robloxUser.id}) | Retrieved XP: ${userData?.xp || 0}`);

        if (!userData) {
            // Create a new user record if none exists
            console.log(`Creating new user record for ${robloxUser.name} (${robloxUser.id})`);
            try {
                await provider.updateUser(robloxUser.id.toString(), { xp: 0 });
                return ctx.reply({
                    content: 'User data created. This user has 0 XP. Please try the command again.',
                    ephemeral: true,
                });
            } catch (createErr) {
                console.error('Error creating user record:', createErr);
                return ctx.reply({
                    content: 'Failed to create user record. Please try again later.',
                    ephemeral: true,
                });
            }
        }

        userData.xp = Number(userData.xp || 0);

        let robloxMember: GroupMember;
        try {
            robloxMember = await robloxGroup.getMember(robloxUser.id);
            if (!robloxMember) throw new Error('User is not a group member.');
        } catch {
            return ctx.reply({
                content: 'The user is not a member of the group, or an error occurred fetching group membership.',
                ephemeral: true,
            });
        }

        const nextXp = getNextXpRequirement(robloxMember, userData.xp);

        const avatarUrl = await robloxClient.apis.thumbnailsAPI
            .getUsersAvatarHeadShotImages({
                userIds: [robloxUser.id],
                size: '150x150',
                format: 'png',
            })
            .then((res) => res.data[0]?.imageUrl || 'https://www.roblox.com/images/default-headshot.png')
            .catch(() => 'https://www.roblox.com/images/default-headshot.png');

        let compositeImage: Buffer | null = null;
        try {
            compositeImage = await generateCompositeImage(
                '',
                robloxUser.name,
                robloxMember.role.name,
                userData.xp,
                nextXp,
                avatarUrl,
                {
                    raids: userData.raids ?? 0,
                    defenses: userData.defenses ?? 0,
                    scrims: userData.scrims ?? 0,
                    trainings: userData.trainings ?? 0
                }
            );
        } catch (err) {
            console.error('Failed to generate composite image:', err);
        }

        if (!compositeImage) {
            return ctx.reply({
                content: 'There was an error generating the XP image. Please try again later.',
                ephemeral: true,
            });
        }

        const imageAttachment = new AttachmentBuilder(compositeImage, { name: 'xp-progress.png' });
        const components: ActionRowBuilder<ButtonBuilder>[] = [];

        // Check for promotion eligibility
        let isEligibleForPromotion = false;
        try {
            const groupRoles = await robloxGroup.getRoles();
            const highestEligibleRole = await findHighestEligibleRole(robloxMember, groupRoles, userData.xp);
            if (highestEligibleRole && highestEligibleRole.rank > robloxMember.role.rank) {
                isEligibleForPromotion = true;
            }
        } catch (eligibilityError) {
            console.error(`Error checking promotion eligibility for ${robloxUser.name}:`, eligibilityError);
        }

        const requestPromotionButton = new ButtonBuilder()
            .setCustomId(`request_promotion:${robloxUser.id}:${ctx.user.id}`) // Include Discord user ID for verification
            .setLabel('Request Promotion Check')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(!isEligibleForPromotion);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(requestPromotionButton);
        components.push(row);

        return ctx.reply({
            files: [imageAttachment],
            components: components
        });
    }
}

export default XPCommand;