import { GridTemplateType } from "../../../components/grid-template/gridTemplates";
import type { DashboardProps } from "../chartDashboard.types";

export interface NormalizedConfig {
    template: string;
    showBottomRow: boolean;
    viewMode: "chart" | "table";
    selectedInternalFileName: string | null;
}

export function normalizeConfig(config: DashboardProps['config'], defaultTemplate: string): NormalizedConfig {
    const result: NormalizedConfig = {
        template: defaultTemplate,
        showBottomRow: true,
        viewMode: "chart",
        selectedInternalFileName: null
    };

    if (config) {
        // Template Normalization
        if (config.template) {
            // Normalize: "HORIZONTAL_1x1" -> "horizontal-1x1"
            const normalized = config.template.toLowerCase().replace(/_/g, '-');
            // Verify if it is a valid template type
            if (Object.values(GridTemplateType).includes(normalized as GridTemplateType)) {
                result.template = normalized;
            } else {
                // Try raw (in case user passed "horizontal-1x1")
                if (Object.values(GridTemplateType).includes(config.template as GridTemplateType)) {
                    result.template = config.template;
                } else {
                    console.warn(`[ChartDashboard] Invalid template config: ${config.template}`);
                }
            }
        }

        if (config.showBottomRow !== undefined) result.showBottomRow = config.showBottomRow;
        if (config.viewMode) result.viewMode = config.viewMode;
        if (config.selectedInternalFileName) result.selectedInternalFileName = config.selectedInternalFileName;
    }

    return result;
}
