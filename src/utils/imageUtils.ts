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
 * Load an image from URL or file path
 */
export async function loadImage(src: string): Promise<Jimp> {
    try {
        return await Jimp.read(src);
    } catch (err) {
        console.error(`🖼️ loadImage failed: ${src}`, err);
        throw err;
    }
}

/**
 * Convert hex "#RRGGBB" or "#RRGGBBAA" to Jimp color int
 */
export function hexToJimpColor(hex: string): number {
    let h = hex.replace(/^#/, '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (h.length === 6) h += 'FF';
    return parseInt(h, 16);
}

/**
 * INTERNAL: build a transparent mask then call drawMask(mask)
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
 * Draw a filled rounded rectangle
 */
export async function drawRoundedRect(
    image: Jimp,
    x: number, y: number,
    w: number, h: number,
    r: number,
    color: number
): Promise<Jimp> {
    const rect = await createCanvas(w, h, color);

    const mask = await maskShape(w, h, m => {
        // fill center
        m.scan(r, 0, w - 2 * r, h, (_xx, _yy, idx) => m.bitmap.data.writeUInt32BE(0xFFFFFFFF, idx));
        m.scan(0, r, w, h - 2 * r, (_xx, _yy, idx) => m.bitmap.data.writeUInt32BE(0xFFFFFFFF, idx));
        // draw corners
        for (let cy of [r - 1, h - r]) {
            for (let cx of [r - 1, w - r]) {
                for (let dy = -r; dy <= r; dy++) {
                    for (let dx = -r; dx <= r; dx++) {
                        if (dx * dx + dy * dy <= r * r) m.setPixelColor(0xFFFFFFFF, cx + dx, cy + dy);
                    }
                }
            }
        }
    });

    rect.mask(mask, 0, 0);
    image.composite(rect, x, y);
    return image;
}

/**
 * Draw a rounded rectangle with a 1px border
 */
export async function drawRoundedRectWithBorder(
    image: Jimp,
    x: number, y: number,
    w: number, h: number,
    r: number,
    fillColor: number,
    borderColor: number,
    borderWidth = 1
): Promise<Jimp> {
    // fill
    await drawRoundedRect(image, x, y, w, h, r, fillColor);

    // border via two concentric rounded rect masks
    const outer = await maskShape(w, h, m => {
        // full
        m.scan(0, 0, w, h, (_xx, _yy, idx) => m.bitmap.data.writeUInt32BE(0xFFFFFFFF, idx));
    });
    const inner = await maskShape(w - 2 * borderWidth, h - 2 * borderWidth, m => {
        // round inside
        // reuse drawRoundedRect logic for inner mask
        drawMaskRounded(m, 0, 0, w - 2 * borderWidth, h - 2 * borderWidth, r - borderWidth);
    });

    // subtract inner from outer to get ring
    outer.scan(0, 0, w, h, (px, py, idx) => {
        const insideInner = inner.getPixelColor(px - borderWidth, py - borderWidth) !== 0;
        if (insideInner) outer.bitmap.data.writeUInt32BE(0x00000000, idx);
    });

    // color the ring
    const ring = await createCanvas(w, h, borderColor);
    ring.mask(outer, 0, 0);
    image.composite(ring, x, y);
    return image;
}

/**
 * Helper to draw a rounded mask (used by border above)
 */
function drawMaskRounded(
    mask: Jimp,
    x: number, y: number,
    w: number, h: number,
    r: number
) {
    // fill center
    mask.scan(x + r, y, w - 2 * r, h, (_xx, _yy, idx) => mask.bitmap.data.writeUInt32BE(0xFFFFFFFF, idx));
    mask.scan(x, y + r, w, h - 2 * r, (_xx, _yy, idx) => mask.bitmap.data.writeUInt32BE(0xFFFFFFFF, idx));
    // corners
    for (let cy of [y + r - 1, y + h - r]) {
        for (let cx of [x + r - 1, x + w - r]) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (dx * dx + dy * dy <= r * r) mask.setPixelColor(0xFFFFFFFF, cx + dx, cy + dy);
                }
            }
        }
    }
}

/**
 * Draw a sharp-cornered rectangle
 */
export async function drawSharpRect(
    image: Jimp,
    x: number, y: number,
    w: number, h: number,
    color: number
): Promise<Jimp> {
    image.scan(x, y, w, h, (_px, _py, idx) => image.bitmap.data.writeUInt32BE(color, idx));
    return image;
}

/**
 * Draw a 5-point star
 */
export async function drawStar(
    image: Jimp,
    cx: number, cy: number,
    outer: number, inner: number,
    color: number
): Promise<Jimp> {
    // build points
    const pts: { x: number, y: number }[] = [];
    let ang = -Math.PI / 2;
    for (let i = 0; i < 5; i++) {
        pts.push({ x: Math.cos(ang) * outer + cx, y: Math.sin(ang) * outer + cy });
        ang += Math.PI / 5;
        pts.push({ x: Math.cos(ang) * inner + cx, y: Math.sin(ang) * inner + cy });
        ang += Math.PI / 5;
    }

    // bounding box
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const minX = Math.floor(Math.min(...xs)), maxX = Math.ceil(Math.max(...xs));
    const minY = Math.floor(Math.min(...ys)), maxY = Math.ceil(Math.max(...ys));
    // point-in-poly scan
    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            let inside = false;
            for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
                const { x: xi, y: yi } = pts[i], { x: xj, y: yj } = pts[j];
                if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
            }
            if (inside) image.setPixelColor(color, x, y);
        }
    }

    return image;
}

/**
 * Apply a noisy "worn edge" along the border
 */
export async function createWornEdge(
    image: Jimp,
    x: number, y: number,
    w: number, h: number
): Promise<Jimp> {
    const col = Jimp.rgbaToInt(50, 50, 50, 150);
    for (let i = 0; i < w; i += 6) {
        const dy = Math.floor((Math.random() - .5) * 4);
        image.setPixelColor(col, x + i, y + dy);
        image.setPixelColor(col, x + i, y + h - dy - 1);
    }
    for (let i = 0; i < h; i += 6) {
        const dx = Math.floor((Math.random() - .5) * 4);
        image.setPixelColor(col, x + dx, y + i);
        image.setPixelColor(col, x + w - dx - 1, y + i);
    }
    return image;
}

/**
 * Print text with a subtle drop-shadow
 */
export async function printTextWithShadow(
    image: Jimp,
    font: any,
    text: string,
    x: number,
    y: number,
    color = 0xFFFFFFFF,
    shadowColor = 0x00000080
): Promise<Jimp> {
    // shadow
    image.print(font, x + 2, y + 2, { text, alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: Jimp.VERTICAL_ALIGN_TOP });
    // main
    image.print(font, x, y, { text, alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT, alignmentY: Jimp.VERTICAL_ALIGN_TOP });
    return image;
}
