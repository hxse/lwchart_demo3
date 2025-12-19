import type {
    CustomSeriesPricePlotValues,
    ICustomSeriesPaneRenderer,
    ICustomSeriesPaneView,
    PaneRendererCustomData,
    PriceToCoordinateConverter,
    Time,
    WhitespaceData,
    CustomSeriesOptions,
    ICustomSeriesPaneRenderer as IBaseRenderer,
} from 'lightweight-charts';

/** SL/TP/TSL 数据点定义 */
export interface SlTpData {
    time: Time;
    value: number;
    isSinglePoint?: boolean; // 是否为单点情况（同bar同方向进场+离场）
    isBreak?: boolean;       // 是否在此点断开（离场点）
}

/** 插件选项 */
export interface SlTpSeriesOptions extends CustomSeriesOptions {
    color: string;
    lineWidth: number;
    lineStyle: number; // 0=实线, 2=虚线
}

/**
 * SL/TP/TSL 专用渲染器
 */
class SlTpLineRenderer implements ICustomSeriesPaneRenderer {
    private _data: PaneRendererCustomData<Time, SlTpData> | null = null;
    private _options: SlTpSeriesOptions | null = null;

    update(data: PaneRendererCustomData<Time, SlTpData>, options: SlTpSeriesOptions): void {
        this._data = data;
        this._options = options;
    }

    draw(target: any, priceConverter: PriceToCoordinateConverter): void {
        if (!this._data || !this._options || this._data.bars.length === 0) return;

        const bars = this._data.bars;
        const barSpacing = this._data.barSpacing;
        const visibleRange = this._data.visibleRange;

        if (!visibleRange) return;

        const { from, to } = visibleRange;

        target.useMediaCoordinateSpace((scope: any) => {
            const ctx = scope.context;

            ctx.save();
            ctx.strokeStyle = this._options!.color;
            ctx.lineWidth = this._options!.lineWidth;

            // 设置虚线样式
            if (this._options!.lineStyle === 2) {
                ctx.setLineDash([4, 4]);
            } else {
                ctx.setLineDash([]);
            }

            ctx.beginPath();
            let inPath = false;

            for (let i = from; i < to; i++) {
                const bar = bars[i];
                const data = bar.originalData;

                // 无效值：跳出当前路径
                if (data.value === null || data.value === undefined || isNaN(data.value)) {
                    if (inPath) {
                        ctx.stroke();
                        ctx.beginPath();
                        inPath = false;
                    }
                    continue;
                }

                const x = bar.x;
                const y = priceConverter(data.value);
                if (y === null) continue;

                if (data.isSinglePoint) {
                    // 如果当前正在连续画线，先结束它
                    if (inPath) {
                        ctx.stroke();
                        ctx.beginPath();
                        inPath = false;
                    }

                    // 画一个 Bar 宽度的水平线
                    const xStart = x - barSpacing / 2;
                    const xEnd = x + barSpacing / 2;
                    ctx.moveTo(xStart, y);
                    ctx.lineTo(xEnd, y);
                    ctx.stroke();
                    ctx.beginPath(); // 画完单点后重置，防止影响后面
                } else {
                    // 连续线段逻辑
                    if (!inPath) {
                        ctx.moveTo(x, y);
                        inPath = true;
                    } else {
                        ctx.lineTo(x, y);
                    }

                    // 如果标记了断开（在此点离场），则在此点结束后断开
                    if (data.isBreak) {
                        ctx.stroke();
                        ctx.beginPath();
                        inPath = false;
                    }
                }
            }

            if (inPath) {
                ctx.stroke();
            }

            ctx.restore();
        });
    }
}

/**
 * SL/TP/TSL Custom Series 插件实现
 */
export class SlTpLineSeries implements ICustomSeriesPaneView<Time, SlTpData, SlTpSeriesOptions> {
    private _renderer: SlTpLineRenderer = new SlTpLineRenderer();

    renderer(): SlTpLineRenderer {
        return this._renderer;
    }

    update(data: PaneRendererCustomData<Time, SlTpData>, options: SlTpSeriesOptions): void {
        this._renderer.update(data, options);
    }

    priceValueBuilder(plotRow: SlTpData): CustomSeriesPricePlotValues {
        return [plotRow.value];
    }

    isWhitespace(data: SlTpData | WhitespaceData<Time>): data is WhitespaceData<Time> {
        return (data as SlTpData).value === undefined;
    }

    defaultOptions(): SlTpSeriesOptions {
        return {
            color: '#2962FF',
            lineWidth: 2,
            lineStyle: 0,
            lastValueVisible: false,
            priceLineVisible: false,
            title: '',
            visible: true,
        } as SlTpSeriesOptions;
    }
}
