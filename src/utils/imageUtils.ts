import Jimp from 'jimp';

/**
 * Create a blank canvas with given dimensions and color
 */
export async function createCanvas(width: number, height: number, bgColor = 0x00000000): Promise<any> {
    return new Jimp(width, height, bgColor);
}

/**
 * Load an image from URL or file path
 */
export async function loadImage(url: string): Promise<any> {
    try {
        return await Jimp.read(url);
    } catch (error) {
        console.error(`Failed to load image: ${url}`, error);
        throw error;
    }
}

/**
 * Draw a rounded rectangle with given dimensions and color
 */
export async function drawRoundedRect(
    image: any,
    x: number, y: number,
    width: number, height: number,
    radius: number,
    color: number
): Promise<any> {
    // Create a mask image with transparency
    const mask = await createCanvas(width, height, 0x00000000);

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
    const rect = await createCanvas(width, height, color);

    // Apply mask
    rect.mask(mask, 0, 0);

    // Composite onto main image
    image.composite(rect, x, y);

    return image;
}

/**
 * Draw a sharp-edged rectangle (with cut corners)
 */
export async function drawSharpRect(
    image: any,
    x: number, y: number,
    width: number, height: number,
    cornerSize: number = 5,
    color: number
): Promise<any> {
    // Create a mask image with transparency
    const mask = await createCanvas(width, height, 0x00000000);

    // Draw the shape on the mask
    mask.scan(0, 0, width, height, (px: number, py: number) => {
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
    const rect = await createCanvas(width, height, color);

    // Apply mask
    rect.mask(mask, 0, 0);

    // Composite onto main image
    image.composite(rect, x, y);

    return image;
}

/**
 * Helper function to check if a point is inside a polygon
 */
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

/**
 * Draw a star at the given position
 */
export async function drawStar(
    image: any,
    cx: number, cy: number,
    outerRadius: number, innerRadius: number,
    color: number
): Promise<any> {
    // Create a temporary canvas for the star
    const starSize = Math.max(outerRadius, innerRadius) * 2 + 4; // Add padding
    const starImg = await createCanvas(starSize, starSize, 0x00000000);

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
    image.composite(starImg, cx - starSize / 2, cy - starSize / 2);

    return image;
}

/**
 * Add a worn edge effect to create a grungy border
 */
export async function createWornEdge(
    image: any,
    x: number, y: number,
    width: number, height: number
): Promise<any> {
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

/**
 * Print text with a shadow effect
 */
export async function printTextWithShadow(
    image: any,
    font: any,
    text: string,
    x: number, y: number,
    shadowColor: number = 0x00000080,
    shadowOffset: number = 1
): Promise<any> {
    // Print shadow
    image.print(font, x + shadowOffset, y + shadowOffset, { text });

    // Print main text
    image.print(font, x, y, { text });

    return image;
}

/**
 * Convert hex color string to Jimp color number
 */
export function hexToJimpColor(hex: string): number {
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