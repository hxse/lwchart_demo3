/**
 * 文件加载器
 * 负责处理 ZIP 文件的加载和解析，包括 Notebook 模式和 Browser 模式
 */

import type { DashboardOverride, ChartConfigJSON } from "../chartDashboard.types";
import type { ParsedFileContent } from "../../../utils/zipParser";
import { ChartDataProcessor } from "../logic/ChartDataProcessor";

/**
 * ZIP 加载结果
 */
export interface ZipLoadResult {
    files: ParsedFileContent[];
    config: ChartConfigJSON | null;
}

/**
 * 从 Blob 加载并解析 ZIP 文件
 * @param blob ZIP 文件的 Blob 对象
 * @param isNotebookMode 是否为 Notebook 模式
 * @returns 加载结果（文件列表和配置）
 */
export async function loadZipFromBlob(
    blob: Blob,
    isNotebookMode: boolean = false
): Promise<ZipLoadResult> {
    const result = await ChartDataProcessor.processZipBlob(blob);

    // 为所有系列项分配顺序索引
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

    // 在浏览器模式下，应用 URL 参数中的 show 覆盖
    if (typeof window !== "undefined" && !isNotebookMode && result.config?.chart) {
        const params = new URLSearchParams(window.location.search);

        // 直接应用 show 覆盖到配置
        if (params.has("show")) {
            const showArray = params.getAll("show");
            showArray.forEach(showStr => {
                const parts = showStr.split(",");
                if (parts.length === 4) {
                    const [s, p, i, show] = parts.map(x => parseInt(x.trim()));
                    if (!isNaN(s) && !isNaN(p) && !isNaN(i) && !isNaN(show)) {
                        const series = result.config!.chart[s]?.[p]?.[i];
                        if (series) {
                            series.show = show === 1;
                        }
                    }
                }
            });
        }
    }

    return result;
}

/**
 * 将不同格式的数据转换为 Blob
 * @param zipData ZIP 数据（可以是 base64 字符串、ArrayBuffer 或 Blob）
 * @returns Blob 对象
 */
export function convertToBlob(zipData: string | ArrayBuffer | Blob): Blob {
    if (typeof zipData === 'string') {
        // Base64 字符串
        const byteCharacters = atob(zipData);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: 'application/zip' });
    } else if (zipData instanceof ArrayBuffer) {
        // ArrayBuffer
        return new Blob([zipData], { type: 'application/zip' });
    } else {
        // 已经是 Blob
        return zipData;
    }
}
