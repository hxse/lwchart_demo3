/**
 * ChartDashboard 状态管理
 * 核心状态类，管理图表仪表板的所有响应式状态
 */

import { onMount } from "svelte";
import { GridTemplateType } from "../../../components/grid-template/gridTemplates";
import { addBottomRow } from "../../../components/grid-template/gridTemplatesExtended";
import { getCurrentConfig } from "../../../components/grid-template/utils";
import {
    downloadFileBlob,
    fetchFileList,
    type FileItem,
} from "../../../utils/fileManager";
import type { GridItem, DashboardProps, ChartConfigJSON, DashboardOverride } from "../chartDashboard.types";
import { generateGridItemsFromConfig } from "../logic/GridItemBuilder";
import type { ParsedFileContent } from "../../../utils/zipParser";
import EmptyGridItem from "../../../components/EmptyGridItem.svelte";

import { ChartSyncManager } from "../logic/ChartSyncManager";
import { loadZipFromBlob, convertToBlob } from "./FileLoader";
import { applyOverridesToConfig } from "./OverrideManager";

export class ChartDashboardState {
    // --- 文件和 ZIP 状态 ---
    fileList: FileItem[] = $state([]);
    zipFiles: FileItem[] = $derived(
        this.fileList.filter((f) => f.filename.toLowerCase().endsWith(".zip")),
    );
    zipBlob: Blob | null = null;
    isNotebookMode = $state(false);
    selectedZipIndex: string = $state("-1"); // UI 下拉框状态

    // --- 核心数据和配置状态 ---
    files: ParsedFileContent[] = $state.raw([]); // 原始数据
    config: ChartConfigJSON | null = $state(null); // 精炼配置

    // --- UI 反馈状态 ---
    loading = $state(false);
    parsing = $state(false);
    errorString: string | null = $state(null);

    // --- 派生状态 ---
    viewMode = $derived((this.config?.viewMode ?? "chart") as "chart" | "table");

    // 模板派生
    finalTemplate = $derived.by(() => {
        if (!this.config) return GridTemplateType.SINGLE;

        let tmpl = this.config.template as GridTemplateType;
        // 基本映射备份（如果字符串不完全匹配枚举）
        if (!Object.values(GridTemplateType).includes(tmpl)) {
            if ((tmpl as string) === '2x2') tmpl = GridTemplateType.GRID_2x2;
        }

        return this.config.showBottomRow ? addBottomRow(tmpl) : tmpl;
    });

    // 网格项派生
    gridItems: GridItem[] = $derived.by(() => {
        if (!this.config || this.files.length === 0) return [];

        // 生成原始 gridItems
        const rawItems = generateGridItemsFromConfig(this.config, this.files, {
            onRegister: (id, api) => this.syncManager.register(id, api),
            onSync: (id, p) => this.syncManager.sync(id, p),
            onBottomClick: (time: number) => this.syncManager.jumpToTime(time, "bottom-row-backtest")
        });

        // 获取模板主槽位数量（不含底栏）
        const templateConfig = getCurrentConfig(this.finalTemplate);
        const templateSlots = templateConfig.slots;

        // 分离底栏和主图表（底栏id包含'bottom'）
        const bottomRowItem = rawItems.find(item => item.id.includes('bottom'));
        const mainItems = rawItems.filter(item => !item.id.includes('bottom'));

        // 调整主图表数量以匹配模板槽位
        let adjustedMainItems: GridItem[] = [];

        if (mainItems.length < templateSlots) {
            // 不够，用EmptyGridItem填充
            adjustedMainItems = [...mainItems];
            for (let i = mainItems.length; i < templateSlots; i++) {
                adjustedMainItems.push({
                    id: `empty-fill-${i}`,
                    component: EmptyGridItem,
                    props: {}
                });
            }
        } else {
            // 取前templateSlots个（多余的忽略）
            adjustedMainItems = mainItems.slice(0, templateSlots);
        }

        // 底栏始终在最后
        return bottomRowItem ? [...adjustedMainItems, bottomRowItem] : adjustedMainItems;
    });

    // --- 视图状态（手动表格查看）---
    selectedInternalIndex: string = $state("-1");

