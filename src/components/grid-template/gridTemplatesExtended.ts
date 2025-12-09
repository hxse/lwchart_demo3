// 扩展的Grid模板配置字典 - 基于原有布局添加额外行
export interface GridTemplateConfig {
    gridTemplateAreas: string;
    gridTemplateColumns: string;
    gridTemplateRows: string;
    slots: number;
}

// 导入原始模板类型
import { GridTemplateType, gridTemplates } from "./gridTemplates";

/**
 * 为任何原始模板添加底部行
 * @param templateType 原始模板类型
 * @param bottomRowHeight 底部行高度，默认为 "20vh"
 * @returns 带有底部行的新模板配置
 */
export function addBottomRow(
    templateType: GridTemplateType,
    bottomRowHeight: string = "20%"
): GridTemplateConfig {
    let originalTemplate = gridTemplates[templateType];

    if (!originalTemplate) {
        console.warn(`[GridTemplate] Template type '${templateType}' not found. Fallback to '${GridTemplateType.HORIZONTAL_1x1}'.`);
        originalTemplate = gridTemplates[GridTemplateType.HORIZONTAL_1x1];
    }


    // 解析原始的 gridTemplateAreas
    const originalAreas = originalTemplate.gridTemplateAreas.split('"').filter(area => area.trim() !== '');

    // 计算列数
    const firstRow = originalAreas[0].trim();
    const columnCount = firstRow.split(' ').length;

    // 创建底部行的 grid-template-areas
    const bottomArea = Array(columnCount).fill('φ').join(' ');

    // 合并所有行
    const newAreas = [...originalAreas, bottomArea].map(area => `"${area.trim()}"`).join(' ');

    // 创建新的 grid-template-rows
    const originalRows = originalTemplate.gridTemplateRows.split(' ');
    const newRows = [...originalRows, bottomRowHeight].join(' ');

    return {
        gridTemplateAreas: newAreas,
        gridTemplateColumns: originalTemplate.gridTemplateColumns,
        gridTemplateRows: newRows,
        slots: originalTemplate.slots
    };
}
