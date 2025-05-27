import { Logger } from './logger';

// Canvas mock class
class MockCanvas {
    width: number;
    height: number;

    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        Logger.warn('Using canvas mock - image generation disabled', 'Canvas');
    }

    getContext(type: string) {
        return new MockContext();
    }

    toBuffer() {
        return Buffer.from('Mock canvas image buffer');
    }
}

// Context mock class
class MockContext {
    fillStyle: string = '#000000';
    font: string = '10px Arial';
    textAlign: string = 'left';
    lineWidth: number = 1;

    fillRect() { }
    fillText() { }
    measureText() { return { width: 100 }; }
    beginPath() { }
    moveTo() { }
    lineTo() { }
    arc() { }
    fill() { }
    stroke() { }
    clip() { }
    save() { }
    restore() { }
    createLinearGradient() {
        return { addColorStop: () => { } };
    }
    createRadialGradient() {
        return { addColorStop: () => { } };
    }
    drawImage() { }
    rect() { }
    quadraticCurveTo() { }
    closePath() { }
}

export const createCanvas = (width: number, height: number) => {
    return new MockCanvas(width, height);
};

export const loadImage = async (src: string) => {
    return { width: 100, height: 100 };
};

export const registerFont = (path: string, options: any) => { };

export default {
    createCanvas,
    loadImage,
    registerFont,
    Canvas: MockCanvas,
    CanvasRenderingContext2D: MockContext
};