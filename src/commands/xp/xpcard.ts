import { discordClient, robloxClient, robloxGroup } from '../../main';
import { CommandContext } from '../../structures/addons/CommandAddons';
import Command from '../../structures/Command';
import { PartialUser, User, GroupMember } from 'bloxy/dist/structures';
import { getLinkedRobloxUser } from '../../handlers/accountLinks';
import { config } from '../../config';
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'; // Added ActionRowBuilder, ButtonBuilder, ButtonStyle
import { provider } from '../../database';
import { createCanvas, loadImage, registerFont, Canvas, CanvasRenderingContext2D as NodeCanvasRenderingContext2D } from 'canvas';
import { findHighestEligibleRole } from '../ranking/xprankup'; // Import the eligibility checker


// Register custom fonts (ensure these files exist in your assets folder)
try {
    registerFont('./assets/fonts/Exo2-Bold.ttf', { family: 'Exo2', weight: 'bold' });
    registerFont('./assets/fonts/Exo2-Regular.ttf', { family: 'Exo2' });
    registerFont('./assets/fonts/Orbitron-Bold.ttf', { family: 'Orbitron', weight: 'bold' });
} catch (err) {
    console.warn('Could not register custom fonts, falling back to system fonts', err);
}

// Helper function for drawing rounded rectangles
function roundedRect(ctx: NodeCanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

// Helper function to draw sharp-edged rectangles (more industrial)
function sharpRect(ctx: NodeCanvasRenderingContext2D, x: number, y: number, width: number, height: number, cornerSize: number = 5) {
    ctx.beginPath();
    ctx.moveTo(x + cornerSize, y);
    ctx.lineTo(x + width - cornerSize, y);
    ctx.lineTo(x + width, y + cornerSize);
    ctx.lineTo(x + width, y + height - cornerSize);
    ctx.lineTo(x + width - cornerSize, y + height);
    ctx.lineTo(x + cornerSize, y + height);
    ctx.lineTo(x, y + height - cornerSize);
    ctx.lineTo(x, y + cornerSize);
    ctx.closePath();
}

// Helper function to draw a star (used for high-rank decoration)
function drawStar(ctx: NodeCanvasRenderingContext2D, cx: number, cy: number, outerRadius: number, innerRadius: number, color: string) {
    let rot = Math.PI / 2 * 3;
    let step = Math.PI / 5;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < 5; i++) {
        let x = cx + Math.cos(rot) * outerRadius;
        let y = cy + Math.sin(rot) * outerRadius;
        ctx.lineTo(x, y);
        rot += step;
        x = cx + Math.cos(rot) * innerRadius;
        y = cy + Math.sin(rot) * innerRadius;
        ctx.lineTo(x, y);
        rot += step;
    }
    ctx.fillStyle = color;
    ctx.fill();
}

