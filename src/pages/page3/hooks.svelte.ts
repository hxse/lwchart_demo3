import { onMount } from "svelte";
import { GridTemplateType } from "../../components/grid-template/gridTemplates";
import { addBottomRow } from "../../components/grid-template/gridTemplatesExtended";
import type { ParsedFileContent } from "../../utils/zipParser";
import {
    downloadAndParseZip,
    fetchFileList,
    type FileItem,
} from "../../utils/fileManager";
import { parseChartData } from "../../utils/chartDataHelper";
import {
    matchColumnsToSeries,
    type SeriesConfig,
} from "../../utils/seriesMatcher";
import type { GridItem } from "./types";
import { calculateGridItems } from "./utils";
import LWChart from "../../components/lw-chart/LWChart.svelte";


export class Page3State {
    // --- State ---
    fileList: FileItem[] = $state([]);
    zipFiles: FileItem[] = $derived(
        this.fileList.filter((f) => f.filename.toLowerCase().endsWith(".zip")),
    );

    selectedZipIndex: string = $state("-1");
    internalFiles: ParsedFileContent[] = $state.raw([]);
    selectedInternalIndex: string = $state("-1");

    loading = $state(false);
    parsing = $state(false);

    // View State
    viewMode = $state<"chart" | "table">("chart");

    // Grid State
    gridItems: GridItem[] = $state.raw([]);
    baseChartItems: GridItem[] = $state.raw([]);
    backtestSeriesConfig: SeriesConfig[] = $state.raw([]);
    showBottomRow = $state(false);
    selectedTemplate = $state<string>(GridTemplateType.HORIZONTAL_1x1);
    finalTemplate = $derived(
        this.showBottomRow
            ? addBottomRow(this.selectedTemplate as GridTemplateType)
            : this.selectedTemplate,
    );
    bottomRowData: ParsedFileContent | null = null;
    chartApis = new Map<string, any>(); // Store chart API references for sync

    availableTemplates = Object.values(GridTemplateType);

    constructor() {
        // --- Lifecycle ---
        onMount(async () => {
            try {
                this.fileList = await fetchFileList();
            } catch (e) {
                console.error("获取文件列表失败:", e);
            }
        });

        $effect(() => {
            this.gridItems = calculateGridItems(
                this.finalTemplate,
                this.showBottomRow,
                this.baseChartItems,
                this.backtestSeriesConfig,
                this.bottomRowData,
                {
                    onRegister: this.handleRegister,
                    onSync: this.handleSync
                }
            );
        });
    }

    // --- Handlers ---
    handleRegister = (id: string, api: any) => {
        // console.log(`[Sync] Registering chart ${id}`);
        this.chartApis.set(id, api);
    };

    handleSync = (sourceId: string, param: any) => {
        // Broadcast to all other charts
        for (const [id, api] of this.chartApis) {
            if (id !== sourceId) {
                api.setCrosshair(param);
            }
        }
    };

