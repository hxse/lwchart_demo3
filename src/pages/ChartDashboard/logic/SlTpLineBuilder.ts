/**
 * SL/TP/TSL 价格线构建器
 * 负责从 backtest_result 数据生成 Stop Loss / Take Profit / Trailing Stop Loss 价格线
 */

import type { SeriesConfig } from "../../../utils/chartTypes";

/** SL/TP/TSL 价格线配置 */
interface SlTpLineConfig {
    field: string;       // 数据字段名
    name: string;        // 系列名称
    color: string;       // 线条颜色
    lineStyle: number;   // 线型 (0=实线, 2=虚线)
}

/** 预定义的 SL/TP/TSL 线配置 */
const SL_TP_LINE_CONFIGS: SlTpLineConfig[] = [
    { field: 'sl_pct_price', name: 'SL%', color: '#ff4444', lineStyle: 0 },      // 实线红色
    { field: 'tp_pct_price', name: 'TP%', color: '#44ff44', lineStyle: 0 },      // 实线绿色
    { field: 'tsl_pct_price', name: 'TSL%', color: '#4444ff', lineStyle: 2 },    // 虚线蓝色
    { field: 'sl_atr_price', name: 'SL-ATR', color: '#ff8844', lineStyle: 0 },   // 实线橙红
    { field: 'tp_atr_price', name: 'TP-ATR', color: '#44ff88', lineStyle: 0 },   // 实线青绿
    { field: 'tsl_atr_price', name: 'TSL-ATR', color: '#8844ff', lineStyle: 2 }, // 虚线紫色
];

/**
 * 将连续的有效数据点拆分为多个片段（遇到 null/NaN 断开）
 * @param data 原始数据数组
 * @param field 字段名
 * @returns 片段数组，每个片段是连续有效的数据点
 */
function splitIntoSegments(data: any[], field: string): { time: any; value: number }[][] {
    const segments: { time: any; value: number }[][] = [];
    let currentSegment: { time: any; value: number }[] = [];
    let nullEncountered = 0;
    const segmentStarts: number[] = [];

    data.forEach((row: any, idx: number) => {
        const val = row[field];
        const isValid = val !== null && val !== undefined && !isNaN(Number(val));

        if (isValid) {
            // 开始新片段
            if (currentSegment.length === 0) {
                segmentStarts.push(idx);
            }
            currentSegment.push({
                time: row.time,
                value: Number(val)
            });
        } else {
            // 遇到null，保存当前片段
            nullEncountered++;
            if (currentSegment.length > 0) {
                segments.push([...currentSegment]);
                currentSegment = [];
            }
        }
    });

    // 保存最后一个片段
    if (currentSegment.length > 0) {
        segments.push(currentSegment);
    }

    console.log(`[SL/TP/TSL] ${field} - null值: ${nullEncountered}, 片段数: ${segments.length}`);
    if (segments.length > 0) {
        segments.forEach((seg, i) => {
            console.log(`  片段${i}: ${seg.length}点, 起始索引${segmentStarts[i] || '?'}`);
        });
    }

    return segments;
}

/**
 * 从 backtest 数据构建 SL/TP/TSL 价格线系列
 * @param backtestData backtest_result 文件的数据数组
 * @param paneIdx 所属 Pane 索引
 * @returns 价格线系列数组
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

        // 拆分成多个连续片段
        const segments = splitIntoSegments(backtestData, lineConfig.field);

        // 为每个片段创建独立系列
        segments.forEach((segmentData, segIdx) => {
            if (segmentData.length > 0) {
                result.push({
                    type: 'Line',
                    data: segmentData,
                    pane: paneIdx,
                    options: {
                        color: lineConfig.color,
                        lineWidth: 2,  // 加粗线条
                        lineStyle: lineConfig.lineStyle,
                        lastValueVisible: false,
                        priceLineVisible: false,
                    },
                    name: segments.length > 1 ? `${lineConfig.name}_${segIdx}` : lineConfig.name
                });
            }
        });
    });

    return result;
}