// Helper function to create worn edge effect
function createWornEdge(ctx: NodeCanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
    const wornAmount = 1.2; // Slightly reduced for a more subtle effect
    const noise = 0.7;     // Reduced for cleaner edges

    ctx.save();
    ctx.strokeStyle = 'rgba(50, 50, 50, 0.5)';
    ctx.lineWidth = 0.8;   // Thinner lines for a more refined look

    for (let i = 0; i < width; i += 12) {  // Increased spacing for cleaner look
        const distort = (Math.random() * noise - noise / 2) * wornAmount;
        ctx.beginPath();
        ctx.moveTo(x + i, y + distort);
        ctx.lineTo(x + i + 5, y + (Math.random() * noise - noise / 2) * wornAmount);
        ctx.stroke();

        const bottomDistort = (Math.random() * noise - noise / 2) * wornAmount;
        ctx.beginPath();
        ctx.moveTo(x + i, y + height + bottomDistort);
        ctx.lineTo(x + i + 5, y + height + (Math.random() * noise - noise / 2) * wornAmount);
        ctx.stroke();
    }

    for (let i = 0; i < height; i += 12) {
        const distort = (Math.random() * noise - noise / 2) * wornAmount;
        ctx.beginPath();
        ctx.moveTo(x + distort, y + i);
        ctx.lineTo(x + (Math.random() * noise - noise / 2) * wornAmount, y + i + 5);
        ctx.stroke();

        const rightDistort = (Math.random() * noise - noise / 2) * wornAmount;
        ctx.beginPath();
        ctx.moveTo(x + width + rightDistort, y + i);
        ctx.lineTo(x + width + (Math.random() * noise - noise / 2) * wornAmount, y + i + 5);
        ctx.stroke();
    }
    ctx.restore();
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
    // FIXED: Updated URLs to more reliable sources
    const newBackgroundUrl = 'https://i.ibb.co/Z68bgDS8/NEW-SOH-BACK.png'; // Dark tech background
    const frontLogoUrl = 'https://i.ibb.co/xSrQvRCW/NEW-SOH-FRONT.png'; // Generic logo placeholder

    const width = 1000;
    const height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Load and draw main background with better error handling
    let background;
    try {
        background = await loadImage(newBackgroundUrl);
        ctx.drawImage(background, 0, 0, width, height);

        // Modern overlay gradient for better readability
        const overlay = ctx.createLinearGradient(0, 0, 0, height);
        overlay.addColorStop(0, 'rgba(10, 12, 18, 0.4)');
        overlay.addColorStop(0.5, 'rgba(10, 12, 18, 0.3)');
        overlay.addColorStop(1, 'rgba(10, 12, 18, 0.5)');
        ctx.fillStyle = overlay;
        ctx.fillRect(0, 0, width, height);
    } catch (error) {
        console.error(`Failed to load background image: ${newBackgroundUrl}`, error);
        // Fallback: create a more modern gradient background
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#161921');
        gradient.addColorStop(0.5, '#21232d');
        gradient.addColorStop(1, '#191b24');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    }

    // Create a modern card effect with sharper edges and better transparency
    const cardX = 40;
    const cardY = 40;
    const cardWidth = width - 80;
    const cardHeight = height - 80;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 25;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = 'rgba(22, 22, 28, 0.8)'; // Darker, more solid background
    sharpRect(ctx, cardX, cardY, cardWidth, cardHeight, 8); // Larger corner size for modern look
    ctx.fill();

    // Modern steel border with sharper contrast
    const borderGradient = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardHeight);
    borderGradient.addColorStop(0, '#8a8a9a');
    borderGradient.addColorStop(0.5, '#d0d0d0'); // Brighter midpoint
    borderGradient.addColorStop(1, '#5a5a6a'); // Darker end
    ctx.strokeStyle = borderGradient;
    ctx.lineWidth = 2.5; // Slightly thicker border
    sharpRect(ctx, cardX, cardY, cardWidth, cardHeight, 8);
    ctx.stroke();
    ctx.restore();

    // Add modern tech pattern overlay instead of simple grid
    ctx.save();
    ctx.globalAlpha = 0.07; // Slightly more visible
    // Horizontal tech lines with varying opacity
    for (let i = 0; i < width; i += 60) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, height);
        ctx.strokeStyle = i % 180 === 0 ? '#5B329A' : '#aaaaaa'; // Purple accent on every third line
        ctx.lineWidth = i % 180 === 0 ? 0.8 : 0.4; // Thicker for accent lines
        ctx.stroke();
    }
    // Vertical tech lines with data points
    for (let i = 0; i < height; i += 60) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(width, i);
        ctx.strokeStyle = i % 180 === 0 ? '#5B329A' : '#aaaaaa';
        ctx.lineWidth = i % 180 === 0 ? 0.8 : 0.4;
        ctx.stroke();

        // Add data points at intersections for tech feel
        if (i % 180 === 0) {
            for (let j = 0; j < width; j += 180) {
                ctx.beginPath();
                ctx.arc(j, i, 2, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(62, 1, 84, 0.7)';
                ctx.fill();
            }
        }
    }
    ctx.restore();

    // Add worn edge effect to card - more refined and subtle
    createWornEdge(ctx, cardX, cardY, cardWidth, cardHeight);

    // Avatar positioning - optimized for layout balance
    const avatarSize = 100;
    const avatarX = cardX + 60;
    const avatarY = cardY + 30;

    // Load and draw avatar with modern industrial effects
    let avatar;
    try {
        avatar = await loadImage(avatarUrl);
    } catch (error) {
        console.error(`Failed to load avatar image: ${avatarUrl}`, error);
        avatar = createCanvas(128, 128);
        const fallbackCtx = avatar.getContext('2d');
        fallbackCtx.fillStyle = '#2a2a33';
        fallbackCtx.fillRect(0, 0, 128, 128);
        fallbackCtx.font = '32px Arial';
        fallbackCtx.fillStyle = '#999';
        fallbackCtx.textAlign = 'center';
        fallbackCtx.fillText('?', 64, 80);
    }

    ctx.save();
    // Enhanced avatar glow for more visual impact
    const glowSize = 15; // Increased from 12
    const glowGradient = ctx.createRadialGradient(
        avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2,
        avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + glowSize
    );
    ctx.shadowColor = 'rgba(110, 60, 200, 0.6)';  // More vibrant purple
    glowGradient.addColorStop(1, 'rgba(30, 60, 100, 0)');
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + glowSize, 0, Math.PI * 2);
    ctx.fillStyle = glowGradient;
    ctx.fill();

    // Modern metallic frame
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 3, 0, Math.PI * 2);
    const metalRingGradient = ctx.createLinearGradient(
        avatarX, avatarY,
        avatarX + avatarSize, avatarY + avatarSize
    );
    metalRingGradient.addColorStop(0, '#b0b0b0');
    metalRingGradient.addColorStop(0.5, '#e8e8e8');
    metalRingGradient.addColorStop(1, '#909090');
    ctx.strokeStyle = metalRingGradient;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Modern industrial bolts - more refined
    for (let i = 0; i < 4; i++) {
        const angle = i * Math.PI / 2;
        const boltX = avatarX + avatarSize / 2 + Math.cos(angle) * (avatarSize / 2 + 6);
        const boltY = avatarY + avatarSize / 2 + Math.sin(angle) * (avatarSize / 2 + 6);

        // Bolt base with modern metallic look
        ctx.beginPath();
        ctx.arc(boltX, boltY, 2.5, 0, Math.PI * 2);
        const boltGradient = ctx.createLinearGradient(
            boltX - 3, boltY - 3, boltX + 3, boltY + 3
        );
        boltGradient.addColorStop(0, '#e0e0e0');
        boltGradient.addColorStop(0.5, '#a0a0a0');
        boltGradient.addColorStop(1, '#808080');
        ctx.fillStyle = boltGradient;
        ctx.fill();

        // Bolt highlight - more subtle
        ctx.beginPath();
        ctx.arc(boltX - 0.8, boltY - 0.8, 0.8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fill();
    }

    // Draw avatar image clipped as a circle
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
    ctx.restore();

    // Determine rank level for decorative emblems
    const rankLevel = userRank.toLowerCase().includes('commander') ? 5 :
        userRank.toLowerCase().includes('officer') ? 4 :
            userRank.toLowerCase().includes('captain') ? 3 :
                userRank.toLowerCase().includes('sergeant') ? 2 : 1;

    // Username and rank positioning
    const nameX = avatarX + avatarSize + 30;
    const nameY = avatarY + 35;

    // Draw username with modern metallic effect
    ctx.save();
    ctx.font = `bold 38px Orbitron, Arial`;

    // Modern shadow for depth
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillText(userName, nameX + 1.5, nameY + 1.5);

    // Modern metal gradient for text
    const nameGradient = ctx.createLinearGradient(nameX, nameY - 30, nameX, nameY + 10);
    nameGradient.addColorStop(0, '#ffffff');
    nameGradient.addColorStop(0.5, '#e0e0e0');
    nameGradient.addColorStop(1, '#b0b0b0');
    ctx.fillStyle = nameGradient;
    ctx.fillText(userName, nameX, nameY);

    // Modern rank emblems for higher ranks
    if (rankLevel > 2) {
        for (let i = 0; i < rankLevel - 2; i++) {
            const emblemX = nameX + ctx.measureText(userName).width + 20 + (i * 25);

            // Modern star with glow
            ctx.save();
            ctx.shadowColor = 'rgba(82, 0, 90, 0.6)';
            ctx.shadowBlur = 8;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            drawStar(ctx, emblemX, nameY - 15, 10, 5, '#d0d0e0');
            ctx.restore();
        }
    }
    ctx.restore();

    // Draw rank badge with modern styling
    ctx.save();
    ctx.font = `26px Exo2, Arial`;
    const rankText = `${userRank}`;
    const rankWidth = ctx.measureText(rankText).width + 20;
    const rankX = nameX;
    const rankY = nameY + 20;

    // Modern badge background with enhanced depth
    const badgeGradient = ctx.createLinearGradient(rankX, rankY, rankX, rankY + 36);
    badgeGradient.addColorStop(0, 'rgba(30, 30, 38, 0.9)');
    badgeGradient.addColorStop(0.5, 'rgba(35, 35, 45, 0.85)');
    badgeGradient.addColorStop(1, 'rgba(28, 28, 36, 0.9)');
    ctx.fillStyle = badgeGradient;
    roundedRect(ctx, rankX, rankY, rankWidth, 36, 5);
    ctx.fill();

    // Modern metal plate border with refined styling
    const rankBorderGradient = ctx.createLinearGradient(rankX, rankY, rankX + rankWidth, rankY);
    rankBorderGradient.addColorStop(0, '#8a8a9a');
    rankBorderGradient.addColorStop(0.5, '#c0c0d0');
    rankBorderGradient.addColorStop(1, '#8a8a9a');
    ctx.strokeStyle = rankBorderGradient;
    ctx.lineWidth = 1;
    roundedRect(ctx, rankX, rankY, rankWidth, 36, 5);
    ctx.stroke();

    // Modern text with light purple color as requested
    ctx.fillStyle = '#a0d0ff'; // Light purple text color
    ctx.shadowColor = 'rgba(87, 1, 79, 0.4)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillText(rankText, rankX + 10, rankY + 26);

    // Removed the rivets/dots as requested
    ctx.restore();

    // Modern tech-style progress bar
    ctx.save();
    const progressBarWidth = cardWidth - 120;
    const progressBarHeight = 26; // Slightly taller
    const progressX = cardX + 60;
    const progressY = avatarY + avatarSize + 25;
    const progress = nextXP ? Math.min(currentXP / nextXP, 1) : 1;
    const filledWidth = progress * progressBarWidth;

    // Shadow for depth
    ctx.shadowColor = 'rgba(110, 60, 200, 0.6)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;

    // Sharp-cornered progress bar background for modern tech look
    ctx.fillStyle = 'rgba(22, 22, 28, 0.95)';
    ctx.fillRect(progressX, progressY, progressBarWidth, progressBarHeight);

    // Techy border with purple accent
    ctx.strokeStyle = '#5C5060';
    ctx.lineWidth = 1;
    ctx.strokeRect(progressX, progressY, progressBarWidth, progressBarHeight);

    // Add tech pattern to empty bar
    ctx.save();
    ctx.beginPath();
    ctx.rect(progressX, progressY, progressBarWidth, progressBarHeight);
    ctx.clip();
    ctx.globalAlpha = 0.1;
    for (let i = 0; i < progressBarWidth; i += 8) {
        ctx.beginPath();
        ctx.moveTo(progressX + i, progressY);
        ctx.lineTo(progressX + i, progressY + progressBarHeight);
        ctx.strokeStyle = '#606070';
        ctx.lineWidth = 0.5;
        ctx.stroke();
    }
    ctx.restore();

    // Modern high-contrast fill
    if (filledWidth > 0) {
        // More vibrant purple gradient
        const progressGradient = ctx.createLinearGradient(progressX, progressY, progressX + progressBarWidth, progressY);
        progressGradient.addColorStop(0, '#3a1465'); // Deep rich purple
        progressGradient.addColorStop(0.4, '#6c2dc7'); // Medium vibrant purple
        progressGradient.addColorStop(1, '#9d5cf0'); // Bright accent purple
        ctx.fillStyle = progressGradient;

        // Draw with sharp corners for modern look
        ctx.fillRect(progressX, progressY, filledWidth, progressBarHeight);

        // Add tech scanline effect to filled portion
        ctx.save();
        ctx.globalAlpha = 0.15;
        ctx.beginPath();
        ctx.rect(progressX, progressY, filledWidth, progressBarHeight);
        ctx.clip();

        for (let i = 0; i < progressBarHeight; i += 4) {
            ctx.beginPath();
            ctx.moveTo(progressX, progressY + i);
            ctx.lineTo(progressX + filledWidth, progressY + i);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
        ctx.restore();
    }

    // Modern XP counter - tech-inspired
    ctx.font = 'bold 16px Orbitron, Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    // Add drop shadow for better readability
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 3;
    ctx.fillText(
        `XP: ${currentXP} / ${nextXP ?? 'MAX'}`,
        progressX + progressBarWidth / 2,
        progressY + progressBarHeight / 2 + 6
    );

    // Centered indicator dots in the progress bar
    ctx.shadowBlur = 0;
    for (let i = 0.2; i <= 0.8; i += 0.2) {
        const dotX = progressX + (progressBarWidth * i);
        const dotY = progressY + progressBarHeight / 2; // Centered vertically
        const isActive = progress >= i;

        // Modern indicator design
        ctx.beginPath();
        ctx.arc(dotX, dotY, 2, 0, Math.PI * 2);
        ctx.fillStyle = isActive ? '#a0d0ff' : '#505050';
        ctx.fill();

        // Subtle glow for active indicators
        if (isActive) {
            ctx.beginPath();
            ctx.arc(dotX, dotY, 3.5, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(65, 0, 40, 0.4)';
            ctx.lineWidth = 0.7;
            ctx.stroke();
        }
    }
    ctx.restore();

    // Updated combat statistics section with modern styling and no triangles
    ctx.save();
    // Set these properties specifically to prevent triangle artifacts
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 1;

    const statsStartY = progressY + progressBarHeight + 50;
    const statItemWidth = (cardWidth - 120) / 4;
    const statItemHeight = 45;

    // Modern tech header
    ctx.font = 'bold 16px Orbitron, Arial'; // Change to Orbitron for tech feel
    ctx.fillStyle = '#6c2dc7'; // Dark purple for consistency
    ctx.textAlign = 'center';
    ctx.fillText('COMBAT STATISTICS', cardX + cardWidth / 2, statsStartY - 8);

    // Modern divider with tech feel
    const dividerGradient = ctx.createLinearGradient(
        cardX + 100, statsStartY,
        cardX + cardWidth - 100, statsStartY
    );
    dividerGradient.addColorStop(0, 'rgba(80, 100, 180, 0.1)');
    dividerGradient.addColorStop(0.5, 'rgba(110, 60, 200, 0.7)'); // Improved purple
    dividerGradient.addColorStop(1, 'rgba(80, 100, 180, 0.1)');

    ctx.strokeStyle = dividerGradient;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cardX + 100, statsStartY);
    ctx.lineTo(cardX + cardWidth - 100, statsStartY);
    ctx.stroke();

    // Stats items
    const statsItems = [
        { label: 'RAIDS', value: attendance.raids },
        { label: 'DEFENSES', value: attendance.defenses },
        { label: 'SCRIMS', value: attendance.scrims },
        { label: 'TRAININGS', value: attendance.trainings }
    ];

    // Center the stats
    const statsStartX = cardX + (cardWidth - statsItems.length * statItemWidth) / 2;

    statsItems.forEach((item, index) => {
        const statX = statsStartX + index * statItemWidth;
        const statY = statsStartY + 10;

        // Clean rectangle with NO gradients to prevent triangle artifacts
        ctx.fillStyle = '#1a1a24'; // Solid dark background
        ctx.fillRect(statX, statY, statItemWidth - 10, statItemHeight);

        // Simple clean border
        ctx.strokeStyle = '#9d5cf0';
        ctx.lineWidth = 1;
        ctx.strokeRect(statX, statY, statItemWidth - 10, statItemHeight);

        // Modern accent line at top - flat for no triangles
        ctx.beginPath();
        ctx.moveTo(statX, statY);
        ctx.lineTo(statX + statItemWidth - 10, statY);
        ctx.strokeStyle = '#9d5cf0'; // More vibrant purple
        ctx.lineWidth = 2;
        ctx.stroke();

        // Clean text rendering
        const centerX = statX + (statItemWidth - 10) / 2;

        // Label with tech font
        ctx.fillStyle = '#c4a0f0';
        ctx.font = '13px Orbitron, Arial';
        ctx.textAlign = 'center';
        ctx.fillText(item.label, centerX, statY + 17);

        // Value with more prominence
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 19px Orbitron, Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${item.value}`, centerX, statY + 38);
    });

    ctx.restore();

    // Enhanced front logo with better error handling
    try {
        const frontLogo = await loadImage(frontLogoUrl);
        // Increase size to 220px wide for more prominence
        const logoWidth = 220;
        const logoHeight = 220 * (frontLogo.height / frontLogo.width);
        const logoX = cardX + cardWidth - logoWidth - 20;
        const logoY = cardY + 10;

        // Modern tech glow behind the logo
        ctx.save();
        ctx.shadowColor = 'rgba(110, 60, 200, 0.6)';
        ctx.shadowBlur = 25;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.drawImage(frontLogo, logoX, logoY, logoWidth, logoHeight);
        ctx.restore();
    } catch (error) {
        console.error(`Failed to load front logo image: ${frontLogoUrl}`, error);

        // Modern fallback logo created directly on canvas
        const logoWidth = 220;
        const logoHeight = 220;
        const logoX = cardX + cardWidth - logoWidth - 20;
        const logoY = cardY + 10;

        ctx.save();
        // Draw tech-style logo shape
        ctx.beginPath();
        ctx.arc(logoX + logoWidth / 2, logoY + logoHeight / 2, logoWidth / 3, 0, Math.PI * 2);
        const logoGradient = ctx.createRadialGradient(
            logoX + logoWidth / 2, logoY + logoHeight / 2, logoWidth / 6,
            logoX + logoWidth / 2, logoY + logoHeight / 2, logoWidth / 3
        );
        logoGradient.addColorStop(0, 'rgba(60, 100, 180, 0.1)');
        logoGradient.addColorStop(0.7, 'rgba(40, 80, 140, 0.05)');
        logoGradient.addColorStop(1, 'rgba(30, 60, 120, 0)');
        ctx.fillStyle = logoGradient;
        ctx.fill();

        // Add tech details to fallback logo
        ctx.strokeStyle = 'rgba(100, 150, 230, 0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(logoX + logoWidth / 2, logoY + logoHeight / 2, logoWidth / 4, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(230, 100, 221, 0.3)';
        ctx.stroke();
        ctx.restore();
    }

    return canvas.toBuffer();
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
        if (!userData) {
            return ctx.reply({
                content: 'User data not found. They might not have any XP logged yet.',
                ephemeral: true,
            });
        }

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