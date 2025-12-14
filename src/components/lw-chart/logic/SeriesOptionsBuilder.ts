/**
 * 系列选项构建器
 * 负责根据配置构建各种类型系列的选项对象
 */

import type {
    SeriesItemConfig,
    CandleOption,
    LineOption,
    HistogramOption,
    VolumeOption,
    AreaOption,
    BaselineOption,
    BarOption
} from "../../../pages/ChartDashboard/chartDashboard.types";

/** 默认顶部边距 */
export const DEFAULT_SCALE_MARGIN_TOP = 0.02;

/** 默认底部边距 */
export const DEFAULT_SCALE_MARGIN_BOTTOM = 0.02;

/**
 * 应用默认刻度边距到选项对象
 * @param options 原始选项对象
 * @param top 顶部边距 (0-1)
 * @param bottom 底部边距 (0-1)
 * @returns 包含刻度边距的新选项对象
 */
export function applyDefaultScaleMargins(
    options: any,
    top: number = DEFAULT_SCALE_MARGIN_TOP,
    bottom: number = DEFAULT_SCALE_MARGIN_BOTTOM
): any {
    return {
        ...options,
        scaleMargins: {
            top,
            bottom
        }
    };
}

/**
 * 根据系列配置获取对应类型的选项
 * @param config 系列配置项
 * @returns 构建好的选项对象
 */
export function getOptionsForType(config: SeriesItemConfig): any {
    // 蜡烛图和柱状图的默认值
    const DEFAULT_CANDLE_OPTIONS: CandleOption = {
        upColor: "#26a69a",
        downColor: "#ef5350",
        wickUpColor: "#26a69a",
        wickDownColor: "#ef5350",
        borderVisible: false,
    };

    switch (config.type) {
        case 'candle':
            return { ...DEFAULT_CANDLE_OPTIONS, ...config.candleOpt };

        case 'bar':
            return { ...DEFAULT_CANDLE_OPTIONS, ...config.barOpt };

        case 'line':
            return {
                lineWidth: 1.5,  // 线条粗细，默认1.5
                ...config.lineOpt
            };

        case 'histogram':
            return config.histogramOpt || {};

        case 'volume':
            // Volume默认配置（自动应用）
            const volumeOpt = config.volumeOpt || {};
            const marginTop = volumeOpt.priceScaleMarginTop || 0.7;

            return {
                priceFormat: { type: 'volume' },
                priceScaleId: '',
                scaleMargins: {
                    top: marginTop,
                    bottom: 0
                },
                ...volumeOpt
            };

        case 'area':
            return config.areaOpt || {};

        case 'baseline':
            return config.baselineOpt || {};

        default:
            return {};
    }
}
