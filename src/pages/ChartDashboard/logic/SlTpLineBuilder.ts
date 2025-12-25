/**
 * SL/TP/TSL 专用数据构建器
 * 适配 SlTpLineSeries 插件
 */

import type { SeriesConfig } from "../../../utils/chartTypes";
import type { SlTpData } from "../../../components/lw-chart/plugins/SlTpLineSeries";
import { LONG_COLORS, SHORT_COLORS, CHART_STYLE_CONFIG } from "../../../utils/colorConfig";

/** 预定义的 SL/TP/TSL 线配置 */
const SL_TP_LINE_CONFIGS = [
    // Long
    { field: 'sl_pct_price_long', name: 'L-SL-PCT', color: LONG_COLORS.sl, lineStyle: CHART_STYLE_CONFIG.slLineStyle, isLong: true },
    { field: 'sl_atr_price_long', name: 'L-SL-ATR', color: LONG_COLORS.sl, lineStyle: CHART_STYLE_CONFIG.slLineStyle, isLong: true },

    { field: 'tp_pct_price_long', name: 'L-TP-PCT', color: LONG_COLORS.tp, lineStyle: CHART_STYLE_CONFIG.tpLineStyle, isLong: true },
    { field: 'tp_atr_price_long', name: 'L-TP-ATR', color: LONG_COLORS.tp, lineStyle: CHART_STYLE_CONFIG.tpLineStyle, isLong: true },

    { field: 'tsl_pct_price_long', name: 'L-TSL-PCT', color: LONG_COLORS.tsl, lineStyle: CHART_STYLE_CONFIG.tslLineStyle, isLong: true },
    { field: 'tsl_atr_price_long', name: 'L-TSL-ATR', color: LONG_COLORS.tsl, lineStyle: CHART_STYLE_CONFIG.tslLineStyle, isLong: true },
    { field: 'tsl_psar_price_long', name: 'L-TSL-PSAR', color: LONG_COLORS.tslPsar, lineStyle: CHART_STYLE_CONFIG.tslLineStyle, isLong: true },

    // Short
    { field: 'sl_pct_price_short', name: 'S-SL-PCT', color: SHORT_COLORS.sl, lineStyle: CHART_STYLE_CONFIG.slLineStyle, isLong: false },
    { field: 'sl_atr_price_short', name: 'S-SL-ATR', color: SHORT_COLORS.sl, lineStyle: CHART_STYLE_CONFIG.slLineStyle, isLong: false },

    { field: 'tp_pct_price_short', name: 'S-TP-PCT', color: SHORT_COLORS.tp, lineStyle: CHART_STYLE_CONFIG.tpLineStyle, isLong: false },
    { field: 'tp_atr_price_short', name: 'S-TP-ATR', color: SHORT_COLORS.tp, lineStyle: CHART_STYLE_CONFIG.tpLineStyle, isLong: false },

    { field: 'tsl_pct_price_short', name: 'S-TSL-PCT', color: SHORT_COLORS.tsl, lineStyle: CHART_STYLE_CONFIG.tslLineStyle, isLong: false },
    { field: 'tsl_atr_price_short', name: 'S-TSL-ATR', color: SHORT_COLORS.tsl, lineStyle: CHART_STYLE_CONFIG.tslLineStyle, isLong: false },
    { field: 'tsl_psar_price_short', name: 'S-TSL-PSAR', color: SHORT_COLORS.tslPsar, lineStyle: CHART_STYLE_CONFIG.tslLineStyle, isLong: false },
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
        const firstEntrySide = row.first_entry_side;
        const hasExit = isValidNumber(row[exitField]);

        // 判定 logic 优化：
        // 1. isSinglePoint: 如果当前是“第一次进场”且同时有“离场价格”，则为同 Bar 闪进闪出。
        // 2. isBreak: 只要有离场价格，当前 Bar 结束后线段必须断开。
        const isSinglePoint = (isLong ? firstEntrySide === 1 : firstEntrySide === -1) && hasExit;
        const isBreak = hasExit;

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
 * @param showRiskLegend 风险线 Legend 显示控制 [sl, tp, tsl, psar]
 * @returns 价格线系列配置
 */
export function buildSlTpLines(
    backtestData: any[],
    paneIdx: number,
    showRiskLegend?: [boolean, boolean, boolean, boolean]
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
            // 默认全部显示 legend
            const legendFlags = showRiskLegend ?? [true, true, true, true];
            let showInLegend = true;

            // 判定逻辑：先判定最具体的 psar，再判定 tsl（因为 tsl 包含 sl）
            if (lineConfig.field.includes('tsl_psar_')) {
                showInLegend = legendFlags[3];
            } else if (lineConfig.field.includes('tsl_')) {
                showInLegend = legendFlags[2];
            } else if (lineConfig.field.includes('sl_')) {
                showInLegend = legendFlags[0];
            } else if (lineConfig.field.includes('tp_')) {
                showInLegend = legendFlags[1];
            }

            result.push({
                type: 'SlTpLine',
                data: lineData,
                pane: paneIdx,
                options: {
                    color: lineConfig.color,
                    lineWidth: CHART_STYLE_CONFIG.lineWidth,
                    lineStyle: lineConfig.lineStyle,
                },
                name: lineConfig.name,
                showInLegend: showInLegend
            });
        }
    });

    return result;
}
