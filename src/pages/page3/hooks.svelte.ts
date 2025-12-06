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
                this.bottomRowData
            );
        });
    }

    // --- Handlers ---
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
            const rawFiles = await downloadAndParseZip(selectedFile);
            this.internalFiles = rawFiles.map((f) => {
                if (Array.isArray(f.data)) {
                    return { ...f, data: parseChartData(f.data) };
                }
                return f;
            });

            const newBaseItems: GridItem[] = [];
            let ohlcvCount = 0;
            this.internalFiles.forEach((file) => {
                const seriesConfigs = matchColumnsToSeries(file);
                if (seriesConfigs.length > 0 && !file.filename.includes("backtest")) {
                    ohlcvCount++;
                    newBaseItems.push({
                        id: `chart-${file.filename}-${newBaseItems.length}`,
                        component: LWChart,
                        props: { series: seriesConfigs },
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
