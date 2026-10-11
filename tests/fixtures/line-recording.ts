interface Segment { from: { x: number; y: number }; to: { x: number; y: number } }
export interface LineFrame { generation: number; strokes: Array<{ color: string; segments: Segment[] }> }
declare global { interface Window { lineFrames: WeakMap<HTMLCanvasElement, LineFrame> } }

/** 记录真实 SDK 提交给 canvas 的线段，独立核对是否跨过缺口。 */
export function installLineRecorder() {
    window.lineFrames = new WeakMap();
    const paths = new WeakMap<CanvasRenderingContext2D, { last?: { x: number; y: number }; segments: Segment[] }>();
    const prototype = CanvasRenderingContext2D.prototype;
    const { beginPath, moveTo, lineTo, stroke, fillRect } = prototype;
    prototype.beginPath = function() { paths.set(this, { segments: [] }); return beginPath.call(this); };
    prototype.moveTo = function(x, y) {
        const path = paths.get(this); if (path) path.last = { x, y };
        return moveTo.call(this, x, y);
    };
    prototype.lineTo = function(x, y) {
        const path = paths.get(this);
        if (path?.last) path.segments.push({ from: path.last, to: { x, y } });
        if (path) path.last = { x, y };
        return lineTo.call(this, x, y);
    };
    prototype.stroke = function(path?: Path2D) {
        const segments = paths.get(this)?.segments;
        const frame = window.lineFrames.get(this.canvas);
        if (frame && segments?.length) frame.strokes.push({ color: String(this.strokeStyle), segments: [...segments] });
        return Reflect.apply(stroke, this, path ? [path] : []);
    };
    prototype.fillRect = function(x, y, width, height) {
        if (x === 0 && y === 0 && width === this.canvas.width && height === this.canvas.height) {
            const previous = window.lineFrames.get(this.canvas);
            window.lineFrames.set(this.canvas, { generation: (previous?.generation ?? 0) + 1, strokes: [] });
        }
        return fillRect.call(this, x, y, width, height);
    };
}
