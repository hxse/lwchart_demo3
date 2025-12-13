import { onMount, onDestroy } from "svelte";
import { GridTemplateType } from "../../components/grid-template/gridTemplates";
import { addBottomRow } from "../../components/grid-template/gridTemplatesExtended";
import {
    downloadFileBlob,
    fetchFileList,
    type FileItem,
} from "../../utils/fileManager";
import type { GridItem, DashboardProps, ChartConfigJSON, DashboardOverride } from "./chartDashboard.types";
import { generateGridItemsFromConfig } from "./chartDashboard.utils";
import type { ParsedFileContent } from "../../utils/zipParser";

import { ChartSyncManager } from "./logic/ChartSyncManager";
import { ChartDataProcessor } from "./logic/ChartDataProcessor";

export class ChartDashboardState {
    // --- State ---
    fileList: FileItem[] = $state([]);
    zipFiles: FileItem[] = $derived(
        this.fileList.filter((f) => f.filename.toLowerCase().endsWith(".zip")),
    );
    zipBlob: Blob | null = null;
    isNotebookMode = $state(false);

    selectedZipIndex: string = $state("-1"); // UI State for Zip Selector

    // Core Data & Config State
    files: ParsedFileContent[] = $state.raw([]); // Raw Data
    config: ChartConfigJSON | null = $state(null); // Refined Config

    // UI Feedback
    loading = $state(false);
    parsing = $state(false);
    errorString: string | null = $state(null);

    // Derived States
    viewMode = $derived((this.config?.viewMode ?? "chart") as "chart" | "table"); // Driven by Config

    // Template derivation
    finalTemplate = $derived.by(() => {
        if (!this.config) return GridTemplateType.SINGLE;

        let tmpl = this.config.template as GridTemplateType;
        // Basic mapping backup if string doesn't match enum perfectly (though strict config implies it should)
        if (!Object.values(GridTemplateType).includes(tmpl)) {
            // Fallback map? e.g. "single" -> GridTemplateType.SINGLE is direct match if string values align. 
            // In gridTemplates.ts, SINGLE = 'single', GRID_2x2 = 'grid-2x2'.
            // If user config "2x2", we might need mapping.
            if ((tmpl as string) === '2x2') tmpl = GridTemplateType.GRID_2x2;
        }

        return this.config.showBottomRow ? addBottomRow(tmpl) : tmpl;
    });

    // Grid Items Derivation
    gridItems: GridItem[] = $derived.by(() => {
        if (!this.config || this.files.length === 0) return [];
        return generateGridItemsFromConfig(this.config, this.files, {
            onRegister: (id, api) => this.syncManager.register(id, api),
            onSync: (id, p) => this.syncManager.sync(id, p)
        });
    });

    // View State (Manual Table View)
    selectedInternalIndex: string = $state("-1"); // For the manual file viewer
    // We can auto-select based on config

    availableTemplates = Object.values(GridTemplateType);
    syncManager = new ChartSyncManager();

    constructor(props?: DashboardProps) {
        if (props?.zipData) {
            this.isNotebookMode = true;
        }

        onMount(async () => {
            const startTime = performance.now();

            if (props?.zipData) {
                // Notebook Mode
                this.isNotebookMode = true;
                try {
                    this.loading = true;
                    this.parsing = true;

                    let blob: Blob;
                    if (typeof props.zipData === 'string') {
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
                        blob = props.zipData;
                    }
                    this.zipBlob = blob;

                    await this.loadZipFromBlob(blob, props.config);

                    // Overrides already applied in loadZipFromBlob

                } catch (e: any) {
                    this.errorString = e.message;
                    console.error("Notebook Init Error:", e);
                } finally {
                    this.loading = false;
                    this.parsing = false;
                }
            } else {
                // Browser Mode
                try {
                    this.fileList = await fetchFileList();

                    // Check for selectedZipFileName in URL params
                    if (typeof window !== "undefined") {
                        const params = new URLSearchParams(window.location.search);
                        const zipName = params.get("selectedZipFileName");

                        if (zipName && this.zipFiles.length > 0) {
                            const foundIndex = this.zipFiles.findIndex(f => f.filename === zipName || f.path.endsWith(zipName));
                            if (foundIndex !== -1) {
                                // Auto-load found zip
                                await this.loadZipByIndex(foundIndex);
                            }
                        }
                    }

                } catch (e) {
                    console.error("Fetch file list failed:", e);
                }
            }
        });

        // Auto-select internal file from config when files/config change
        $effect(() => {
            if (this.config && this.files.length > 0 && this.selectedInternalIndex === "-1") {
                let target = this.config.selectedInternalFileName;
                if (target) {
                    const idx = this.files.findIndex(f => f.filename === target);
                    if (idx !== -1) this.selectedInternalIndex = idx.toString();
                }
            }
        });
    }

