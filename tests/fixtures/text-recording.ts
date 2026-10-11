interface TextItem { text: string; x: number; y: number }
declare global { interface Window { textFrames: WeakMap<HTMLCanvasElement, TextItem[]> } }

/** 记录真实 SDK 在各画布上绘制的文字，区分绘图区标题与价格轴数值。 */
export function installTextRecorder() {
    window.textFrames = new WeakMap();
    const prototype = CanvasRenderingContext2D.prototype;
    const { fillText, fillRect, clearRect } = prototype;
    const reset = (context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) => {
        if (x === 0 && y === 0 && width === context.canvas.width && height === context.canvas.height) window.textFrames.set(context.canvas, []);
    };
    prototype.fillText = function(text, x, y, maxWidth) {
        const frame = window.textFrames.get(this.canvas) ?? [];
        frame.push({ text, x, y }); window.textFrames.set(this.canvas, frame);
        return maxWidth === undefined ? fillText.call(this, text, x, y) : fillText.call(this, text, x, y, maxWidth);
    };
    prototype.fillRect = function(x, y, width, height) { reset(this, x, y, width, height); return fillRect.call(this, x, y, width, height); };
    prototype.clearRect = function(x, y, width, height) { reset(this, x, y, width, height); return clearRect.call(this, x, y, width, height); };
}
