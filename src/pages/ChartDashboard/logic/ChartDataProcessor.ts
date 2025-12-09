import { parseZipFile, type ParsedFileContent } from "../../../utils/zipParser";
import { parseChartData } from "../../../utils/chartDataHelper";
import { matchColumnsToSeries, type SeriesConfig } from "../../../utils/seriesMatcher";
import type { GridItem } from "../chartDashboard.types";
import LWChart from "../../../components/lw-chart/LWChart.svelte";
import { GridTemplateType } from "../../../components/grid-template/gridTemplates";

export interface ProcessedDataResult {
    internalFiles: ParsedFileContent[];
    baseChartItems: GridItem[];
    backtestSeriesConfig: SeriesConfig[];
    bottomRowData: ParsedFileContent | null;
    recommendedTemplate: string | null;
}

export class ChartDataProcessor {
    static async processZipBlob(
        blob: Blob,
        syncCallbacks: {
            onRegister: (id: string, api: any) => void;
            onSync: (id: string, param: any) => void;
        }
    ): Promise<ProcessedDataResult> {
        const startTime = performance.now();

        const result = await parseZipFile(blob);
        if (result.error) throw new Error(result.error);
        const rawFiles = result.files;

        // Try to find and parse param_set/param_set.json or param_set.json
        let rsiThresholds: { upper?: number, lower?: number, center?: number } | undefined;
        const paramSetFile = rawFiles.find(f =>
            f.filename.endsWith("param_set.json") || f.filename.endsWith("param_set/param_set.json")
        );

        if (paramSetFile) {
            try {
                let paramData: any = paramSetFile.data;
                // If data is string (text/json type that wasn't parsed as object yet), parse it
                if (typeof paramData === 'string') {
                    paramData = JSON.parse(paramData);
                }

                // paramData is expected to be an array based on user description: [{ "signal": { ... } }]
                if (Array.isArray(paramData) && paramData.length > 0) {
                    const signal = paramData[0]?.signal;
                    if (signal) {
                        const parseVal = (val: any): number | undefined => {
                            if (val === undefined || val === null) return undefined;
                            if (typeof val === 'number') return val;
                            if (typeof val === 'string') {
                                const num = parseFloat(val);
                                return isNaN(num) ? undefined : num;
                            }
                            if (typeof val === 'object' && val !== null && 'value' in val) {
                                return parseVal(val.value);
                            }
                            return undefined;
                        };

                        rsiThresholds = {
                            upper: parseVal(signal.rsi_upper),
                            lower: parseVal(signal.rsi_lower),
                            center: parseVal(signal.rsi_center)
                        };
                        console.log("[ChartDataProcessor] Parsed RSI Thresholds:", rsiThresholds);
                    }
                }
            } catch (e) {
                console.warn("[ChartDataProcessor] Failed to parse param_set.json:", e);
            }
        }

        const internalFiles = rawFiles.map((f) => {
            if (Array.isArray(f.data)) {
                return { ...f, data: parseChartData(f.data) };
            }
            return f;
        });

        const newBaseItems: GridItem[] = [];
        let ohlcvCount = 0;

        // Helper to get matching indicator file
        const getIndicatorFile = (sourceFilename: string) => {
            // Extract the filename part (ignoring directory)
            const sourceBase = sourceFilename.split('/').pop() || sourceFilename;

            // Expect format: source_ohlcv_15m.csv -> ohlcv_15m.csv
            const coreName = sourceBase.replace("source_", "");

            // Look for indicators_ohlcv_15m.csv anywhere
            const targetBase = `indicators_${coreName}`;

            return internalFiles.find(f => {
                const fBase = f.filename.split('/').pop() || f.filename;
                return fBase === targetBase;
            });
        };

        internalFiles.forEach((file) => {
            // Only process source OHLCV files as main charts
            // We skip "indicators_" files here as they are merged into source
            if (file.filename.includes("indicators_") && !file.filename.includes("source_")) return;
            if (file.filename.includes("backtest_result.csv") || file.filename.includes("backtest_result.parquet")) return;
            // Also skip param_set files or non-data files if needed, but matchColumns will just return empty for them

            let dataToMatch = file.data;

            // If this is a source_ohlcv file, try to find and merge indicators
            if (file.filename.includes("source_") && file.filename.includes("ohlcv")) {
                const indicatorFile = getIndicatorFile(file.filename);
                if (indicatorFile) {
                    if (Array.isArray(indicatorFile.data)) {
                        // Convert indicator data to a Map for O(1) lookup by time
                        const indicatorMap = new Map();
                        let firstIndicatorTime: any = null;
                        let indicatorKeys: string[] = [];

                        indicatorFile.data.forEach((row: any) => {
                            if (indicatorKeys.length === 0 && row) {
                                indicatorKeys = Object.keys(row).filter(k => k !== 'time');
                            }
                            if (row.time !== undefined && row.time !== null) {
                                indicatorMap.set(row.time, row);
                                if (firstIndicatorTime === null) firstIndicatorTime = row.time;
                            }
                        });

                        const defaultIndicatorData: any = {};
                        indicatorKeys.forEach(k => defaultIndicatorData[k] = null);

                        let matchCount = 0;
                        dataToMatch = file.data.map((row: any) => {
                            const indicatorRow = indicatorMap.get(row.time);

                            if (indicatorRow) {
                                matchCount++;
                                const { time: _, ...indicatorData } = indicatorRow;
                                return { ...row, ...indicatorData };
                            }

                            return { ...row, ...defaultIndicatorData };
                        });
                    }
                }
            }

            const tempFile = { ...file, data: dataToMatch };
            const seriesConfigs = matchColumnsToSeries(tempFile, rsiThresholds);

            if (seriesConfigs.length > 0) {
                ohlcvCount++;
                const chartId = `chart-${file.filename}-${newBaseItems.length}`;
                newBaseItems.push({
                    id: chartId,
                    component: LWChart,
                    props: {
                        series: seriesConfigs,
                        fitContent: true,
                        onRegister: (api: any) => syncCallbacks.onRegister(chartId, api),
                        onCrosshairMove: (p: any) => syncCallbacks.onSync(chartId, p),
                    },
                });
            }
        });

        let backtestSeriesConfig: SeriesConfig[] = [];
        let bottomRowData: ParsedFileContent | null = null;

        const backtestFile = internalFiles.find(
            (f) =>
                f.filename.includes("backtest_result.csv") ||
                f.filename.includes("backtest_result.parquet"),
        );

        if (backtestFile) {
            bottomRowData = backtestFile;
            backtestSeriesConfig = matchColumnsToSeries(backtestFile, rsiThresholds);
        }

        // Template Auto-adapt
        let recommendedTemplate: string | null = null;
        if (ohlcvCount === 1) recommendedTemplate = GridTemplateType.HORIZONTAL_1x1;
        else if (ohlcvCount === 2 || ohlcvCount === 3) recommendedTemplate = GridTemplateType.VERTICAL_1x2;
        else if (ohlcvCount >= 4) recommendedTemplate = GridTemplateType.GRID_2x2;

        const backtestRows = backtestFile && Array.isArray(backtestFile.data) ? backtestFile.data.length : 0;
        console.log(`[Performance] Total ZIP processing: ${(performance.now() - startTime).toFixed(2)}ms (${internalFiles.length} files, ${backtestRows} backtest data rows)`);

        return {
            internalFiles,
            baseChartItems: newBaseItems,
            backtestSeriesConfig,
            bottomRowData,
            recommendedTemplate
        };
    }
}
