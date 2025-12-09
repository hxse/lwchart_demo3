import { onMount } from "svelte";
import { GridTemplateType } from "../../components/grid-template/gridTemplates";
import { addBottomRow } from "../../components/grid-template/gridTemplatesExtended";
import {
    downloadFileBlob,
    fetchFileList,
    type FileItem,
} from "../../utils/fileManager";
import type { GridItem, DashboardProps } from "./chartDashboard.types";
import { calculateGridItems } from "./chartDashboard.utils";
import type { ParsedFileContent } from "../../utils/zipParser";
import type { SeriesConfig } from "../../utils/seriesMatcher";

import { ChartSyncManager } from "./logic/ChartSyncManager";
import { normalizeConfig } from "./logic/ConfigNormalizer";
import { ChartDataProcessor } from "./logic/ChartDataProcessor";

export class ChartDashboardState {
    // --- State ---
    fileList: FileItem[] = $state([]);
    zipFiles: FileItem[] = $derived(
        this.fileList.filter((f) => f.filename.toLowerCase().endsWith(".zip")),
    );
    zipBlob: Blob | null = null;
    isNotebookMode = $state(false);

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
    showBottomRow = $state(true);
    selectedTemplate = $state<string>(GridTemplateType.HORIZONTAL_1x1);
    finalTemplate = $derived(
        this.showBottomRow
            ? addBottomRow(this.selectedTemplate as GridTemplateType)
            : this.selectedTemplate,
    );
    bottomRowData: ParsedFileContent | null = null;

    // Logic Managers
    syncManager = new ChartSyncManager();

    availableTemplates = Object.values(GridTemplateType);

    // User Config Overrides
    userProvidedTemplate: string | null = null;
    userProvidedInternalFileName: string | null = null;

    constructor(props?: DashboardProps) {
        // --- Initialization ---
        if (props?.zipData) {
            this.isNotebookMode = true;
        }

        // --- Lifecycle ---
        onMount(async () => {
            const startTime = performance.now();

            // 1. Check for Notebook Mode (Props)
            if (props?.zipData) {
                this.isNotebookMode = true;

                // Handle Config Defaults
                if (props.config) {
                    const normalized = normalizeConfig(props.config, this.selectedTemplate);

                    if (props.config.template) {
                        this.selectedTemplate = normalized.template;
                        this.userProvidedTemplate = normalized.template;
                    }

                    this.showBottomRow = normalized.showBottomRow;
                    this.viewMode = normalized.viewMode;
                    this.userProvidedInternalFileName = normalized.selectedInternalFileName;
                }

                try {
                    this.loading = true;
                    this.parsing = true;

                    // Convert zipData to Blob
                    let blob: Blob;
                    if (typeof props.zipData === 'string') {
                        // Base64 string -> Blob
                        const byteCharacters = atob(props.zipData);
                        const byteNumbers = new Array(byteCharacters.length);
                        for (let i = 0; i < byteCharacters.length; i++) {
                            byteNumbers[i] = byteCharacters.charCodeAt(i);
                        }
                        const byteArray = new Uint8Array(byteNumbers);
                        blob = new Blob([byteArray], { type: 'application/zip' });
                    } else if (props.zipData instanceof ArrayBuffer) {
                        blob = new Blob([props.zipData], { type: 'application/zip' });
                    } else {
                        blob = props.zipData; // Assuming it's already a Blob
                    }
                    this.zipBlob = blob;
                    await this.loadZipFromBlob(this.zipBlob);
                } catch (e) {
                    console.error("[ChartDashboard] Failed to load from props:", e);
                } finally {
                    this.loading = false;
                    this.parsing = false;
                }
            } else {
                // 2. Browser Mode (Fetch File List)
                try {
                    this.fileList = await fetchFileList();
                } catch (e) {
                    console.error("获取文件列表失败:", e);
                }
            }

            console.log(`[Performance] Total initialization: ${(performance.now() - startTime).toFixed(2)}ms`);
        });


        $effect(() => {
            this.gridItems = calculateGridItems(
                this.finalTemplate,
                this.showBottomRow,
                this.baseChartItems,
                this.backtestSeriesConfig,
                this.bottomRowData,
                {
                    onRegister: (id, api) => this.syncManager.register(id, api),
                    onSync: (id, p) => this.syncManager.sync(id, p)
                }
            );
        });
    }

    // --- Core Logic ---
    loadZipFromBlob = async (blob: Blob) => {
        try {
            // Clear Sync Manager before loading new charts
            this.syncManager.clear();

            const result = await ChartDataProcessor.processZipBlob(blob, {
                onRegister: (id, api) => this.syncManager.register(id, api),
                onSync: (id, p) => this.syncManager.sync(id, p)
            });

            this.internalFiles = result.internalFiles;
            this.baseChartItems = result.baseChartItems;
            this.backtestSeriesConfig = result.backtestSeriesConfig;
            this.bottomRowData = result.bottomRowData;

            // --- File Selection Override ---
            if (this.userProvidedInternalFileName) {
                // Try strict match
                let targetIdx = this.internalFiles.findIndex(f => f.filename === this.userProvidedInternalFileName);
                if (targetIdx !== -1) {
                    this.selectedInternalIndex = targetIdx.toString();
                } else {
                    console.warn(`[ChartDashboard] Configured file '${this.userProvidedInternalFileName}' not found.`);
                }
            }

            // Template Logic: Respect user config OR auto-detect
            if (!this.userProvidedTemplate && result.recommendedTemplate) {
                this.selectedTemplate = result.recommendedTemplate;
            }

        } catch (e) {
            console.error("处理 ZIP Blob 失败:", e);
            throw e;
        }
    }


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
            this.zipBlob = await downloadFileBlob(selectedFile);
            await this.loadZipFromBlob(this.zipBlob);

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