    loadZipFromBlob = async (blob: Blob, propsOverride?: DashboardOverride) => {
        try {
            this.syncManager.clear();
            this.errorString = null;

            const result = await ChartDataProcessor.processZipBlob(blob);

            this.files = result.files;

            // Assign sequential IDX to all series items
            let enumerator = 0;
            if (result.config && result.config.chart) {
                result.config.chart.forEach(slotPanes => {
                    slotPanes.forEach(paneSeriesList => {
                        paneSeriesList.forEach(item => {
                            item.idx = enumerator++;
                        });
                    });
                });
            }

            // Apply URL overrides BEFORE setting this.config to avoid double render
            if (typeof window !== "undefined" && !this.isNotebookMode) {
                const params = new URLSearchParams(window.location.search);

                // Apply show overrides directly to result.config
                if (params.has("show") && result.config?.chart) {
                    const showArray = params.getAll("show");
                    showArray.forEach(showStr => {
                        const parts = showStr.split(",");
                        if (parts.length === 4) {
                            const [s, p, i, show] = parts.map(x => parseInt(x.trim()));
                            if (!isNaN(s) && !isNaN(p) && !isNaN(i) && !isNaN(show)) {
                                const series = result.config.chart[s]?.[p]?.[i];
                                if (series) series.show = show === 1;
                            }
                        }
                    });
                }
            }

            this.config = result.config;

        } catch (e: any) {
            console.error("Load XML Error:", e);
            this.errorString = e.message;
            this.files = [];
            this.config = null;
            throw e; // Re-throw to caller
        }
    }

    // Core logic to load a zip by index in the fileList
    loadZipByIndex = async (index: number) => {
        // Validation
        if (index < 0 || index >= this.zipFiles.length) return;

        this.selectedZipIndex = index.toString();
        const selectedFile = this.zipFiles[index];

        // Reset
        this.files = [];
        this.config = null;
        this.errorString = null;
        this.selectedInternalIndex = "-1";

        this.loading = true;
        this.parsing = true;

        try {
            this.zipBlob = await downloadFileBlob(selectedFile);
            await this.loadZipFromBlob(this.zipBlob);

            // Apply URL Param Overrides (Browser Mode) - moved inside loadZipFromBlob to avoid double render
            // Do NOT call applyUrlOverrides here

        } catch (e: any) {
            this.errorString = e.message;
        } finally {
            this.loading = false;
            this.parsing = false;
        }
    }

    // Helper: Apply overrides directly to a config object (without triggering reactivity)
    private applyOverridesToConfig(config: ChartConfigJSON, overrideConfig: DashboardOverride) {
        if (overrideConfig.template) config.template = overrideConfig.template;
        if (overrideConfig.showBottomRow !== undefined) config.showBottomRow = overrideConfig.showBottomRow;
        if (overrideConfig.viewMode) config.viewMode = overrideConfig.viewMode;
        if (overrideConfig.selectedInternalFileName) config.selectedInternalFileName = overrideConfig.selectedInternalFileName;

        // Handle show visibility overrides
        if (overrideConfig.show && config.chart) {
            overrideConfig.show.forEach(coordStr => {
                const parts = coordStr.split(',').map(s => s.trim());
                if (parts.length === 4) {
                    const [slotIdx, paneIdx, seriesIdx, showVal] = parts.map(p => parseInt(p));
                    if (!isNaN(slotIdx) && !isNaN(paneIdx) && !isNaN(seriesIdx) && !isNaN(showVal)) {
                        const series = config.chart[slotIdx]?.[paneIdx]?.[seriesIdx];
                        if (series) series.show = showVal === 1;
                    }
                }
            });
        }
    }

