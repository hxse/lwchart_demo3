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
export interface PositionArrowPoint {
    value: number;        // 价格
    direction: 'entry' | 'exit';
    isLong: boolean;
    text?: string;        // 显示的价格文字
}

export interface PositionArrowData {
    time: Time;
    points: PositionArrowPoint[];
    high?: number; // 当前 K 线的最高价
    low?: number;  // 当前 K 线的最低价
}

/** 插件选项 */
export interface PositionArrowSeriesOptions extends CustomSeriesOptions {
    arrowSize: number;
    colorLong: string;
    colorShort: string;
    textColorLong: string;
    textColorShort: string;
    fontSize: number;
    showTextShadow: boolean;
    showBorder: boolean;
    borderColor: string;
    borderWidth: number;
    showShadow: boolean;
    shadowColor: string;
    shadowBlur: number;
    shadowOffsetX: number;
    shadowOffsetY: number;
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
        const {
            arrowSize, colorLong, colorShort, textColorLong, textColorShort, fontSize,
            showBorder, borderColor, borderWidth,
            showShadow, shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY,
            showTextShadow
        } = this._options;

        target.useMediaCoordinateSpace((scope: any) => {
            const ctx = scope.context;
            ctx.save();
            ctx.font = `${fontSize}px Arial`;
            ctx.textAlign = 'center';

            // 设置阴影
            if (showShadow) {
                ctx.shadowColor = shadowColor;
                ctx.shadowBlur = shadowBlur;
                ctx.shadowOffsetX = shadowOffsetX;
                ctx.shadowOffsetY = shadowOffsetY;
            }

            for (let i = from; i < to; i++) {
                const bar = bars[i];
                const data = bar.originalData;

                if (!data.points || data.points.length === 0) continue;

                const high = data.high;
                const low = data.low;

                for (const point of data.points) {
                    const val = point.value;
                    if (val === null || val === undefined || isNaN(val)) continue;

                    const x = bar.x;
                    const y = priceConverter(val);
                    if (y === null) continue;

                    const color = point.isLong ? colorLong : colorShort;
                    ctx.fillStyle = color;

                    // 绘制箭头
                    this._drawArrow(ctx, x, y, point.direction, arrowSize);

                    ctx.fill();

                    // 绘制边框
                    if (showBorder) {
                        ctx.strokeStyle = borderColor;
                        ctx.lineWidth = borderWidth;
                        ctx.stroke();
                    }

                    // 绘制文字
                    if (point.text) {
                        ctx.save();
                        if (!showTextShadow) {
                            ctx.shadowBlur = 0;
                            ctx.shadowOffsetX = 0;
                            ctx.shadowOffsetY = 0;
                        }
                        const textColor = point.isLong ? textColorLong : textColorShort;
                        const padding = 2;

                        // 动态调整文字位置逻辑：
                        let showAtBottom = true;
                        if (high !== undefined && low !== undefined) {
                            if (val < low) {
                                showAtBottom = true;
                            } else if (val > high) {
                                showAtBottom = false;
                            } else {
                                // 在 low 和 high 中间：离谁近放哪边
                                const distToHigh = high - val;
                                const distToLow = val - low;
                                showAtBottom = distToHigh > distToLow; // 离 high 远（离 low 近）放下方
                            }
                        } else {
                            // 回退逻辑：如果是多头箭头放下方，空头放上方
                            showAtBottom = point.isLong;
                        }

                        const textY = showAtBottom
                            ? y + arrowSize + fontSize + padding  // 放在下方
                            : y - arrowSize - padding;             // 放在上方

                        ctx.fillStyle = textColor;
                        ctx.fillText(point.text, x, textY);
                        ctx.restore();
                    }
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
        if (plotRow.points && plotRow.points.length > 0) {
            return [plotRow.points[0].value];
        }
        return [NaN];
    }

    isWhitespace(data: PositionArrowData | WhitespaceData<Time>): data is WhitespaceData<Time> {
        return (data as PositionArrowData).points === undefined || (data as PositionArrowData).points.length === 0;
    }

    defaultOptions(): PositionArrowSeriesOptions {
        return {
            arrowSize: 8,
            colorLong: '#FF8A00',
            colorShort: '#00E5FF',
            textColorLong: '#FF8A00',
            textColorShort: '#00E5FF',
            fontSize: 12,
            showTextShadow: false,
            lastValueVisible: false,
            priceLineVisible: false,
            title: '',
            visible: true,
            showBorder: true,
            borderColor: '#FFFFFF',
            borderWidth: 1,
            showShadow: true,
            shadowColor: 'rgba(0, 0, 0, 0.5)',
            shadowBlur: 4,
            shadowOffsetX: 0,
            shadowOffsetY: 2,
        } as PositionArrowSeriesOptions;
    }
}
