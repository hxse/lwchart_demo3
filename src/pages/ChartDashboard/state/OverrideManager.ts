/**
 * 配置覆盖管理器
 * 负责处理来自 URL 参数和 props 的配置覆盖
 */

import type { ChartConfigJSON, DashboardOverride } from "../chartDashboard.types";

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

    // 处理显示/隐藏覆盖
    if (overrideConfig.show && config.chart) {
        overrideConfig.show.forEach(coordStr => {
            const parts = coordStr.split(',').map(s => s.trim());
            if (parts.length === 4) {
                const [slotIdx, paneIdx, seriesIdx, showVal] = parts.map(p => parseInt(p));
                if (!isNaN(slotIdx) && !isNaN(paneIdx) && !isNaN(seriesIdx) && !isNaN(showVal)) {
                    const series = config.chart[slotIdx]?.[paneIdx]?.[seriesIdx];
                    if (series) {
                        series.show = showVal === 1;
                    }
                }
            }
        });
    }

    // 处理 Legend 显示覆盖
    if (overrideConfig.showInLegend && config.chart) {
        overrideConfig.showInLegend.forEach(coordStr => {
            const parts = coordStr.split(',').map(s => s.trim());
            if (parts.length === 4) {
                const [slotIdx, paneIdx, seriesIdx, showVal] = parts.map(p => parseInt(p));
                if (!isNaN(slotIdx) && !isNaN(paneIdx) && !isNaN(seriesIdx) && !isNaN(showVal)) {
                    const series = config.chart[slotIdx]?.[paneIdx]?.[seriesIdx];
                    if (series) {
                        series.showInLegend = showVal === 1;
                    }
                }
            }
        });
    }
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
    const nextConfig = { ...config };

    if (overrideConfig.template) {
        nextConfig.template = overrideConfig.template;
    }
    if (overrideConfig.showBottomRow !== undefined) {
        nextConfig.showBottomRow = overrideConfig.showBottomRow;
    }
    if (overrideConfig.viewMode) {
        nextConfig.viewMode = overrideConfig.viewMode;
    }
    if (overrideConfig.selectedInternalFileName) {
        nextConfig.selectedInternalFileName = overrideConfig.selectedInternalFileName;
    }

    // 处理显示/隐藏覆盖（三维坐标格式）
    if (overrideConfig.show && nextConfig.chart) {
        overrideConfig.show.forEach(coordStr => {
            const parts = coordStr.split(',').map(s => s.trim());
            if (parts.length === 4) {
                const slotIdx = parseInt(parts[0]);
                const paneIdx = parseInt(parts[1]);
                const seriesIdx = parseInt(parts[2]);
                const showVal = parseInt(parts[3]);

                if (!isNaN(slotIdx) && !isNaN(paneIdx) && !isNaN(seriesIdx) && !isNaN(showVal)) {
                    const series = nextConfig.chart[slotIdx]?.[paneIdx]?.[seriesIdx];
                    if (series) {
                        series.show = showVal === 1;
                    }
                }
            }
        });
    }

    // 处理 Legend 显示覆盖
    if (overrideConfig.showInLegend && nextConfig.chart) {
        overrideConfig.showInLegend.forEach(coordStr => {
            const parts = coordStr.split(',').map(s => s.trim());
            if (parts.length === 4) {
                const slotIdx = parseInt(parts[0]);
                const paneIdx = parseInt(parts[1]);
                const seriesIdx = parseInt(parts[2]);
                const showVal = parseInt(parts[3]);

                if (!isNaN(slotIdx) && !isNaN(paneIdx) && !isNaN(seriesIdx) && !isNaN(showVal)) {
                    const series = nextConfig.chart[slotIdx]?.[paneIdx]?.[seriesIdx];
                    if (series) {
                        series.showInLegend = showVal === 1;
                    }
                }
            }
        });
    }

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

    return override;
}
