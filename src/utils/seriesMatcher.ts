import type { ParsedFileContent } from "./zipParser";

export interface SeriesConfig {
    type: "Candlestick" | "Line";
    data: any[];
    pane: number; // 0 for main, 1+ for extra panes
    options?: any;
    name?: string;
}

export interface ChartConfig {
    id: string;
    series: SeriesConfig[];
}

/**
 * Matches data columns to series configurations.
 * Rules:
 * - OHLCV data -> Candlestick (Main Pane 0)
 * - sma* -> Line (Main Pane 0)
 * - bbands* -> Line (Main Pane 0)
 * - rsi* -> Line (Pane 1)
 */
export function matchColumnsToSeries(file: ParsedFileContent): SeriesConfig[] {
    if (!Array.isArray(file.data) || file.data.length === 0) return [];

    if (!Array.isArray(file.data) || file.data.length === 0) return [];


    const seriesConfigs: SeriesConfig[] = [];
    const firstRow = file.data[0];
    const keys = Object.keys(firstRow);

    // 1. Check for OHLCV (Main Chart)
    const hasOHLCV =
        "open" in firstRow &&
        "high" in firstRow &&
        "low" in firstRow &&
        "close" in firstRow;

    if (hasOHLCV) {
        seriesConfigs.push({
            type: "Candlestick",
            data: file.data, // The full data is passed, LWChart should extract properties or we map it here? 
            // LWChart usually expects {time, open, high, low, close}. 
            // If data has extra props it's usually fine for LWChart but for performance might be better to map.
            // For now we pass reference to avoid copying.
            pane: 0,
            options: {
                upColor: "#26a69a",
                downColor: "#ef5350",
                borderVisible: false,
                wickUpColor: "#26a69a",
                wickDownColor: "#ef5350",
            },
            name: "OHLC",
        });
    }

    // 2. Indicators
    // SMA (Main Pane)
    const smaKeys = keys.filter((k) => k.startsWith("sma"));
    smaKeys.forEach((key) => {
        seriesConfigs.push({
            type: "Line",
            data: file.data.map((row: any) => ({ time: row.time, value: parseFloat(row[key]) || 0 })),
            pane: 0,
            options: { params: { title: key }, color: "#2962FF", lineWidth: 2 },
            name: key,
        });
    });

    // BBands (Main Pane)
    // Typically BBands has upper, lower, middle. We treat each as a line.
    const bbandsKeys = keys.filter((k) => k.startsWith("bbands"));
    bbandsKeys.forEach((key) => {
        let color = "#B71C1C"; // default dark red
        if (key.includes("upper")) color = "#00BFA5";
        if (key.includes("lower")) color = "#00BFA5";
        if (key.includes("middle")) color = "#FF9800";

        seriesConfigs.push({
            type: "Line",
            data: file.data.map((row: any) => ({ time: row.time, value: parseFloat(row[key]) || 0 })),
            pane: 0, // Main pane
            options: { params: { title: key }, color, lineWidth: 1 },
            name: key,
        });
    });

    // RSI (Pane 1)
    const rsiKeys = keys.filter((k) => k.startsWith("rsi"));
    rsiKeys.forEach((key) => {
        seriesConfigs.push({
            type: "Line",
            data: file.data.map((row: any) => ({ time: row.time, value: parseFloat(row[key]) || 0 })),
            pane: 1, // Separate pane
            options: { params: { title: key }, color: "#9C27B0" },
            name: key,
        });
    });

    // 3. Balance & Equity (Main Pane for Backtest Chart)
    const balanceKeys = keys.filter((k) => k === "balance" || k === "equity");
    balanceKeys.forEach((key) => {
        seriesConfigs.push({
            type: "Line",
            data: file.data.map((row: any) => ({ time: row.time, value: parseFloat(row[key]) || 0 })),
            pane: 0,
            options: {
                params: { title: key },
                color: key === "balance" ? "#2962FF" : "#FF6D00",
                lineWidth: 2
            },
            name: key,
        });
    });

    return seriesConfigs;
}