    availableTemplates = Object.values(GridTemplateType);
    syncManager = new ChartSyncManager();

    constructor(props?: DashboardProps) {
        if (props?.zipData) {
            this.isNotebookMode = true;
        }

        onMount(async () => {
            if (props?.zipData) {
                // Notebook 模式
                this.isNotebookMode = true;
                try {
                    this.loading = true;
                    this.parsing = true;

                    const blob = convertToBlob(props.zipData);
                    this.zipBlob = blob;

                    await this.loadZipFromBlobInternal(blob, props.config);
                } catch (e: any) {
                    this.errorString = e.message;
                    console.error("Notebook Init Error:", e);
                } finally {
                    this.loading = false;
                    this.parsing = false;
                }
            } else {
                // Browser 模式
                try {
                    this.fileList = await fetchFileList();

                    // 检查 URL 参数中的 selectedZipFileName
                    if (typeof window !== "undefined") {
                        const params = new URLSearchParams(window.location.search);
                        const zipName = params.get("selectedZipFileName");

                        if (zipName && this.zipFiles.length > 0) {
                            const foundIndex = this.zipFiles.findIndex(f => f.filename === zipName || f.path.endsWith(zipName));
                            if (foundIndex !== -1) {
                                // 自动加载找到的 zip
                                await this.loadZipByIndex(foundIndex);
                            }
                        }
                    }
                } catch (e) {
                    console.error("Fetch file list failed:", e);
                }
            }
        });

        // 当文件/配置改变时自动选择内部文件
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

    /**
     * 从 Blob 加载 ZIP 文件（内部方法）
     */
    private loadZipFromBlobInternal = async (blob: Blob, propsOverride?: DashboardOverride) => {
        try {
            this.syncManager.clear();
            this.errorString = null;

            const result = await loadZipFromBlob(blob, this.isNotebookMode);
            this.files = result.files;
            this.config = result.config;

            // 应用 Notebook Props 覆盖
            if (propsOverride && this.config) {
                console.log('[Override] Applying Props overrides:', propsOverride);
                applyOverridesToConfig(this.config, propsOverride);
            }
        } catch (e: any) {
            console.error("Load ZIP Error:", e);
            this.errorString = e.message;
            this.files = [];
            this.config = null;
            throw e;
        }
    }

    /**
     * 根据索引加载 ZIP 文件
     */
    private loadZipByIndex = async (index: number) => {
        // 验证
        if (index < 0 || index >= this.zipFiles.length) return;

        this.selectedZipIndex = index.toString();
        const selectedFile = this.zipFiles[index];

        // 重置
        this.files = [];
        this.config = null;
        this.errorString = null;
        this.selectedInternalIndex = "-1";

        this.loading = true;
        this.parsing = true;

        try {
            this.zipBlob = await downloadFileBlob(selectedFile);
            await this.loadZipFromBlobInternal(this.zipBlob);
        } catch (e: any) {
            this.errorString = e.message;
        } finally {
            this.loading = false;
            this.parsing = false;
        }
    }

    // --- 事件处理器 ---

    handleZipSelect = async (event: Event) => {
        const select = event.target as HTMLSelectElement;
        const index = parseInt(select.value);
        if (index === -1 || isNaN(index)) return;

        await this.loadZipByIndex(index);
    }

    handleInternalFileSelect = (event: Event) => {
        const select = event.target as HTMLSelectElement;
        this.selectedInternalIndex = select.value;
    }

    handleViewModeChange = (mode: "chart" | "table") => {
        if (this.config) {
            this.config.viewMode = mode;
        }
    }

    handleTemplateChange = (event: Event) => {
        const select = event.target as HTMLSelectElement;
        if (this.config) {
            this.config.template = select.value;
        }
    }

    handleShowBottomRowChange = (event: Event) => {
        const checkbox = event.target as HTMLInputElement;
        if (this.config) {
            this.config.showBottomRow = checkbox.checked;
        }
    }

    /**
     * 所有图表显示全部数据
     */
    fitContentAll = () => {
        this.syncManager.fitContentAll();
    }

    /**
     * 主图表重置时间轴
     */
    resetTimeScaleAll = () => {
        this.syncManager.resetTimeScaleAll();
    }
}
