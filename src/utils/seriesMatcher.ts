import type { ParsedFileContent } from "./zipParser";

export interface SeriesConfig {
    type: "Candlestick" | "Line";
    data: any[];
    pane: number; // 0 for main, 1+ for extra panes
    options?: any;
    name?: string;
    priceLines?: any[];
}

export interface ChartConfig {
    id: string;
    series: SeriesConfig[];
}

export interface RsiThresholds {
    upper?: number;
    lower?: number;
    center?: number;
}

/**
 * Matches data columns to series configurations.
 * Rules:
 * - OHLCV data -> Candlestick (Main Pane 0)
 * - sma* -> Line (Main Pane 0)
 * - bbands* -> Line (Main Pane 0)
 * - rsi* -> Line (Pane 1)
 */
export function matchColumnsToSeries(file: ParsedFileContent, rsiThresholds?: RsiThresholds): SeriesConfig[] {
    if (!Array.isArray(file.data) || file.data.length === 0) return [];


    const seriesConfigs: SeriesConfig[] = [];

    // User requested to scan only the first row.
    // This assumes data merging ensures all keys are present in row 0 (as nulls if needed).
    const firstRow = file.data[0] || {};
    const keys = Object.keys(firstRow);
    const keysSet = new Set(keys);

    // 1. Check for OHLCV (Main Chart)
    const hasOHLCV =
        keysSet.has("open") &&
        keysSet.has("high") &&
        keysSet.has("low") &&
        keysSet.has("close");

    if (hasOHLCV) {
        seriesConfigs.push({
            type: "Candlestick",
            data: file.data,
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
    // Helper to match keys case-insensitively
    const getKeys = (prefix: string) => keys.filter((k) => k.toLowerCase().startsWith(prefix));

    // Helper to create clean line data (filtering nulls)
    const createLineData = (key: string) => {
        return file.data
            .map((row: any) => {
                const val = row[key];
                // Strict null check: if val is null, undefined, or NaN, return null value marker
                if (val === null || val === undefined) return { time: row.time, value: null };
                const num = parseFloat(val);
                if (isNaN(num)) return { time: row.time, value: null };
                return { time: row.time, value: num };
            })
            .filter((p: any) => p.value !== null); // Filter out nulls for LWC to avoid leading-nan issues
    };

    // SMA (Main Pane)
    const smaKeys = getKeys("sma");
    smaKeys.forEach((key) => {
        seriesConfigs.push({
            type: "Line",
            data: createLineData(key),
            pane: 0,
            options: { params: { title: key }, color: "#2962FF", lineWidth: 2 },
            name: key,
        });
    });

    // BBands (Main Pane)
    const bbandsKeys = getKeys("bbands");
    bbandsKeys.forEach((key) => {
        const lowerKey = key.toLowerCase();
        if (!lowerKey.includes("upper") && !lowerKey.includes("lower") && !lowerKey.includes("middle")) {
            return;
        }

        let color = "#B71C1C"; // default dark red
        if (lowerKey.includes("upper")) color = "#00BFA5";
        if (lowerKey.includes("lower")) color = "#00BFA5";
        if (lowerKey.includes("middle")) color = "#FF9800";

        seriesConfigs.push({
            type: "Line",
            data: createLineData(key),
            pane: 0,
            options: { params: { title: key }, color, lineWidth: 1 },
            name: key,
        });
    });

    // RSI (Pane 1)
    const rsiKeys = getKeys("rsi");
    rsiKeys.forEach((key) => {
        const priceLines: any[] = [];
        if (rsiThresholds) {
            if (rsiThresholds.upper !== undefined) {
                priceLines.push({
                    price: rsiThresholds.upper,
                    color: '#FF9800', // Orange
                    lineWidth: 2,
                    lineStyle: 0, // Solid
                    axisLabelVisible: true,
                    title: 'Upper',
                });
            }
            if (rsiThresholds.lower !== undefined) {
                priceLines.push({
                    price: rsiThresholds.lower,
                    color: '#FF9800', // Orange
                    lineWidth: 2,
                    lineStyle: 0, // Solid
                    axisLabelVisible: true,
                    title: 'Lower',
                });
            }
            if (rsiThresholds.center !== undefined) {
                priceLines.push({
                    price: rsiThresholds.center,
                    color: '#FF9800', // Orange
                    lineWidth: 2,
                    lineStyle: 0, // Solid
                    axisLabelVisible: false,
                    title: 'Bsline',
                });
            }
        }

        seriesConfigs.push({
            type: "Line",
            data: createLineData(key),
            pane: 1,
            options: { params: { title: key }, color: "#9C27B0" },
            name: key,
            priceLines: priceLines.length > 0 ? priceLines : undefined
        });
    });

    // 3. Balance & Equity (Main Pane for Backtest Chart)
    const balanceKeys = keys.filter((k) => {
        const lower = k.toLowerCase();
        return lower === "balance" || lower === "equity";
    });
    balanceKeys.forEach((key) => {
        const lower = key.toLowerCase();
        seriesConfigs.push({
            type: "Line",
            data: createLineData(key),
            pane: 0,
            options: {
                params: { title: key },
                color: lower === "balance" ? "#2962FF" : "#FF6D00",
                lineWidth: 2
            },
            name: key,
        });
    });

    return seriesConfigs;
}
