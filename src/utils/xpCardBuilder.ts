import Jimp from 'jimp';
import { Logger } from './logger';
import {
    createCanvas, loadImage, drawRoundedRect, drawSharpRect,
    drawStar, createWornEdge, printTextWithShadow, hexToJimpColor
} from './imageUtils';
import { loadFont } from './fontUtils';

export interface XPCardOptions {
    width?: number;
    height?: number;
    backgroundColor?: string;
    overlayColor?: string;
    cardColor?: string;
    borderColor?: string;
    textPrimaryColor?: string;
    textSecondaryColor?: string;
    progressBarColor?: string;
    progressBarBgColor?: string;
}

export interface XPStats {
    raids: number;
    defenses: number;
    scrims: number;
    trainings: number;
}

export class XPCardBuilder {
    private image: any;
    private readonly width: number;
    private readonly height: number;
    private readonly options: Required<XPCardOptions>;

    constructor(options: XPCardOptions = {}) {
        this.width = options.width || 1000;
        this.height = options.height || 400;

        this.options = {
            width: this.width,
            height: this.height,
            backgroundColor: options.backgroundColor || '#121520',
            overlayColor: options.overlayColor || '#0A0C1266',
            cardColor: options.cardColor || '#16161CE6',
            borderColor: options.borderColor || '#8A8A9AFF',
            textPrimaryColor: options.textPrimaryColor || '#FFFFFF',
            textSecondaryColor: options.textSecondaryColor || '#A0D0FF',
            progressBarColor: options.progressBarColor || '#3366EE',
            progressBarBgColor: options.progressBarBgColor || '#16161CF2',
        };
    }

    async initialize(backgroundUrl?: string): Promise<this> {
        try {
            // Create base canvas
            this.image = await createCanvas(this.width, this.height, 0x00000000);

            // Try to load background image
            if (backgroundUrl) {
                try {
                    const background = await loadImage(backgroundUrl);
                    background.resize(this.width, this.height);
                    this.image.composite(background, 0, 0);

                    // Add overlay for better readability
                    const overlay = await createCanvas(
                        this.width,
                        this.height,
                        hexToJimpColor(this.options.overlayColor)
                    );
                    this.image.composite(overlay, 0, 0);
                } catch (error) {
                    Logger.error(`Failed to load background: ${backgroundUrl}`, 'XPCardBuilder', error);
                    this.createGradientBackground();
                }
            } else {
                this.createGradientBackground();
            }

            return this;
        } catch (error) {
            Logger.error('Failed to initialize XP card', 'XPCardBuilder', error);
            throw error;
        }
    }

    private createGradientBackground(): void {
        // Create a gradient background
        this.image.scan(0, 0, this.width, this.height, (x: number, y: number) => {
            const factor = y / this.height;
            const r = Math.floor(22 + factor * 10);
            const g = Math.floor(25 + factor * 10);
            const b = Math.floor(33 + factor * 10);
            const color = (r << 24) + (g << 16) + (b << 8) + 255;
            this.image.setPixelColor(color, x, y);
        });
    }

    async addCardBackground(): Promise<this> {
        const margin = 40;
        const cardWidth = this.width - (margin * 2);
        const cardHeight = this.height - (margin * 2);

        // Create card with semi-transparent background
        await drawSharpRect(
            this.image,
            margin, margin,
            cardWidth, cardHeight,
            8,
            hexToJimpColor(this.options.cardColor)
        );

        // Add border
        const borderColor = hexToJimpColor(this.options.borderColor);

        // Top and bottom borders
        this.image.scan(margin, margin, cardWidth, 2, (x: number, y: number) => {
            this.image.setPixelColor(borderColor, x, y);
        });
        this.image.scan(margin, margin + cardHeight - 2, cardWidth, 2, (x: number, y: number) => {
            this.image.setPixelColor(borderColor, x, y);
        });

        // Left and right borders
        this.image.scan(margin, margin, 2, cardHeight, (x: number, y: number) => {
            this.image.setPixelColor(borderColor, x, y);
        });
        this.image.scan(margin + cardWidth - 2, margin, 2, cardHeight, (x: number, y: number) => {
            this.image.setPixelColor(borderColor, x, y);
        });

        // Add tech pattern overlay (grid lines)
        this.addTechPatternOverlay();

        // Add worn edge effect
        await createWornEdge(this.image, margin, margin, cardWidth, cardHeight);

        return this;
    }