    handleZipSelect = async (event: Event) => {
        const select = event.target as HTMLSelectElement;
        const index = parseInt(select.value);
        this.selectedZipIndex = select.value;

        this.internalFiles = [];
        this.selectedInternalIndex = "-1";
        this.baseChartItems = [];
        this.backtestSeriesConfig = [];
        this.bottomRowData = null;
        this.gridItems = [];

        if (index === -1 || isNaN(index)) return;

        const selectedFile = this.zipFiles[index];
        if (!selectedFile) return;

        this.loading = true;
        this.parsing = true;

        try {
            console.log("🚀 [Page3State] Starting handleZipSelect...");
            const rawFiles = await downloadAndParseZip(selectedFile);
            console.log(`📂 [Page3State] Parsed ${rawFiles.length} files from ZIP.`);

            this.internalFiles = rawFiles.map((f) => {
                if (Array.isArray(f.data)) {
                    return { ...f, data: parseChartData(f.data) };
                }
                return f;
            });

            // Log all filenames to debug matching
            this.internalFiles.forEach(f => console.log(`📄 File: ${f.filename}`));

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

                console.log(`[Merge] Strategy: '${sourceFilename}' -> base '${sourceBase}' -> core '${coreName}' -> target '${targetBase}'`);

                return this.internalFiles.find(f => {
                    const fBase = f.filename.split('/').pop() || f.filename;
                    return fBase === targetBase;
                });
            };

            this.internalFiles.forEach((file) => {

                // Only process source OHLCV files as main charts
                // We skip "indicators_" files here as they are merged into source
                // Use includes to be safer than startsWith due to directories
                if (file.filename.includes("indicators_") && !file.filename.includes("source_")) return;
                if (file.filename.includes("backtest_result.csv") || file.filename.includes("backtest_result.parquet")) return;

                let dataToMatch = file.data;

                // If this is a source_ohlcv file, try to find and merge indicators
                if (file.filename.includes("source_") && file.filename.includes("ohlcv")) {
                    const indicatorFile = getIndicatorFile(file.filename);
                    if (indicatorFile) {
                        console.log(`[Merge] ✅ MATCH: ${file.filename} <== ${indicatorFile.filename}`);
                        if (Array.isArray(indicatorFile.data)) {
                            // Convert indicator data to a Map for O(1) lookup by time
                            // Ensure time is treated consistently (parsed already by parseChartData)
                            const indicatorMap = new Map();
                            let firstIndicatorTime: any = null;
                            let indicatorKeys: string[] = [];

                            indicatorFile.data.forEach((row: any) => {
                                // Capture keys from the first valid row (excluding time)
                                if (indicatorKeys.length === 0 && row) {
                                    indicatorKeys = Object.keys(row).filter(k => k !== 'time');
                                }
                                if (row.time !== undefined && row.time !== null) {
                                    indicatorMap.set(row.time, row);
                                    if (firstIndicatorTime === null) firstIndicatorTime = row.time;
                                }
                            });

                            // Prepare default object with nulls for missing matches
                            const defaultIndicatorData: any = {};
                            indicatorKeys.forEach(k => defaultIndicatorData[k] = null);

                            let matchCount = 0;
                            // Merge data columns based on Time
                            dataToMatch = file.data.map((row: any, idx: number) => {
                                // Debug first row only
                                if (idx === 0) {
                                    console.log(`[Merge Check] Source Row 0: ${row.time} (${typeof row.time}) vs Indicator Row 0: ${firstIndicatorTime} (${typeof firstIndicatorTime}) | In Map? ${indicatorMap.has(row.time)}`);
                                }

                                const indicatorRow = indicatorMap.get(row.time);

                                if (indicatorRow) {
                                    matchCount++;
                                    // Exclude 'time' from indicator to prevent overwriting
                                    const { time: _, ...indicatorData } = indicatorRow;
                                    return { ...row, ...indicatorData };
                                }

                                // FORCE MERGE DEFAULT KEYS if no match found
                                // This ensures matchColumnsToSeries sees the indicator keys in row 0
                                return { ...row, ...defaultIndicatorData };
                            });
                            console.log(`[Merge Result] ${file.filename}: ${matchCount}/${file.data.length} rows matched with ${indicatorFile.filename}`);
                        } else {
                            console.warn(`[Merge Warn] Indicator file data is not array:`, indicatorFile.data);
                        }
                    } else {
                        console.log(`[Merge] ❌ NO MATCH found for ${file.filename}`);
                    }
                }

                // Check for OHLCV columns match (or just try to match series)
                // We create a temp file object with merged data
                const tempFile = { ...file, data: dataToMatch };
                const seriesConfigs = matchColumnsToSeries(tempFile);

                if (seriesConfigs.length > 0) {
                    ohlcvCount++;
                    const chartId = `chart-${file.filename}-${newBaseItems.length}`;
                    newBaseItems.push({
                        id: chartId,
                        component: LWChart,
                        props: {
                            series: seriesConfigs,
                            fitContent: true, // Enable auto-fitting for main charts
                            onRegister: (api: any) => this.handleRegister(chartId, api),
                            onCrosshairMove: (p: any) => this.handleSync(chartId, p),
                        },
                    });
                }
            });
            this.baseChartItems = newBaseItems;

            const backtestFile = this.internalFiles.find(
                (f) =>
                    f.filename.includes("backtest_result.csv") ||
                    f.filename.includes("backtest_result.parquet"),
            );

            if (backtestFile) {
                this.bottomRowData = backtestFile;
                this.backtestSeriesConfig = matchColumnsToSeries(backtestFile);
                console.log(`[Page3State] Backtest Config: ${this.backtestSeriesConfig.length} series found.`);
            } else {
                this.bottomRowData = null;
                this.backtestSeriesConfig = [];
            }

            if (ohlcvCount === 1) this.selectedTemplate = GridTemplateType.HORIZONTAL_1x1;
            else if (ohlcvCount === 2 || ohlcvCount === 3)
                this.selectedTemplate = GridTemplateType.VERTICAL_1x2;
            else if (ohlcvCount >= 4) this.selectedTemplate = GridTemplateType.GRID_2x2;
        } catch (e) {
            console.error("处理 ZIP 失败:", e);
        } finally {
            this.loading = false;
            this.parsing = false;
        }
    }

    handleInternalFileSelect = (event: Event) => {
        const select = event.target as HTMLSelectElement;
        this.selectedInternalIndex = select.value;
    }

    handleTemplateChange = (event: Event) => {
        const select = event.target as HTMLSelectElement;
        this.selectedTemplate = select.value;
    }

    handleShowBottomRowChange = (event: Event) => {
        const checkbox = event.target as HTMLInputElement;
        this.showBottomRow = checkbox.checked;
    }

    handleViewModeChange = (mode: "chart" | "table") => {
        this.viewMode = mode;
        if (
            mode === "table" &&
            this.selectedInternalIndex === "-1" &&
            this.internalFiles.length > 0
        ) {
            const backtestIdx = this.internalFiles.findIndex((f) =>
                f.filename.includes("backtest_result"),
            );
            if (backtestIdx !== -1) {
                this.selectedInternalIndex = backtestIdx.toString();
            }
        }
    }
}
