import type {
    CustomSeriesPricePlotValues,
    ICustomSeriesPaneRenderer,
    ICustomSeriesPaneView,
    PaneRendererCustomData,
    PriceToCoordinateConverter,
    Time,
    WhitespaceData,
    CustomSeriesOptions,
} from 'lightweight-charts';

/** 仓位箭头数据点定义 */
export interface PositionArrowData {
    time: Time;
    value: number;        // 价格
    direction: 'entry' | 'exit';
    isLong: boolean;
    text?: string;        // 显示的价格文字
}

/** 插件选项 */
export interface PositionArrowSeriesOptions extends CustomSeriesOptions {
    arrowSize: number;
    colorLong: string;
    colorShort: string;
    fontSize: number;
}

/**
 * 仓位箭头渲染器
 */
class PositionArrowRenderer implements ICustomSeriesPaneRenderer {
    private _data: PaneRendererCustomData<Time, PositionArrowData> | null = null;
    private _options: PositionArrowSeriesOptions | null = null;

    update(data: PaneRendererCustomData<Time, PositionArrowData>, options: PositionArrowSeriesOptions): void {
        this._data = data;
        this._options = options;
    }

    draw(target: any, priceConverter: PriceToCoordinateConverter): void {
        if (!this._data || !this._options || this._data.bars.length === 0) return;

        const bars = this._data.bars;
        const visibleRange = this._data.visibleRange;
        if (!visibleRange) return;

        const { from, to } = visibleRange;
        const { arrowSize, colorLong, colorShort, fontSize } = this._options;

        target.useMediaCoordinateSpace((scope: any) => {
            const ctx = scope.context;
            ctx.save();
            ctx.font = `${fontSize}px Arial`;
            ctx.textAlign = 'center';

            for (let i = from; i < to; i++) {
                const bar = bars[i];
                const data = bar.originalData;

                if (data.value === null || data.value === undefined || isNaN(data.value)) continue;

                const x = bar.x;
                const y = priceConverter(data.value);
                if (y === null) continue;

                const color = data.isLong ? colorLong : colorShort;
                ctx.fillStyle = color;
                ctx.strokeStyle = color;
                ctx.lineWidth = 1;

                // 绘制箭头
                this._drawArrow(ctx, x, y, data.direction, arrowSize);

                // 绘制文字
                if (data.text) {
                    const padding = 2;
                    const textY = data.direction === 'entry' ? y - arrowSize - padding : y + arrowSize + fontSize + padding;
                    ctx.fillText(data.text, x, textY);
                }
            }

            ctx.restore();
        });
    }

    private _drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, direction: 'entry' | 'exit', size: number): void {
        const headSize = size;
        const bodyHeight = size * 0.6;
        const bodyWidth = size * 1.0; // 稍微拉长一点尾巴，使其更有指向感

        ctx.beginPath();
        if (direction === 'entry') {
            // 实心向右箭头 →，尖端指向 x
            const tipX = x;
            const headBaseX = x - headSize;
            const tailX = headBaseX - bodyWidth;

            ctx.moveTo(tailX, y - bodyHeight / 2);
            ctx.lineTo(headBaseX, y - bodyHeight / 2);
            ctx.lineTo(headBaseX, y - headSize);
            ctx.lineTo(tipX, y);
            ctx.lineTo(headBaseX, y + headSize);
            ctx.lineTo(headBaseX, y + bodyHeight / 2);
            ctx.lineTo(tailX, y + bodyHeight / 2);
        } else {
            // 实心向左箭头 ←，尖端指向 x
            const tipX = x;
            const headBaseX = x + headSize;
            const tailX = headBaseX + bodyWidth;

            ctx.moveTo(tailX, y - bodyHeight / 2);
            ctx.lineTo(headBaseX, y - bodyHeight / 2);
            ctx.lineTo(headBaseX, y - headSize);
            ctx.lineTo(tipX, y);
            ctx.lineTo(headBaseX, y + headSize);
            ctx.lineTo(headBaseX, y + bodyHeight / 2);
            ctx.lineTo(tailX, y + bodyHeight / 2);
        }
        ctx.closePath();
        ctx.fill();
    }
}

/**
 * PositionArrow Custom Series 插件实现
 */
export class PositionArrowSeries implements ICustomSeriesPaneView<Time, PositionArrowData, PositionArrowSeriesOptions> {
    private _renderer: PositionArrowRenderer = new PositionArrowRenderer();

    renderer(): PositionArrowRenderer {
        return this._renderer;
    }

    update(data: PaneRendererCustomData<Time, PositionArrowData>, options: PositionArrowSeriesOptions): void {
        this._renderer.update(data, options);
    }

    priceValueBuilder(plotRow: PositionArrowData): CustomSeriesPricePlotValues {
        return [plotRow.value];
    }

    isWhitespace(data: PositionArrowData | WhitespaceData<Time>): data is WhitespaceData<Time> {
        return (data as PositionArrowData).value === undefined;
    }

    defaultOptions(): PositionArrowSeriesOptions {
        return {
            arrowSize: 8,
            colorLong: '#FF8A00',
            colorShort: '#00E5FF',
            fontSize: 12,
            lastValueVisible: false,
            priceLineVisible: false,
            title: '',
            visible: true,
        } as PositionArrowSeriesOptions;
    }
}