    applyOverrides(overrideConfig: DashboardOverride) {
        if (!this.config) return;

        // Shallow merge overrides
        // We trigger reactivity by creating new object
        const nextConfig = { ...this.config };

        if (overrideConfig.template) nextConfig.template = overrideConfig.template;
        if (overrideConfig.showBottomRow !== undefined) nextConfig.showBottomRow = overrideConfig.showBottomRow;
        if (overrideConfig.viewMode) nextConfig.viewMode = overrideConfig.viewMode;
        if (overrideConfig.selectedInternalFileName) nextConfig.selectedInternalFileName = overrideConfig.selectedInternalFileName;

        // Handle show visibility overrides (三维坐标格式)
        // 格式: "slotIdx,paneIdx,seriesIdx,show" 例如 "0,1,2,1"
        if (overrideConfig.show && nextConfig.chart) {
            overrideConfig.show.forEach(coordStr => {
                const parts = coordStr.split(',').map(s => s.trim());
                if (parts.length === 4) {
                    const slotIdx = parseInt(parts[0]);
                    const paneIdx = parseInt(parts[1]);
                    const seriesIdx = parseInt(parts[2]);
                    const showVal = parseInt(parts[3]);

                    if (!isNaN(slotIdx) && !isNaN(paneIdx) && !isNaN(seriesIdx) && !isNaN(showVal)) {
                        const slot = nextConfig.chart[slotIdx];
                        if (slot) {
                            const pane = slot[paneIdx];
                            if (pane) {
                                const series = pane[seriesIdx];
                                if (series) {
                                    series.show = showVal === 1;
                                }
                            }
                        }
                    }
                }
            });
        }

        this.config = nextConfig;
    }

    // --- Actions ---

    handleZipSelect = async (event: Event) => {
        const select = event.target as HTMLSelectElement;
        const index = parseInt(select.value);
        if (index === -1 || isNaN(index)) return;

        await this.loadZipByIndex(index);
    }

    applyUrlOverrides() {
        if (typeof window === "undefined") return;
        const params = new URLSearchParams(window.location.search);

        const override: DashboardOverride = {};

        if (params.has("template")) {
            override.template = params.get("template")!;
        }
        if (params.has("selectedInternalFileName")) {
            override.selectedInternalFileName = params.get("selectedInternalFileName")!;
        }

        if (params.has("viewMode")) {
            const vm = params.get("viewMode");
            if (vm === "chart" || vm === "table") override.viewMode = vm;
        }

        // Handle showBottomRow (0 or 1)
        if (params.has("showBottomRow")) {
            const val = params.get("showBottomRow");
            if (val === "0" || val === "false") override.showBottomRow = false;
            if (val === "1" || val === "true") override.showBottomRow = true;
        }

        // Handle show=slotIdx,paneIdx,seriesIdx,show (multiple allowed)
        // 例: &show=0,0,0,1&show=0,1,0,0
        // 格式: slotIdx,paneIdx,seriesIdx,show(0/1)
        if (params.has("show")) {
            const showArray: string[] = [];
            const shows = params.getAll("show");
            shows.forEach(val => {
                const parts = val.split(',');
                if (parts.length === 4) {
                    // 验证格式
                    const [slotIdx, paneIdx, seriesIdx, showVal] = parts.map(p => parseInt(p.trim()));
                    if (!isNaN(slotIdx) && !isNaN(paneIdx) && !isNaN(seriesIdx) && !isNaN(showVal)) {
                        showArray.push(val);
                    }
                }
            });
            if (showArray.length > 0) {
                override.show = showArray;
            }
        }

        if (Object.keys(override).length > 0) {
            this.applyOverrides(override);
        }
    }

    handleInternalFileSelect = (event: Event) => {
        const select = event.target as HTMLSelectElement;
        this.selectedInternalIndex = select.value;
    }

    // View Mode Toggle (Manually, if UI element exists to toggle it)
    handleViewModeChange = (mode: "chart" | "table") => {
        if (this.config) {
            this.config.viewMode = mode;
        }
    }

    // Config updates via Header
    handleTemplateChange = (event: Event) => {
        const select = event.target as HTMLSelectElement;
        if (this.config) {
            this.config.template = select.value; // Reactivity via $state proxy
        }
    }

    handleShowBottomRowChange = (event: Event) => {
        const checkbox = event.target as HTMLInputElement;
        if (this.config) {
            this.config.showBottomRow = checkbox.checked;
        }
    }
}
