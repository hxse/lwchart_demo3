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
        const zipStartTime = performance.now();
        const result = await parseZipFile(blob);
        const zipTime = performance.now() - zipStartTime;

        if (result.error) throw new Error(result.error);
        const files = result.files;

        // 2. Strict Config Check: Look for chartConfig.json
        const configStartTime = performance.now();
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
            config = typeof configFile.data === 'string'
                ? JSON.parse(configFile.data)
                : configFile.data;

            if (!config || !Array.isArray(config.chart)) {
                throw new Error("Invalid chartConfig.json: Missing 'chart' array.");
            }
        } catch (e: any) {
            throw new Error(`Failed to parse chartConfig.json: ${e.message}`);
        }
        const configTime = performance.now() - configStartTime;

        // 3. Process time data for all files
        const timeParseStartTime = performance.now();
        const processedFiles = files.map(f => {
            if (Array.isArray(f.data)) {
                return { ...f, data: parseChartData(f.data) };
            }
            return f;
        });
        const timeParseTime = performance.now() - timeParseStartTime;

        const totalTime = performance.now() - startTime;
        console.log(`[Performance] ZIP & Config processing: ${totalTime.toFixed(2)}ms (ZIP: ${zipTime.toFixed(2)}ms, Config: ${configTime.toFixed(2)}ms, TimeParse: ${timeParseTime.toFixed(2)}ms)`);

        return {
            files: processedFiles,
            config
        };
    }
}
