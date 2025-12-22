import type { SeriesConfig } from "../../../utils/chartTypes";
import type { PositionArrowData } from "../../../components/lw-chart/plugins/PositionArrowSeries";

/**
 * 从 backtest 数据构建仓位箭头标记系列
 * 
 * @param backtestData backtest_result 数据数组
 * @param paneIdx 所属 Pane 索引
 * @returns 仓位标记系列配置
 */
export function buildPositionArrowSeries(
    backtestData: any[],
    paneIdx: number
): SeriesConfig | null {
    if (!backtestData || backtestData.length === 0) return null;

    const arrowData: PositionArrowData[] = [];

    // 状态追踪变量
    let prevLongEntry: number | null = null;
    let prevLongExit: number | null = null;
    let prevShortEntry: number | null = null;
    let prevShortExit: number | null = null;

    for (let i = 0; i < backtestData.length; i++) {
        const row = backtestData[i];
        const time = row.time;

        const entryLong = row.entry_long_price;
        const exitLong = row.exit_long_price;
        const entryShort = row.entry_short_price;
        const exitShort = row.exit_short_price;

        // === 处理多头进场 ===
        if (entryLong !== null && entryLong !== undefined && !isNaN(Number(entryLong))) {
            let shouldShow = false;
            if (prevLongExit !== null || prevLongEntry === null) shouldShow = true;

            if (shouldShow) {
                arrowData.push({
                    time: time,
                    value: Number(entryLong),
                    direction: 'entry',
                    isLong: true,
                    text: Number(entryLong).toFixed(2)
                });
            }
            prevLongEntry = Number(entryLong);
            prevLongExit = null;
        }

        // === 处理多头离场 ===
        if (exitLong !== null && exitLong !== undefined && !isNaN(Number(exitLong))) {
            arrowData.push({
                time: time,
                value: Number(exitLong),
                direction: 'exit',
                isLong: true,
                text: Number(exitLong).toFixed(2)
            });
            prevLongExit = Number(exitLong);
        }

        // === 处理空头进场 ===
        if (entryShort !== null && entryShort !== undefined && !isNaN(Number(entryShort))) {
            let shouldShow = false;
            if (prevShortExit !== null || prevShortEntry === null) shouldShow = true;

            if (shouldShow) {
                arrowData.push({
                    time: time,
                    value: Number(entryShort),
                    direction: 'entry',
                    isLong: false,
                    text: Number(entryShort).toFixed(2)
                });
            }
            prevShortEntry = Number(entryShort);
            prevShortExit = null;
        }

        // === 处理空头离场 ===
        if (exitShort !== null && exitShort !== undefined && !isNaN(Number(exitShort))) {
            arrowData.push({
                time: time,
                value: Number(exitShort),
                direction: 'exit',
                isLong: false,
                text: Number(exitShort).toFixed(2)
            });
            prevShortExit = Number(exitShort);
        }
    }

    if (arrowData.length === 0) return null;

    return {
        type: 'PositionArrow',
        data: arrowData,
        pane: paneIdx,
        options: {
            arrowSize: 8,
            colorLong: '#ffa42dff', // 亮橘色 (红黄)
            colorShort: '#18c8fdff', // 极亮青色
            fontSize: 12,
        },
        name: 'Position Markers',
        showInLegend: false
    };
}
