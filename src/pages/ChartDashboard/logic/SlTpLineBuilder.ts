/**
 * SL/TP/TSL 专用数据构建器
 * 适配 SlTpLineSeries 插件
 */

import type { SeriesConfig } from "../../../utils/chartTypes";
import type { SlTpData } from "../../../components/lw-chart/plugins/SlTpLineSeries";

/** 预定义的 SL/TP/TSL 线配置 */
const SL_TP_LINE_CONFIGS = [
    { field: 'sl_pct_price_long', name: 'SL%多', color: '#ff4444', lineStyle: 0, isLong: true },
    { field: 'tp_atr_price_long', name: 'TP-ATR多', color: '#ff8800', lineStyle: 0, isLong: true },
    { field: 'tsl_atr_price_long', name: 'TSL-ATR多', color: '#B8860B', lineStyle: 2, isLong: true },

    { field: 'sl_pct_price_short', name: 'SL%空', color: '#9944ff', lineStyle: 0, isLong: false },
    { field: 'tp_atr_price_short', name: 'TP-ATR空', color: '#4488ff', lineStyle: 0, isLong: false },
    { field: 'tsl_atr_price_short', name: 'TSL-ATR空', color: '#008B8B', lineStyle: 2, isLong: false },
];

/**
 * 辅助：检查是否为有效数字
 */
function isValidNumber(val: any): boolean {
    return val !== null && val !== undefined && !isNaN(Number(val));
}

/**
 * 将回测数据转换为 SlTpLineSeries 格式
 * 
 * 单点检测逻辑：
 * - 连续情况：当前bar有进场+离场，且上一根有进场但无离场（正在持仓中）
 * - 单点情况：当前bar有进场+离场，且不满足连续条件（上一根无进场或已离场）
 * - break：价格无有效值
 */
function buildSlTpData(
    data: any[],
    field: string,
    isLong: boolean
): SlTpData[] | null {
    let hasValidData = false;
    const result: SlTpData[] = [];

    const entryField = isLong ? 'entry_long_price' : 'entry_short_price';
    const exitField = isLong ? 'exit_long_price' : 'exit_short_price';

    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const val = row[field];

        // 无有效值 = break，跳过（渲染器自动断开）
        if (!isValidNumber(val)) {
            continue;
        }

        hasValidData = true;

        // 当前 bar 的进出场情况
        const hasEntry = isValidNumber(row[entryField]);
        const hasExit = isValidNumber(row[exitField]);

        // 默认不是单点，也不是断点
        let isSinglePoint = false;
        let isBreak = false;

        // 只有同时有进场和离场时才需要判断单点
        if (hasEntry && hasExit) {
            // 检查上一根 bar 的情况
            if (i > 0) {
                const prevRow = data[i - 1];
                const prevHasEntry = isValidNumber(prevRow[entryField]);
                const prevHasExit = isValidNumber(prevRow[exitField]);

                // 连续情况：上一根有进场且无离场（正在持仓中）
                // 单点情况：上一根无进场，或者上一根已离场
                if (prevHasEntry && !prevHasExit) {
                    // 连续线段的最后一根，不是单点
                    isSinglePoint = false;
                } else {
                    // 真正的单点
                    isSinglePoint = true;
                }
            } else {
                // 第一根 bar 就有进出场，是单点
                isSinglePoint = true;
            }
        }

        // 如果当前 bar 有离场，标记为断点
        if (hasExit) {
            isBreak = true;
        }

        result.push({
            time: row.time,
            value: Number(val),
            isSinglePoint: isSinglePoint,
            isBreak: isBreak
        });
    }

    return hasValidData ? result : null;
}

/**
 * 从 backtest 数据构建 SL/TP/TSL 价格线系列
 * 
 * @param backtestData backtest_result 数据数组
 * @param paneIdx 所属 Pane 索引
 * @returns 价格线系列配置
 */
export function buildSlTpLines(
    backtestData: any[],
    paneIdx: number
): SeriesConfig[] {
    const result: SeriesConfig[] = [];

    if (!backtestData || backtestData.length === 0) {
        return result;
    }

    SL_TP_LINE_CONFIGS.forEach(lineConfig => {
        // 检查字段是否存在
        if (!(lineConfig.field in backtestData[0])) {
            return;
        }

        // 使用 SlTpLine 自定义系列
        const lineData = buildSlTpData(backtestData, lineConfig.field, lineConfig.isLong);

        if (lineData) {
            result.push({
                type: 'SlTpLine',
                data: lineData,
                pane: paneIdx,
                options: {
                    color: lineConfig.color,
                    lineWidth: 2,
                    lineStyle: lineConfig.lineStyle,
                },
                name: lineConfig.name
            });
        }
    });

    return result;
}
