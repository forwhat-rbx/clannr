import Jimp from 'jimp';

/**
 * Create a blank canvas
 */
export async function createCanvas(
    width: number,
    height: number,
    color = 0x00000000
): Promise<Jimp> {
    return new Jimp(width, height, color);
}

/**
 * Load an image from URL or path
 */
export async function loadImage(src: string): Promise<Jimp> {
    try {
        return await Jimp.read(src);
    } catch (err) {
        console.error(`🖼️  loadImage failed: ${src}`, err);
        throw err;
    }
}



/**
 * Turn #RRGGBB[AA] into a Jimp-int
 */
export function hexToJimpColor(hex: string): number {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    if (hex.length === 6) hex += 'FF';
    return parseInt(hex, 16);
}

/**
 * GENERAL MASK HELPER
 * - build a transparent mask
 * - call your drawMask(mask)
 * - returns the mask
 */
async function maskShape(
    w: number,
    h: number,
    drawMask: (mask: Jimp) => void
): Promise<Jimp> {
    const mask = await createCanvas(w, h, 0x00000000);
    drawMask(mask);
    return mask;
}

/**
 * Draw any filled polygon on `image` given a list of points.
 */
export async function drawPolygon(
    image: Jimp,
    points: { x: number; y: number }[],
    fillColor: number,
    offsetX = 0,
    offsetY = 0
): Promise<void> {
    // bounding-box scan
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const minX = Math.max(0, Math.min(...xs)), maxX = Math.min(image.bitmap.width, Math.max(...xs));
    const minY = Math.max(0, Math.min(...ys)), maxY = Math.min(image.bitmap.height, Math.max(...ys));

    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            // point-in-poly
            let inside = false;
            for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
                const { x: xi, y: yi } = points[i], { x: xj, y: yj } = points[j];
                if (((yi > y) !== (yj > y)) &&
                    (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                    inside = !inside;
                }
            }
            if (inside) image.setPixelColor(fillColor, x + offsetX, y + offsetY);
        }
    }
}

/**
 * Rounded rectangle
 */
export async function drawRoundedRect(
    image: Jimp,
    x: number, y: number,
    w: number, h: number,
    r: number,
    color: number
): Promise<void> {
    // prepare the filled rect
    const rect = await createCanvas(w, h, color);

    // mask out corners
    const mask = await maskShape(w, h, mask => {
        // fill center rect
        mask.scan(r, 0, w - 2 * r, h, (_x, _y, idx) => mask.bitmap.data.writeUInt32BE(0xFFFFFFFF, idx));
        mask.scan(0, r, w, h - 2 * r, (_x, _y, idx) => mask.bitmap.data.writeUInt32BE(0xFFFFFFFF, idx));

        // draw four quarter-circles
        const drawQuarter = (cx: number, cy: number) => {
            for (let yy = -r; yy <= r; yy++) {
                for (let xx = -r; xx <= r; xx++) {
                    if (xx * xx + yy * yy <= r * r) {
                        mask.setPixelColor(0xFFFFFFFF, cx + xx, cy + yy);
                    }
                }
            }
        };
        drawQuarter(r, r);
        drawQuarter(w - r - 1, r);
        drawQuarter(r, h - r - 1);
        drawQuarter(w - r - 1, h - r - 1);
    });

    // apply & composite
    rect.mask(mask, 0, 0);
    image.composite(rect, x, y);
}

/**
 * Rounded rectangle with border
 */
export async function drawRoundedRectWithBorder(
    image: Jimp,
    x: number, y: number,
    w: number, h: number,
    r: number,
    fillColor: number,
    borderColor: number
): Promise<void> {
    // First draw the fill
    await drawRoundedRect(image, x, y, w, h, r, fillColor);

    // Then draw border (just the edges)
    const borderWidth = 1;

    // Top edge
    for (let i = r; i < w - r; i++) {
        for (let j = 0; j < borderWidth; j++) {
            image.setPixelColor(borderColor, x + i, y + j);
        }
    }

    // Bottom edge
    for (let i = r; i < w - r; i++) {
        for (let j = 0; j < borderWidth; j++) {
            image.setPixelColor(borderColor, x + i, y + h - 1 - j);
        }
    }

    // Left edge
    for (let i = r; i < h - r; i++) {
        for (let j = 0; j < borderWidth; j++) {
            image.setPixelColor(borderColor, x + j, y + i);
        }
    }

    // Right edge
    for (let i = r; i < h - r; i++) {
        for (let j = 0; j < borderWidth; j++) {
            image.setPixelColor(borderColor, x + w - 1 - j, y + i);
        }
    }

    // Draw curved corners with border
    // This is simplified - a proper implementation would draw curved borders
}

/**
 * Sharp-cornered rectangle
 */
export async function drawSharpRect(
    image: Jimp,
    x: number, y: number,
    w: number, h: number,
    color: number
): Promise<void> {
    // Simple rectangle
    for (let i = 0; i < w; i++) {
        for (let j = 0; j < h; j++) {
            image.setPixelColor(color, x + i, y + j);
        }
    }
}

/**
 * Star (5-point)
 */
export async function drawStar(
    image: Jimp,
    cx: number, cy: number,
    outer: number, inner: number,
    color: number
): Promise<void> {
    const pts: { x: number, y: number }[] = [];
    let angle = -Math.PI / 2;
    for (let i = 0; i < 5; i++) {
        pts.push({ x: Math.cos(angle) * outer + cx, y: Math.sin(angle) * outer + cy });
        angle += Math.PI / 5;
        pts.push({ x: Math.cos(angle) * inner + cx, y: Math.sin(angle) * inner + cy });
        angle += Math.PI / 5;
    }
    await drawPolygon(image, pts, color, 0, 0);
}

/**
 * Worn-edge (grunge) border
 */
export async function createWornEdge(
    image: Jimp,
    x: number, y: number,
    w: number, h: number
): Promise<void> {
    // Create a greyish semi-transparent color without using Jimp namespace
    const alpha = 0x80808080; // Directly use the hex value
    for (let i = 0; i < w; i += 8) {
        const dy = Math.floor((Math.random() - .5) * 4);
        image.setPixelColor(alpha, x + i, y + dy);
        image.setPixelColor(alpha, x + i, y + h - dy - 1);
    }
    for (let i = 0; i < h; i += 8) {
        const dx = Math.floor((Math.random() - .5) * 4);
        image.setPixelColor(alpha, x + dx, y + i);
        image.setPixelColor(alpha, x + w - dx - 1, y + i);
    }
}

/**
 * Text + shadow
 */
/**
 * Text + shadow
 */
export async function printTextWithShadow(
    image: Jimp,
    font: null,
    text: string,
    x: number,
    y: number,
    color = 0xFFFFFFFF,
    shadowColor = 0x00000080
): Promise<void> {
    // Apply shadow first (positioned slightly offset)
    image.print(
        font,
        x + 2,
        y + 2,
        {
            text: text,
            alignmentX: 1,
            alignmentY: 1
        },
        image.bitmap.width,
        image.bitmap.height
    );

    // Then apply main text on top
    image.print(
        font,
        x,
        y,
        {
            text: text,
            alignmentX: 1,
            alignmentY: 1
        },
        image.bitmap.width,
        image.bitmap.height
    );
}