    private addTechPatternOverlay(): void {
        // Add vertical lines
        for (let i = 0; i < this.width; i += 60) {
            const lineColor = i % 180 === 0 ? 0x90A0FF12 : 0xAAAAAA12;

            for (let y = 0; y < this.height; y++) {
                this.image.setPixelColor(lineColor, i, y);
            }
        }

        // Add horizontal lines
        for (let i = 0; i < this.height; i += 60) {
            const lineColor = i % 180 === 0 ? 0x90A0FF12 : 0xAAAAAA12;

            for (let x = 0; x < this.width; x++) {
                this.image.setPixelColor(lineColor, x, i);
            }

            // Add data points at intersections
            if (i % 180 === 0) {
                for (let j = 0; j < this.width; j += 180) {
                    // Draw small blue dots at intersections
                    for (let dx = -1; dx <= 1; dx++) {
                        for (let dy = -1; dy <= 1; dy++) {
                            if (j + dx >= 0 && j + dx < this.width && i + dy >= 0 && i + dy < this.height) {
                                this.image.setPixelColor(0x78B4FFB3, j + dx, i + dy);
                            }
                        }
                    }
                }
            }
        }
    }

    async addAvatar(avatarUrl: string, size: number = 100): Promise<this> {
        const margin = 40;
        const avatarX = margin + 60;
        const avatarY = margin + 30;

        try {
            // Load avatar image
            const avatar = await loadImage(avatarUrl);
            avatar.resize(size, size);

            // Create circular mask
            const mask = await createCanvas(size, size, 0x00000000);
            mask.scan(0, 0, size, size, (x: number, y: number) => {
                const centerX = size / 2;
                const centerY = size / 2;
                const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));

                if (distance <= size / 2) {
                    mask.setPixelColor(0xFFFFFFFF, x, y);
                }
            });

            // Apply mask to avatar
            avatar.mask(mask, 0, 0);

            // Add glow effect
            this.addAvatarGlow(avatarX, avatarY, size);

            // Add metallic ring
            this.addMetallicRing(avatarX, avatarY, size);

            // Add decorative bolts
            this.addDecorativeBolts(avatarX, avatarY, size);

