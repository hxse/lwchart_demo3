/**
 * 图表配色及样式统一配置文件
 */

/** 多头配色 */
export const LONG_COLORS = {
    arrow: '#ffca1cff',     // 仓位箭头
    tp: '#ffca1c',          // Take Profit
    sl: '#f09712ff',          // Stop Loss (深一些)
    tsl: '#B8860B',         // Trailing Stop Loss
    tslPsar: '#9B30FF',     // TSL PSAR
    text: '#755a00ff',        // 文字颜色
};

/** 空头配色 */
export const SHORT_COLORS = {
    arrow: '#30c0ecff',     // 仓位箭头
    tp: '#30c0ec',          // Take Profit
    sl: '#006bc2ff',          // Stop Loss (深一些)
    tsl: '#008B8B',         // Trailing Stop Loss
    tslPsar: '#00CED1',     // TSL PSAR
    text: '#006888ff',        // 文字颜色
};

/** 样式及文字配置 */
export const CHART_STYLE_CONFIG = {
    // 仓位箭头
    arrowSize: 8,
    fontSize: 13,
    showBorder: false,
    borderColor: '#FFFFFF',
    borderWidth: 1.5,
    showShadow: true,
    shadowColor: 'rgba(0, 0, 0, 0.5)',
    shadowBlur: 4,
    shadowOffsetX: 0,
    shadowOffsetY: 1,
    showTextShadow: false,

    // SL/TP/TSL 连线
    lineWidth: 2.5,
    slLineStyle: 0,   // Solid
    tpLineStyle: 0,   // Solid
    tslLineStyle: 2,  // Dashed
};
