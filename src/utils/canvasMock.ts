import { Logger } from './logger';

// Create a mock Canvas class that implements the basic interface
class MockCanvas {
    width: number;
    height: number;
    context: MockContext;

    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.context = new MockContext();
        Logger.info(`Created mock canvas with dimensions ${width}x${height}`, 'CanvasMock');
    }

    getContext(type: string) {
        return this.context;
    }

    toBuffer() {
        // Generate a simple buffer with a placeholder image
        return Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    }
}

// Create a mock context that implements the basic 2D context methods
class MockContext {
    fillStyle: string = '#000000';
    strokeStyle: string = '#000000';
    font: string = '10px Arial';
    textAlign: string = 'left';
    lineWidth: number = 1;
    lineJoin: string = 'miter';
    miterLimit: number = 10;
    globalAlpha: number = 1;
    shadowColor: string = 'rgba(0,0,0,0)';
    shadowBlur: number = 0;
    shadowOffsetX: number = 0;
    shadowOffsetY: number = 0;

    fillRect() { return this; }
    strokeRect() { return this; }
    fillText() { return this; }
    strokeText() { return this; }
    measureText(text: string) { return { width: text.length * 7 }; }
    beginPath() { return this; }
    closePath() { return this; }
    moveTo() { return this; }
    lineTo() { return this; }
    quadraticCurveTo() { return this; }
    arc() { return this; }
    rect() { return this; }
    fill() { return this; }
    stroke() { return this; }
    clip() { return this; }
    save() { return this; }
    restore() { return this; }
    createLinearGradient() {
        return {
            addColorStop: () => { }
        };
    }
    createRadialGradient() {
        return {
            addColorStop: () => { }
        };
    }
    drawImage() { return this; }
}

// Export the mock implementations
export const createCanvas = (width: number, height: number) => new MockCanvas(width, height);
export const loadImage = async (src: string) => ({ width: 100, height: 100, src });
export const registerFont = (path: string, options: any) => { };
export const CanvasRenderingContext2D = MockContext;
export const Canvas = MockCanvas;

export default {
    createCanvas,
    loadImage,
    registerFont,
    Canvas,
    CanvasRenderingContext2D
};