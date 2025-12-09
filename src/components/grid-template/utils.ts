import { gridTemplates, type GridTemplateConfig, GridTemplateType } from "./gridTemplates";

/**
 * 获取当前模板配置
 * @param templateConfig 模板配置或配置键名
 * @returns 当前模板配置
 */
export function getCurrentConfig(templateConfig: GridTemplateConfig | GridTemplateType | string): GridTemplateConfig {
    if (typeof templateConfig === "string") {
        if (templateConfig in gridTemplates) {
            return gridTemplates[templateConfig as GridTemplateType];
        }
        return gridTemplates[GridTemplateType.SINGLE];
    }
    return templateConfig;
}

/**
 * 从网格模板区域字符串中提取所有唯一的区域名称
 * @param gridTemplateAreas 网格模板区域字符串
 * @returns 所有唯一的区域名称数组
 */
export function extractAllAreas(gridTemplateAreas: string): string[] {
    const areaNames = new Set<string>();

    gridTemplateAreas
        .split('"')
        .filter((area: string) => area.trim())
        .map((area: string) => area.trim())
        .forEach((area: string) => {
            area
                .split(" ")
                .filter((name: string) => name.trim())
                .forEach((name: string) => {
                    areaNames.add(name);
                });
        });

    return Array.from(areaNames);
}
