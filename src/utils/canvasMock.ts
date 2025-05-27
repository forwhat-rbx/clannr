import { Logger } from './logger';
import { promises as fs } from 'fs';
import path from 'path';

// Enhanced MockCanvas class
class MockCanvas {
    width: number;
    height: number;
    context: MockContext;

    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.context = new MockContext();
        Logger.info('Created mock canvas with dimensions: ' + width + 'x' + height, 'CanvasMock');
    }

    getContext(type: string) {
        return this.context;
    }

    toBuffer() {
        // Generate a simple buffer with a placeholder image
        return Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    }
}

// Enhanced MockContext class with better stubs
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

    _path: Array<{ method: string, args: any[] }> = [];
    _transformMatrix = [1, 0, 0, 1, 0, 0]; // identity matrix

    fillRect() { return this; }
    strokeRect() { return this; }
    fillText(text: string, x: number, y: number) { return this; }
    strokeText(text: string, x: number, y: number) { return this; }
    measureText(text: string) { return { width: text.length * 7 }; }

    beginPath() { this._path = []; return this; }
    moveTo(x: number, y: number) { this._path.push({ method: 'moveTo', args: [x, y] }); return this; }
    lineTo(x: number, y: number) { this._path.push({ method: 'lineTo', args: [x, y] }); return this; }
    arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise?: boolean) {
        this._path.push({ method: 'arc', args: [x, y, radius, startAngle, endAngle, anticlockwise] });
        return this;
    }
    quadraticCurveTo(cpx: number, cpy: number, x: number, y: number) {
        this._path.push({ method: 'quadraticCurveTo', args: [cpx, cpy, x, y] });
        return this;
    }
    closePath() { this._path.push({ method: 'closePath', args: [] }); return this; }

    fill() { return this; }
    stroke() { return this; }
    clip() { return this; }
    save() { return this; }
    restore() { return this; }

    createLinearGradient(x0: number, y0: number, x1: number, y1: number) {
        return {
            addColorStop: (offset: number, color: string) => { }
        };
    }

    createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) {
        return {
            addColorStop: (offset: number, color: string) => { }
        };
    }

    drawImage() { return this; }
    rect(x: number, y: number, width: number, height: number) {
        this._path.push({ method: 'rect', args: [x, y, width, height] });
        return this;
    }
}

// Create placeholder image for loadImage
const mockLoadImage = async (src: string) => {
    Logger.info('Mock loading image from: ' + src, 'CanvasMock');
    return {
        width: 100,
        height: 100,
        src: src
    };
};

const mockRegisterFont = (path: string, options: any) => {
    Logger.info('Mock registering font: ' + path, 'CanvasMock');
};

const mockCreateCanvas = (width: number, height: number) => {
    return new MockCanvas(width, height);
};

export const createCanvas = mockCreateCanvas;
export const loadImage = mockLoadImage;
export const registerFont = mockRegisterFont;
export const CanvasRenderingContext2D = MockContext;

export default {
    createCanvas: mockCreateCanvas,
    loadImage: mockLoadImage,
    registerFont: mockRegisterFont,
    Canvas: MockCanvas,
    CanvasRenderingContext2D: MockContext
};