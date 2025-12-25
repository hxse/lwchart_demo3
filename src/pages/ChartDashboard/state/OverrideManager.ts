/**
 * 配置覆盖管理器
 * 负责处理来自 URL 参数和 props 的配置覆盖
 */

import type { ChartConfigJSON, DashboardOverride, SeriesItemConfig } from "../chartDashboard.types";

/**
 * 内部共享逻辑：应用覆盖到配置对象
 * @param config 图表配置对象
 * @param overrideConfig 覆盖配置
 */
function applyOverrideLogic(
    config: ChartConfigJSON,
    overrideConfig: DashboardOverride
): void {
    if (overrideConfig.template) {
        config.template = overrideConfig.template;
    }
    if (overrideConfig.showBottomRow !== undefined) {
        config.showBottomRow = overrideConfig.showBottomRow;
    }
    if (overrideConfig.viewMode) {
        config.viewMode = overrideConfig.viewMode;
    }
    if (overrideConfig.selectedInternalFileName) {
        config.selectedInternalFileName = overrideConfig.selectedInternalFileName;
    }
    if (overrideConfig.showRiskLegend) {
        // 统一使用字符串格式 "1,1,0,1" (sl,tp,tsl,psar)
        const parts = overrideConfig.showRiskLegend.split(',').map(s => s.trim());
        if (parts.length === 4) {
            config.showRiskLegend = parts.map(p => p === '1') as [boolean, boolean, boolean, boolean];
        }
    }
    if (overrideConfig.showLegendInAll !== undefined) {
        config.showLegendInAll = overrideConfig.showLegendInAll;
    }

    if (!config.chart) return;

    // 处理显示/隐藏覆盖
    if (overrideConfig.show) {
        applyShowOverrides(config.chart, config.bottomRowChart, overrideConfig.show, 'show');
    }

    // 处理 Legend 显示覆盖
    if (overrideConfig.showInLegend) {
        applyShowOverrides(config.chart, config.bottomRowChart, overrideConfig.showInLegend, 'showInLegend');
    }
}

/**
 * 辅助：应用显示相关的三维坐标覆盖
 * @param chartConfig 主图表配置
 * @param bottomRowConfig 底部栏配置
 * @param overrides 覆盖字符串数组
 * @param key 覆盖的属性名
 */
function applyShowOverrides(
    chartConfig: SeriesItemConfig[][][],
    bottomRowConfig: SeriesItemConfig[][][] | undefined,
    overrides: string[],
    key: 'show' | 'showInLegend'
): void {
    overrides.forEach(coordStr => {
        const parts = coordStr.split(',').map(s => s.trim());
        if (parts.length === 4) {
            const [slotIdx, paneIdx, seriesIdx, val] = parts.map(p => parseInt(p));
            if (!isNaN(slotIdx) && !isNaN(paneIdx) && !isNaN(seriesIdx) && !isNaN(val)) {

                let series;
                if (slotIdx === -1 && bottomRowConfig) {
                    // -1 表示底栏，映射到底栏的第 0 个 Slot (通常底栏只有一个 Slot)
                    series = bottomRowConfig[0]?.[paneIdx]?.[seriesIdx];
                } else {
                    series = chartConfig[slotIdx]?.[paneIdx]?.[seriesIdx];
                }

                if (series) {
                    if (key === 'show') {
                        series.show = val === 1;
                    } else {
                        series.showInLegend = val === 1;
                    }
                }
            }
        }
    });
}

/**
 * 直接应用覆盖到配置对象（不触发响应式更新）
 * 用于在配置加载时立即应用覆盖，避免多次渲染
 * @param config 图表配置对象
 * @param overrideConfig 覆盖配置
 */
export function applyOverridesToConfig(
    config: ChartConfigJSON,
    overrideConfig: DashboardOverride
): void {
    applyOverrideLogic(config, overrideConfig);
}

/**
 * 应用覆盖并创建新的配置对象（触发响应式更新）
 * 用于运行时动态更新配置
 * @param config 当前配置对象
 * @param overrideConfig 覆盖配置
 * @returns 新的配置对象
 */
export function applyOverrides(
    config: ChartConfigJSON,
    overrideConfig: DashboardOverride
): ChartConfigJSON {
    // 创建新对象以触发响应式
    // 使用深拷贝以确保状态完全独立，避免副作用
    const nextConfig = JSON.parse(JSON.stringify(config));
    applyOverrideLogic(nextConfig, overrideConfig);
    return nextConfig;
}

/**
 * 从 URL 参数解析覆盖配置
 * @returns 覆盖配置对象
 */
export function parseUrlOverrides(): DashboardOverride {
    if (typeof window === "undefined") return {};

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
        if (vm === "chart" || vm === "table") {
            override.viewMode = vm;
        }
    }

    // 处理 showBottomRow (0 或 1)
    if (params.has("showBottomRow")) {
        const val = params.get("showBottomRow");
        if (val === "0" || val === "false") {
            override.showBottomRow = false;
        }
        if (val === "1" || val === "true") {
            override.showBottomRow = true;
        }
    }

    // 处理 show=slotIdx,paneIdx,seriesIdx,show (允许多个)
    if (params.has("show")) {
        const showArray: string[] = [];
        const shows = params.getAll("show");
        shows.forEach(val => {
            const parts = val.split(',');
            if (parts.length === 4) {
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

    // 处理 showInLegend=slotIdx,paneIdx,seriesIdx,show (允许多个)
    if (params.has("showInLegend")) {
        const legendArray: string[] = [];
        const entries = params.getAll("showInLegend");
        entries.forEach(val => {
            const parts = val.split(',');
            if (parts.length === 4) {
                const [slotIdx, paneIdx, seriesIdx, showVal] = parts.map(p => parseInt(p.trim()));
                if (!isNaN(slotIdx) && !isNaN(paneIdx) && !isNaN(seriesIdx) && !isNaN(showVal)) {
                    legendArray.push(val);
                }
            }
        });
        if (legendArray.length > 0) {
            override.showInLegend = legendArray;
        }
    }

    // 处理 showRiskLegend=sl,tp,tsl,psar (0或1)
    if (params.has("showRiskLegend")) {
        const val = params.get("showRiskLegend");
        if (val) {
            const parts = val.split(',').map(s => s.trim());
            if (parts.length === 4) {
                override.showRiskLegend = val;
            }
        }
    }

    // 处理 showLegendInAll (0 或 1)
    if (params.has("showLegendInAll")) {
        const val = params.get("showLegendInAll");
        override.showLegendInAll = val === "1" || val === "true";
    }


    return override;
}
