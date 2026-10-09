export interface CandleRect { x: number; y: number; width: number; height: number }
export interface CandleFrame { generation: number; rectangles: CandleRect[] }

declare global {
    interface Window { candleFrames: WeakMap<HTMLCanvasElement, CandleFrame> }
}

/** 测试独立读取 SDK 真正提交的矩形，包括尚未被 canvas 裁切的边缘。 */
export function installCandleRecorder() {
    window.candleFrames = new WeakMap();
    const original = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function(x, y, width, height) {
        let frame = window.candleFrames.get(this.canvas);
        if (x === 0 && y === 0 && width === this.canvas.width && height === this.canvas.height) {
            frame = { generation: (frame?.generation || 0) + 1, rectangles: [] };
            window.candleFrames.set(this.canvas, frame);
        }
        if (frame && ['#16a085', '#e7505a'].includes(String(this.fillStyle)) && width > 0 && height > 0) {
            frame.rectangles.push({ x, y, width, height });
        }
        return original.call(this, x, y, width, height);
    };
}
