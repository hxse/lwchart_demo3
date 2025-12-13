import { parseZipFile, type ParsedFileContent } from "../../../utils/zipParser";
import { parseChartData } from "../../../utils/chartDataHelper";
import type { ChartConfigJSON } from "../chartDashboard.types";

export interface ProcessedDataResult {
    files: ParsedFileContent[];
    config: ChartConfigJSON;
}

export class ChartDataProcessor {
    static async processZipBlob(blob: Blob): Promise<ProcessedDataResult> {
        const startTime = performance.now();

        // 1. Parse all files from ZIP
        const result = await parseZipFile(blob);
        if (result.error) throw new Error(result.error);
        const files = result.files;

        // 2. Strict Config Check: Look for chartConfig.json
        const configFiles = files.filter(f =>
            f.filename === "chartConfig.json" ||
            f.filename.endsWith("/chartConfig.json")
        );

        if (configFiles.length === 0) {
            throw new Error("Strict Mode Error: ZIP file must contain 'chartConfig.json'.");
        }

        // Prefer exact match at root, else first found
        const configFile = configFiles.find(f => f.filename === "chartConfig.json") || configFiles[0];

        let config: ChartConfigJSON;
        try {
            // Data might be string (if text/json type) or already object (if handled by parser)
            // parseZipFile returns data as object for .json files usually, but let's be safe
            config = typeof configFile.data === 'string'
                ? JSON.parse(configFile.data)
                : configFile.data;

            // Validate essential fields
            if (!config || !Array.isArray(config.chart)) {
                throw new Error("Invalid chartConfig.json: Missing 'chart' array.");
            }
        } catch (e: any) {
            throw new Error(`Failed to parse chartConfig.json: ${e.message}`);
        }

        // 3. Process time data for all files (for LWChart compatibility)
        // We do this after config check to fail early, but before returning.
        // We modify the files in place (or map to new array) to include parsed time.
        // Import parseChartData at top of file needed.
        const processedFiles = files.map(f => {
            // Only process data files (arrays)
            if (Array.isArray(f.data)) {
                return { ...f, data: parseChartData(f.data) };
            }
            return f;
        });

        console.log(`[Performance] ZIP & Config processing: ${(performance.now() - startTime).toFixed(2)}ms`);

        return {
            files: processedFiles,
            config
        };
    }
}
