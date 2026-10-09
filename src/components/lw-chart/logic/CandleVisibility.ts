import type { ISeriesApi, ITimeScaleApi, Time } from 'lightweight-charts';

/**
 * 内置蜡烛的 bitmap 右边缘（不含边缘外的像素）。
 * 几何规则对应 lightweight-charts 5.2.1 的 optimal-bar-width 与 candlesticks-renderer：
 * https://github.com/tradingview/lightweight-charts/tree/v5.2.1/src/renderers
 * SDK 没有公开实体宽度 API；此处只适配几何，绘制仍完全由内置系列负责。
 */
export function candleRightEdge(center: number, spacing: number, ratio: number): number {
    let width: number;
    if (spacing >= 2.5 && spacing <= 4) width = Math.floor(3 * ratio);
    else {
        const coefficient = 1 - 0.2 * Math.atan(Math.max(4, spacing) - 4) / (Math.PI * 0.5);
        width = Math.max(Math.floor(ratio), Math.min(Math.floor(spacing * coefficient * ratio), Math.floor(spacing * ratio)));
    }
    // 与影线保持同一奇偶宽度，影线宽度不超过实体的外轮廓。
    if (width >= 2 && width % 2 !== Math.floor(ratio) % 2) width--;
    return Math.round(center * ratio) - Math.floor(width / 2) + width;
}

export function latestCandleIsUnclipped(scale: ITimeScaleApi<Time>, series: ISeriesApi<any>, pendingShift = 0): boolean {
    const tail = series.data().at(-1);
    if (!tail) return true;
    const center = scale.timeToCoordinate(tail.time);
    const pane = series.getPane().getHTMLElement();
    // Pane 的公开 DOM 同时包含价格轴，按时间轴宽度选实际绘图区画布。
    const canvas = pane && [...pane.querySelectorAll('canvas')].find(node => node.clientWidth === scale.width() && node.clientHeight > 0);
    if (center === null || !canvas || !canvas.width) return false;
    const ratio = canvas.width / canvas.clientWidth;
    return candleRightEdge(center + pendingShift, scale.options().barSpacing, ratio) <= canvas.width;
}
