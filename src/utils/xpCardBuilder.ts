import Jimp from 'jimp';
import { Logger } from './logger';
import {
    createCanvas, loadImage, drawRoundedRect, drawRoundedRectWithBorder, drawSharpRect,
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
    public async build(data: {
        backgroundUrl?: string;
        avatarUrl: string;
        username: string;
        rank: string;
        currentXP: number;
        nextXP?: number;
        stats: XPStats;
        logoUrl?: string;
    }): Promise<Buffer> {
        return await this.generate(data);
    }
    private image: Jimp;
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

    public async generate(data: {
        backgroundUrl?: string;
        avatarUrl: string;
        username: string;
        rank: string;
        currentXP: number;
        nextXP?: number;
        stats: XPStats;
        logoUrl?: string;
    }): Promise<Buffer> {
        // Initialize and create base
        await this.initialize(data.backgroundUrl);

        // Add all components in sequence
        await this.addCardBackground();
        await this.addAvatar(data.avatarUrl);
        await this.addUserInfo(data.username, data.rank);
        await this.addProgressBar(data.currentXP, data.nextXP || null);
        await this.addStatistics(data.stats);

        if (data.logoUrl) {
            await this.addLogo(data.logoUrl);
        }

        // Return final buffer
        return this.getBuffer();
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
        this.image.background(hexToJimpColor(this.options.backgroundColor));
    }

    async addCardBackground(): Promise<this> {
        const margin = 40;
        const cardWidth = this.width - (margin * 2);
        const cardHeight = this.height - (margin * 2);

        // Create card with border
        await drawRoundedRectWithBorder(
            this.image,
            margin, margin,
            cardWidth, cardHeight,
            12,
            hexToJimpColor(this.options.cardColor),
            hexToJimpColor(this.options.borderColor)
        );

        // Add subtle grid (very low opacity)
        this.addSubtleGrid();

        // Add worn edge effect
        await createWornEdge(this.image, margin, margin, cardWidth, cardHeight);

        return this;
    }

    private addSubtleGrid(): void {
        // Ultra subtle grid pattern (barely visible)
        const gridColor = 0x90A0FF05; // Very low opacity

        // Draw horizontal grid lines
        for (let y = 0; y < this.height; y += 60) {
            for (let x = 0; x < this.width; x++) {
                this.image.setPixelColor(gridColor, x, y);
            }
        }

        // Draw vertical grid lines
        for (let x = 0; x < this.width; x += 60) {
            for (let y = 0; y < this.height; y++) {
                this.image.setPixelColor(gridColor, x, y);
            }
        }
    }

    async addAvatar(avatarUrl: string): Promise<this> {
        const size = 100;
        const x = 80;
        const y = 70;

        try {
            // Load and mask avatar
            const avatar = await loadImage(avatarUrl);
            avatar.resize(size, size);

            // Create circular mask
            const mask = new Jimp(size, size, 0x00000000);
            mask.scan(0, 0, size, size, (px, py) => {
                const dx = px - size / 2;
                const dy = py - size / 2;
                if (dx * dx + dy * dy <= (size / 2) ** 2) {
                    mask.setPixelColor(0xffffffff, px, py);
                }
            });

            avatar.mask(mask, 0, 0);

            // Add glow
            this.addAvatarGlow(x, y, size);

            // Draw avatar
            this.image.composite(avatar, x, y);
        } catch (error) {
            Logger.error(`Failed to load avatar: ${avatarUrl}`, 'XPCardBuilder', error);
            this.createFallbackAvatar(x, y, size);
        }

        return this;
    }

    private async addAvatarGlow(x: number, y: number, size: number): Promise<void> {
        // Create temporary image with just the glow
        const glowImg = new Jimp(size + 20, size + 20, 0x00000000);

        // Draw soft blue glow
        const centerX = size / 2 + 10;
        const centerY = size / 2 + 10;
        const radius = size / 2;

        glowImg.scan(0, 0, size + 20, size + 20, (px, py) => {
            const dx = px - centerX;
            const dy = py - centerY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > radius && distance <= radius + 10) {
                const intensity = 1 - ((distance - radius) / 10);
                const alpha = Math.floor(intensity * 180);
                glowImg.setPixelColor(Jimp.rgbaToInt(100, 150, 230, alpha), px, py);
            }
        });

        // Apply blur to glow
        glowImg.blur(2);

        // Composite glow onto main image
        this.image.composite(glowImg, x - 10, y - 10);
    }

    private async createFallbackAvatar(x: number, y: number, size: number): Promise<void> {
        const fallbackAvatar = new Jimp(size, size, 0x2A2A33FF);

        // Create circular mask
        const mask = new Jimp(size, size, 0x00000000);
        mask.scan(0, 0, size, size, (px, py) => {
            const dx = px - size / 2;
            const dy = py - size / 2;
            if (dx * dx + dy * dy <= (size / 2) ** 2) {
                mask.setPixelColor(0xffffffff, px, py);
            }
        });

        fallbackAvatar.mask(mask, 0, 0);
        this.image.composite(fallbackAvatar, x, y);
    }

    async addUserInfo(username: string, rank: string): Promise<this> {
        const m = 40;
        const fontName = await loadFont(38, true);
        const fontRank = await loadFont(20);
        const x = m + 200;
        const yName = m + 40; // Positioning higher

        // Draw username with shadow
        await printTextWithShadow(this.image, fontName, username, x, yName);

        // Draw rank badge below username
        const padX = 15;
        const padY = 8;
        const textW = rank.length * 12;
        const badgeW = textW + padX * 2;
        const badgeH = 30;
        const yBadge = yName + 45; // Good distance below name

        // Use the rounded rect with border function
        await drawRoundedRectWithBorder(
            this.image,
            x, yBadge,
            badgeW, badgeH,
            6,
            hexToJimpColor(this.options.cardColor),
            hexToJimpColor(this.options.textSecondaryColor)
        );

        this.image.print(fontRank, x + padX, yBadge + padY / 2, rank);

        // Add rank decorations if needed - simplified hardcoding
        if (rank.includes("Commander")) {
            await drawStar(this.image, x + badgeW + 15, yBadge + badgeH / 2, 10, 5, 0xD0D0E0FF);
            await drawStar(this.image, x + badgeW + 35, yBadge + badgeH / 2, 10, 5, 0xD0D0E0FF);
            await drawStar(this.image, x + badgeW + 55, yBadge + badgeH / 2, 10, 5, 0xD0D0E0FF);
        } else if (rank.includes("Captain")) {
            await drawStar(this.image, x + badgeW + 15, yBadge + badgeH / 2, 10, 5, 0xD0D0E0FF);
            await drawStar(this.image, x + badgeW + 35, yBadge + badgeH / 2, 10, 5, 0xD0D0E0FF);
        } else if (rank.includes("Lieutenant")) {
            await drawStar(this.image, x + badgeW + 15, yBadge + badgeH / 2, 10, 5, 0xD0D0E0FF);
        }

        return this;
    }

    async addProgressBar(currentXP: number, nextXP: number | null): Promise<this> {
        const m = 40;
        const w = this.width - m * 2 - 160;
        const h = 20;
        const x = m + 80;
        const y = m + 200;

        // Progress bar background
        const bg = new Jimp(w, h, hexToJimpColor(this.options.progressBarBgColor));
        this.image.composite(bg, x, y);

        // Draw filled portion
        const progress = nextXP ? Math.min(currentXP / nextXP, 1) : 1;
        const fillWidth = Math.floor(w * progress);

        if (fillWidth > 0) {
            // Create gradient fill
            const fill = new Jimp(fillWidth, h, 0x00000000);
            fill.scan(0, 0, fillWidth, h, (px, py) => {
                const factor = px / fillWidth;
                const r = Math.floor(16 + factor * 60);
                const g = Math.floor(96 + factor * 80);
                const b = Math.floor(192 + factor * 63);
                fill.setPixelColor(Jimp.rgbaToInt(r, g, b, 255), px, py);
            });

            this.image.composite(fill, x, y);
        }

        // Add XP text
        const fontXP = await loadFont(16, true);
        const txt = `XP: ${currentXP}${nextXP ? ` / ${nextXP}` : ' MAX'}`;
        const txtW = txt.length * 7;
        await printTextWithShadow(
            this.image,
            fontXP,
            txt,
            x + w / 2 - txtW / 2,
            y + h / 2 - 8
        );

        return this;
    }

    async addStatistics(stats: XPStats): Promise<this> {
        const items = [
            { label: 'RAIDS', val: stats.raids },
            { label: 'DEFENSES', val: stats.defenses },
            { label: 'SCRIMS', val: stats.scrims },
            { label: 'TRAININGS', val: stats.trainings }
        ];

        // Better box sizing
        const m = 40;
        const spacing = 20;
        const boxW = 180; // Fixed width for better appearance
        const boxH = 80;
        const totalW = (boxW * items.length) + (spacing * (items.length - 1));
        const startX = (this.width - totalW) / 2;

        const y = this.height - m - boxH - 20;
        const fontLabel = await loadFont(16);
        const fontVal = await loadFont(24, true);

        // Header text
        const headerFont = await loadFont(18, true);
        const headerText = 'COMBAT STATISTICS';
        const headerX = this.width / 2 - (headerText.length * 5);
        const headerY = y - 30;
        this.image.print(headerFont, headerX, headerY, headerText);

        // Draw boxes for each stat
        items.forEach((it, i) => {
            const x = startX + i * (boxW + spacing);

            // Draw box with border
            drawRoundedRectWithBorder(
                this.image,
                x, y,
                boxW, boxH,
                8,
                hexToJimpColor(this.options.cardColor),
                hexToJimpColor(this.options.borderColor)
            );

            // Add accent line at top
            const accentColor = 0x4080C0FF;
            for (let px = x + 1; px < x + boxW - 1; px++) {
                this.image.setPixelColor(accentColor, px, y);
                this.image.setPixelColor(accentColor, px, y + 1);
                this.image.setPixelColor(accentColor, px, y + 2); // Thicker line
            }

            // Print label - centered
            const labelX = x + boxW / 2 - (it.label.length * 4);
            this.image.print(fontLabel, labelX, y + 10, it.label);

            // Print value - centered
            const valStr = it.val.toString();
            const valX = x + boxW / 2 - (valStr.length * 6);
            this.image.print(fontVal, valX, y + 40, valStr);
        });

        return this;
    }

    async addLogo(logoUrl?: string): Promise<this> {
        if (!logoUrl) return this;

        const m = 40;
        const size = 120;
        const x = this.width - m - size;
        const y = m;

        try {
            const logo = await loadImage(logoUrl);
            logo.resize(size, size);
            logo.opacity(0.25);
            this.image.composite(logo, x, y);
        } catch (error) {
            Logger.error(`Failed to load logo: ${logoUrl}`, 'XPCardBuilder', error);
        }

        return this;
    }

    async getBuffer(): Promise<Buffer> {
        try {
            return await this.image.getBufferAsync(Jimp.MIME_PNG);
        } catch (error) {
            Logger.error('Failed to build XP card image', 'XPCardBuilder', error);
            throw error;
        }
    }
}