            // Draw avatar
            this.image.composite(avatar, avatarX, avatarY);

        } catch (error) {
            Logger.error(`Failed to load avatar: ${avatarUrl}`, 'XPCardBuilder', error);
            // Create fallback avatar
            this.createFallbackAvatar(avatarX, avatarY, size);
        }

        return this;
    }

    private async addAvatarGlow(avatarX: number, avatarY: number, size: number): Promise<void> {
        const glowSize = 15;

        for (let x = avatarX - glowSize; x < avatarX + size + glowSize; x++) {
            for (let y = avatarY - glowSize; y < avatarY + size + glowSize; y++) {
                if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
                    const centerX = avatarX + size / 2;
                    const centerY = avatarY + size / 2;
                    const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));

                    if (distance > size / 2 && distance <= size / 2 + glowSize) {
                        // Calculate intensity based on distance
                        const intensity = 1 - ((distance - size / 2) / glowSize);
                        const alpha = Math.floor(intensity * 180);

                        // Blue glow color
                        const glowColor = (100 << 24) | (150 << 16) | (230 << 8) | alpha;

                        // Only set if more intense than existing
                        const currentColor = this.image.getPixelColor(x, y);
                        const currentAlpha = currentColor & 0xFF;

                        if (alpha > currentAlpha) {
                            this.image.setPixelColor(glowColor, x, y);
                        }
                    }
                }
            }
        }
    }

    private addMetallicRing(avatarX: number, avatarY: number, size: number): void {
        for (let angle = 0; angle < Math.PI * 2; angle += 0.01) {
            const ringRadius = size / 2 + 3;
            const x = Math.round(avatarX + size / 2 + Math.cos(angle) * ringRadius);
            const y = Math.round(avatarY + size / 2 + Math.sin(angle) * ringRadius);

            // Fix: Ensure brightness values stay in valid range
            const brightness = Math.max(0, Math.min(255, 176 + Math.floor(80 * Math.sin(angle))));

            // Fix: Use proper bit operations to create a valid color value
            const r = brightness;
            const g = brightness;
            const b = brightness;
            const a = 255;
            const ringColor = Jimp.rgbaToInt(r, g, b, a);

            if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
                this.image.setPixelColor(ringColor, x, y);
            }
        }
    }

    private addDecorativeBolts(avatarX: number, avatarY: number, size: number): void {
        for (let i = 0; i < 4; i++) {
            const angle = i * Math.PI / 2;
            const boltX = Math.round(avatarX + size / 2 + Math.cos(angle) * (size / 2 + 6));
            const boltY = Math.round(avatarY + size / 2 + Math.sin(angle) * (size / 2 + 6));

            // Draw bolt
            for (let dx = -2; dx <= 2; dx++) {
                for (let dy = -2; dy <= 2; dy++) {
                    if (boltX + dx >= 0 && boltX + dx < this.width && boltY + dy >= 0 && boltY + dy < this.height) {
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        if (distance <= 2.5) {
                            // Metallic gradient
                            const brightness = Math.min(255, Math.max(0, 160 + Math.floor(40 * (1 - distance / 2.5))));
                            const boltColor = Jimp.rgbaToInt(brightness, brightness, brightness, 255);
                            this.image.setPixelColor(boltColor, boltX + dx, boltY + dy);
                        }
                    }
                }
            }

            // Bolt highlight
            if (boltX - 1 >= 0 && boltX - 1 < this.width && boltY - 1 >= 0 && boltY - 1 < this.height) {
                // FIX: Use Jimp.rgbaToInt for highlight color too
                const highlightColor = Jimp.rgbaToInt(255, 255, 255, 204); // 0xFFFFFFCC
                this.image.setPixelColor(highlightColor, boltX - 1, boltY - 1);
            }
        }
    }

    private async createFallbackAvatar(x: number, y: number, size: number): Promise<void> {
        // Create a basic avatar with a question mark
        const fallbackAvatar = await createCanvas(size, size, 0x2A2A33FF);

        // Add a question mark
        const fallbackFont = await loadFont(32);
        fallbackAvatar.print(fallbackFont, size / 2 - 10, size / 2 - 16, { text: '?' });

        // Create circular mask
        const mask = await createCanvas(size, size, 0x00000000);
        mask.scan(0, 0, size, size, (px: number, py: number) => {
            const centerX = size / 2;
            const centerY = size / 2;
            const distance = Math.sqrt(Math.pow(px - centerX, 2) + Math.pow(py - centerY, 2));

            if (distance <= size / 2) {
                mask.setPixelColor(0xFFFFFFFF, px, py);
            }
        });

        // Apply mask
        fallbackAvatar.mask(mask, 0, 0);

        // Draw to main image
        this.image.composite(fallbackAvatar, x, y);
    }

    async addUserInfo(username: string, rank: string): Promise<this> {
        const margin = 40;
        const avatarSize = 100;
        const nameX = margin + 60 + avatarSize + 30;
        const nameY = margin + 35;

        // Determine rank level for decorative elements
        const rankLevel = rank.toLowerCase().includes('commander') ? 5 :
            rank.toLowerCase().includes('officer') ? 4 :
                rank.toLowerCase().includes('captain') ? 3 :
                    rank.toLowerCase().includes('sergeant') ? 2 : 1;

        // Load fonts
        const usernameFont = await loadFont(38, true);
        const rankFont = await loadFont(26);

        // Fix: Use printText function instead of direct print
        await printTextWithShadow(this.image, usernameFont, username, nameX, nameY - 30);

        // Add rank stars for higher ranks
        if (rankLevel > 2) {
            const textWidth = username.length * 20; // Approximate width

            for (let i = 0; i < rankLevel - 2; i++) {
                const emblemX = nameX + textWidth + 20 + (i * 25);
                await drawStar(this.image, emblemX, nameY - 15, 10, 5, 0xD0D0E0FF);
            }
        }

        // Draw rank badge
        const rankText = rank;
        const rankWidth = rankText.length * 12 + 20;
        const rankX = nameX;
        const rankY = nameY + 20;

        // Badge background
        await drawRoundedRect(this.image, rankX, rankY, rankWidth, 36, 5, 0x1E1E26E6);

        // Badge border
        const borderColor = 0x8A8A9AFF;
        for (let x = rankX; x < rankX + rankWidth; x++) {
            this.image.setPixelColor(borderColor, x, rankY);
            this.image.setPixelColor(borderColor, x, rankY + 35);
        }

        for (let y = rankY; y < rankY + 36; y++) {
            this.image.setPixelColor(borderColor, rankX, y);
            this.image.setPixelColor(borderColor, rankX + rankWidth - 1, y);
        }

        // Fix: Use correct print method with proper parameters
        this.image.print(
            rankFont,
            rankX + 10,
            rankY + 5,
            {
                text: rankText,
                alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT,
                alignmentY: Jimp.VERTICAL_ALIGN_TOP
            }
        );

        return this;
    }

    async addProgressBar(currentXP: number, nextXP: number | null): Promise<this> {
        const margin = 40;
        const avatarSize = 100;
        const cardWidth = this.width - (margin * 2);

        const progressBarWidth = cardWidth - 120;
        const progressBarHeight = 26;
        const progressX = margin + 60;
        const progressY = margin + 30 + avatarSize + 25;

        const progress = nextXP ? Math.min(currentXP / nextXP, 1) : 1;
        const filledWidth = Math.round(progress * progressBarWidth);

        // Progress bar background
        const barBg = await createCanvas(progressBarWidth, progressBarHeight, 0x16161CF2);
        this.image.composite(barBg, progressX, progressY);

        // Progress bar border
        const borderColor = 0x505060FF;
        for (let x = progressX; x < progressX + progressBarWidth; x++) {
            this.image.setPixelColor(borderColor, x, progressY);
            this.image.setPixelColor(borderColor, x, progressY + progressBarHeight - 1);
        }

        for (let y = progressY; y < progressY + progressBarHeight; y++) {
            this.image.setPixelColor(borderColor, progressX, y);
            this.image.setPixelColor(borderColor, progressX + progressBarWidth - 1, y);
        }

        // Add tech pattern to empty bar
        for (let i = 0; i < progressBarWidth; i += 8) {
            for (let y = progressY; y < progressY + progressBarHeight; y++) {
                this.image.setPixelColor(0x60607019, progressX + i, y);
            }
        }

        // Fill progress bar
        if (filledWidth > 0) {
            // Create gradient for progress
            const barFill = await createCanvas(filledWidth, progressBarHeight, 0x00000000);
            barFill.scan(0, 0, filledWidth, progressBarHeight, (x: number, y: number) => {
                const factor = x / filledWidth;
                const r = Math.floor(16 + factor * 60);
                const g = Math.floor(96 + factor * 80);
                const b = Math.floor(192 + factor * 63);
                // FIX: Use Jimp.rgbaToInt instead of bit shifting
                const color = Jimp.rgbaToInt(r, g, b, 255);
                barFill.setPixelColor(color, x, y);
            });

            // Add scanline effect
            for (let i = 0; i < progressBarHeight; i += 4) {
                for (let x = 0; x < filledWidth; x++) {
                    const currentColor = barFill.getPixelColor(x, i);
                    // Make slightly brighter
                    const r = Math.min(255, ((currentColor >> 24) & 0xFF) + 20);
                    const g = Math.min(255, ((currentColor >> 16) & 0xFF) + 20);
                    const b = Math.min(255, ((currentColor >> 8) & 0xFF) + 20);
                    // FIX: Use Jimp.rgbaToInt instead of bit shifting
                    const newColor = Jimp.rgbaToInt(r, g, b, 255);
                    barFill.setPixelColor(newColor, x, i);
                }
            }

            this.image.composite(barFill, progressX, progressY);
        }

        // Add XP text
        const xpFont = await loadFont(16, true);
        const xpText = `XP: ${currentXP} / ${nextXP ?? 'MAX'}`;
        const xpTextX = progressX + progressBarWidth / 2 - (xpText.length * 4);
        const xpTextY = progressY + progressBarHeight / 2 - 8;

        await printTextWithShadow(this.image, xpFont, xpText, xpTextX, xpTextY);

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
                        this.image.setPixelColor(dotColor, dotX + dx, dotY + dy);
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
                            const alpha = Math.floor(intensity * 102);
                            // FIX: Use Jimp.rgbaToInt instead of bit shifting
                            const glowColor = Jimp.rgbaToInt(160, 208, 255, alpha);

                            const x = dotX + dx;
                            const y = dotY + dy;
                            if (x >= progressX && x < progressX + progressBarWidth &&
                                y >= progressY && y < progressY + progressBarHeight) {
                                this.image.setPixelColor(glowColor, x, y);
                            }
                        }
                    }
                }
            }

            return this;
        }
    }

    async addStatistics(stats: XPStats): Promise<this> {
        const margin = 40;
        const cardWidth = this.width - (margin * 2);
        const avatarSize = 100;
        const progressBarHeight = 26;

        const progressY = margin + 30 + avatarSize + 25;
        const statsStartY = progressY + progressBarHeight + 50;
        const statItemWidth = (cardWidth - 120) / 4;
        const statItemHeight = 45;

        // Header text
        const headerFont = await loadFont(16, true);
        const headerText = 'COMBAT STATISTICS';
        const headerX = margin + cardWidth / 2 - (headerText.length * 5);
        const headerY = statsStartY - 25;

        // Print header
        this.image.print(headerFont, headerX, headerY, { text: headerText }, 0, 0, {
            r: 160, g: 208, b: 255, a: 255
        });

        // Divider line
        for (let x = margin + 100; x < margin + cardWidth - 100; x++) {
            // Gradient divider
            const position = (x - (margin + 100)) / (cardWidth - 200);
            let alpha;

            if (position < 0.5) {
                alpha = Math.floor((position / 0.5) * 178);
            } else {
                alpha = Math.floor(((1 - position) / 0.5) * 178);
            }

            const dividerColor = Jimp.rgbaToInt(100, 150, 230, alpha);
            this.image.setPixelColor(dividerColor, x, statsStartY);
        }

        // Stats items
        const statsItems = [
            { label: 'RAIDS', value: stats.raids },
            { label: 'DEFENSES', value: stats.defenses },
            { label: 'SCRIMS', value: stats.scrims },
            { label: 'TRAININGS', value: stats.trainings }
        ];

        // Center the stats
        const statsStartX = margin + (cardWidth - statsItems.length * statItemWidth) / 2;

        // Load fonts
        const statLabelFont = await loadFont(13);
        const statValueFont = await loadFont(19, true);

        // Draw each stat box
        for (let i = 0; i < statsItems.length; i++) {
            const item = statsItems[i];
            const statX = Math.round(statsStartX + i * statItemWidth);
            const statY = Math.round(statsStartY + 10);
            const statWidth = Math.round(statItemWidth - 10);

            // Background
            const statBg = await createCanvas(statWidth, statItemHeight, 0x1A1A24FF);
            this.image.composite(statBg, statX, statY);

            // Border
            const borderColor = 0x606070FF;
            for (let x = statX; x < statX + statWidth; x++) {
                this.image.setPixelColor(borderColor, x, statY);
                this.image.setPixelColor(borderColor, x, statY + statItemHeight - 1);
            }

            for (let y = statY; y < statY + statItemHeight; y++) {
                this.image.setPixelColor(borderColor, statX, y);
                this.image.setPixelColor(borderColor, statX + statWidth - 1, y);
            }

            // Top accent line
            const accentColor = 0x4080C0FF;
            for (let x = statX; x < statX + statWidth; x++) {
                this.image.setPixelColor(accentColor, x, statY);
                this.image.setPixelColor(accentColor, x, statY + 1);
            }

            // Center position for text
            const centerX = statX + statWidth / 2;

            // Print label
            const labelX = centerX - (item.label.length * 3);
            this.image.print(statLabelFont, labelX, statY + 4, { text: item.label }, 0, 0, {
                r: 144, g: 160, b: 192, a: 255
            });

            // Print value
            const valueText = item.value.toString();
            const valueX = centerX - (valueText.length * 5);
            this.image.print(statValueFont, valueX, statY + 20, { text: valueText }, 0, 0, {
                r: 255, g: 255, b: 255, a: 255
            });
        }

        return this;
    }

    async addLogo(logoUrl?: string): Promise<this> {
        const margin = 40;
        const cardWidth = this.width - (margin * 2);
        const logoWidth = 220;
        const logoHeight = 220;
        const logoX = margin + cardWidth - logoWidth - 20;
        const logoY = margin + 10;

        try {
            if (logoUrl) {
                // Try to load logo
                const frontLogo = await loadImage(logoUrl);
                const aspectRatio = frontLogo.bitmap.height / frontLogo.bitmap.width;
                const calculatedHeight = logoWidth * aspectRatio;

                frontLogo.resize(logoWidth, calculatedHeight);
                frontLogo.opacity(0.3);
                this.image.composite(frontLogo, logoX, logoY);
            } else {
                this.createFallbackLogo(logoX, logoY, logoWidth, logoHeight);
            }
        } catch (error) {
            Logger.error(`Failed to load logo: ${logoUrl}`, 'XPCardBuilder', error);
            this.createFallbackLogo(logoX, logoY, logoWidth, logoHeight);
        }

        return this;
    }

    private createFallbackLogo(x: number, y: number, width: number, height: number): void {
        // Draw a circular glow as fallback
        for (let px = x; px < x + width; px++) {
            for (let py = y; py < y + height; py++) {
                const centerX = x + width / 2;
                const centerY = y + height / 2;
                const distance = Math.sqrt(Math.pow(px - centerX, 2) + Math.pow(py - centerY, 2));

                if (distance <= width / 3) {
                    const intensity = 1 - distance / (width / 3);
                    const alpha = Math.floor(intensity * 25);
                    const glowColor = (60 << 24) | (100 << 16) | (180 << 8) | alpha;

                    this.image.setPixelColor(glowColor, px, py);
                }
            }
        }

        // Add circular details
        for (let angle = 0; angle < Math.PI * 2; angle += 0.01) {
            const radius1 = width / 4;
            const x1 = Math.round(x + width / 2 + Math.cos(angle) * radius1);
            const y1 = Math.round(y + height / 2 + Math.sin(angle) * radius1);

            if (x1 >= 0 && x1 < this.width && y1 >= 0 && y1 < this.height) {
                this.image.setPixelColor(0x6496E64D, x1, y1);
            }

            const radius2 = width / 3;
            const x2 = Math.round(x + width / 2 + Math.cos(angle) * radius2);
            const y2 = Math.round(y + height / 2 + Math.sin(angle) * radius2);

            if (x2 >= 0 && x2 < this.width && y2 >= 0 && y2 < this.height) {
                this.image.setPixelColor(0x6496E64D, x2, y2);
            }
        }
    }

    async build(): Promise<Buffer> {
        try {
            // Use string constant directly
            return await this.image.getBufferAsync(Jimp.MIME_PNG || 'image/png');
        } catch (error) {
            Logger.error('Failed to build XP card image', 'XPCardBuilder', error);
            throw error;
        }
    }
}
