import { ColorType, type IPrimitivePaneRenderer, type IPrimitivePaneView, type ISeriesPrimitive, type SeriesAttachedParameter } from 'lightweight-charts';

export interface PriceLineLabel { price: number; color: string; title: string }

/** 左侧标签随 SDK 的重绘取坐标；不创建额外系列、DOM、订阅或计时器。 */
export class PriceLineLabels implements ISeriesPrimitive, IPrimitivePaneRenderer {
    private state?: SeriesAttachedParameter;
    private lines: PriceLineLabel[] = [];
    private signature = '';
    private views: IPrimitivePaneView[] = [{ zOrder: () => 'top', renderer: () => this }];

    attached(state: SeriesAttachedParameter) { this.state = state; }
    detached() { this.state = undefined; }
    paneViews() { return this.views; }
    set(lines: PriceLineLabel[]) {
        const signature = JSON.stringify(lines);
        if (signature === this.signature) return;
        this.lines = lines; this.signature = signature; this.state?.requestUpdate();
    }
    draw(target: Parameters<IPrimitivePaneRenderer['draw']>[0]) {
        const state = this.state;
        if (!state || !state.series.options().visible) return;
        const layout = state.chart.options().layout;
        const fontSize = Math.min(11, layout.fontSize), height = fontSize + 6, gap = height + 2;
        const formatter = state.series.priceFormatter();
        target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
            const rows = this.lines.flatMap(line => {
                const y = state.series.priceToCoordinate(line.price);
                return y === null || y < 0 || y > mediaSize.height ? [] : [{ ...line, y, center: Number(y),
                    text: [line.title, formatter.format(line.price)].filter(Boolean).join(' ') }];
            }).sort((a, b) => a.y - b.y);
            // 为顶部图例与底部标识留白；近价只错开标签，短引线仍指回真实价格。
            const inset = Math.min(28, Math.max(0, (mediaSize.height - rows.length * gap) / 2));
            let previous = -gap;
            for (const row of rows) { row.center = Math.max(inset + height / 2, row.center, previous + gap); previous = row.center; }
            let next = mediaSize.height - inset - height / 2;
            for (let i = rows.length - 1; i >= 0; i--) { const row = rows[i]!; row.center = Math.min(row.center, next); next = row.center - gap; }
            ctx.save();
            ctx.font = `${fontSize}px ${layout.fontFamily}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
            ctx.lineWidth = 1; ctx.setLineDash([]);
            const background = layout.background;
            let fill: string | CanvasGradient;
            if (background.type === ColorType.Solid) fill = background.color;
            else {
                fill = ctx.createLinearGradient(0, 0, 0, mediaSize.height);
                fill.addColorStop(0, background.topColor); fill.addColorStop(1, background.bottomColor);
            }
            for (const row of rows) {
                const width = Math.min(Math.ceil(ctx.measureText(row.text).width) + 10, mediaSize.width - 8);
                if (width <= 10 || row.center < height / 2) continue;
                ctx.strokeStyle = row.color;
                ctx.beginPath(); ctx.moveTo(0, row.y); ctx.lineTo(4, row.y); ctx.lineTo(4, row.center); ctx.stroke();
                ctx.fillStyle = fill; ctx.fillRect(4, row.center - height / 2, width, height);
                ctx.fillStyle = row.color; ctx.fillRect(4, row.center - height / 2, 2, height);
                ctx.fillText(row.text, 9, row.center, width - 10);
            }
            ctx.restore();
        });
    }
}
