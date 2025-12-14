/**
 * 系列类型映射器
 * 负责将用户友好的类型名称转换为 LWChart 内部使用的类型
 */

export type LWChartSeriesType = "Candlestick" | "Line" | "Histogram" | "Area" | "Baseline" | "Bar" | "HLine" | "VLine";

/**
 * 将用户友好的类型名称转换为 LWChart 类型
 * @param type 用户输入的类型名称（不区分大小写）
 * @returns LWChart 内部使用的标准类型名称
 */
export function mapSeriesType(type: string): LWChartSeriesType {
    const t = type.toLowerCase();
    switch (t) {
        case "candle":
        case "candlestick":
            return "Candlestick";
        case "line":
            return "Line";
        case "bar":
            return "Bar";
        case "histogram":
            return "Histogram";
        case "volume":
            return "Histogram";  // Volume使用Histogram渲染
        case "area":
            return "Area";
        case "baseline":
            return "Baseline";
        case "hline":
            return "HLine";
        case "vline":
            return "VLine";
        default:
            return "Line";
    }
}
