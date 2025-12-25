import type { SeriesConfig } from "../../../utils/chartTypes";
import type { PositionArrowData, PositionArrowPoint } from "../../../components/lw-chart/plugins/PositionArrowSeries";
import { LONG_COLORS, SHORT_COLORS, CHART_STYLE_CONFIG } from "../../../utils/colorConfig";

/**
 * 从 backtest 数据构建仓位箭头标记系列
 * 
 * @param backtestData backtest_result 数据数组
 * @param paneIdx 所属 Pane 索引
 * @returns 仓位标记系列配置
 */
export function buildPositionArrowSeries(
    backtestData: any[],
    paneIdx: number,
    ohlcData?: any[]
): SeriesConfig | null {
    if (!backtestData || backtestData.length === 0) return null;

    const arrowData: PositionArrowData[] = [];

    for (let i = 0; i < backtestData.length; i++) {
        const row = backtestData[i];
        const time = row.time;

        const entryLong = row.entry_long_price;
        const exitLong = row.exit_long_price;
        const entryShort = row.entry_short_price;
        const exitShort = row.exit_short_price;
        const firstEntrySide = row.first_entry_side;

        const points: PositionArrowPoint[] = [];

        // === 获取 K 线范围 (High/Low) ===
        let high = Number(row.high);
        let low = Number(row.low);

        if ((isNaN(high) || isNaN(low)) && ohlcData) {
            const ohlcRow = ohlcData.find(d => d.time === time);
            if (ohlcRow) {
                high = Number(ohlcRow.high);
                low = Number(ohlcRow.low);
            }
        }

        // === 处理多头进场 ===
        if (firstEntrySide === 1 && entryLong !== null && entryLong !== undefined && !isNaN(Number(entryLong))) {
            points.push({
                value: Number(entryLong),
                direction: 'entry',
                isLong: true,
                text: Number(entryLong).toFixed(2)
            });
        }

        // === 处理多头离场 ===
        if (exitLong !== null && exitLong !== undefined && !isNaN(Number(exitLong))) {
            points.push({
                value: Number(exitLong),
                direction: 'exit',
                isLong: true,
                text: Number(exitLong).toFixed(2)
            });
        }

        // === 处理空头进场 ===
        if (firstEntrySide === -1 && entryShort !== null && entryShort !== undefined && !isNaN(Number(entryShort))) {
            points.push({
                value: Number(entryShort),
                direction: 'entry',
                isLong: false,
                text: Number(entryShort).toFixed(2)
            });
        }

        // === 处理空头离场 ===
        if (exitShort !== null && exitShort !== undefined && !isNaN(Number(exitShort))) {
            points.push({
                value: Number(exitShort),
                direction: 'exit',
                isLong: false,
                text: Number(exitShort).toFixed(2)
            });
        }

        if (points.length > 0) {
            arrowData.push({
                time: time,
                points: points,
                high: !isNaN(high) ? high : undefined,
                low: !isNaN(low) ? low : undefined
            });
        }
    }

    if (arrowData.length === 0) return null;

    return {
        type: 'PositionArrow',
        data: arrowData,
        pane: paneIdx,
        options: {
            ...CHART_STYLE_CONFIG,
            colorLong: LONG_COLORS.arrow,
            colorShort: SHORT_COLORS.arrow,
            textColorLong: LONG_COLORS.text,
            textColorShort: SHORT_COLORS.text,
            showTextShadow: CHART_STYLE_CONFIG.showTextShadow,
        },

        name: 'Position Markers',
        showInLegend: false
    };
}
