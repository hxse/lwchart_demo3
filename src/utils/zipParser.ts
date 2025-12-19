import { unzipSync } from "fflate";
import { parquetReadObjects } from "hyparquet";
import { compressors } from "hyparquet-compressors";

/**
 * 解析后的文件内容
 */
export interface ParsedFileContent {
    filename: string;
    type: "csv" | "parquet" | "json" | "text";
    data: any;
    preview: string; // 用于显示的预览文本
}

/**
 * ZIP解析结果
 */
export interface ZipParseResult {
    files: ParsedFileContent[];
    error?: string;
}

/**
 * 解析CSV文本内容（浏览器兼容版本）
 * @param text CSV文本内容
 * @returns Promise<any[]> 解析后的JSON数组
 */
async function parseCsvContent(text: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
        try {
            const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");

            if (lines.length === 0) {
                resolve([]);
                return;
            }

            // 解析CSV行（支持引号包裹的字段）
            const parseCsvLine = (line: string): string[] => {
                const result: string[] = [];
                let current = "";
                let inQuotes = false;

                for (let i = 0; i < line.length; i++) {
                    const char = line[i];

                    if (char === '"') {
                        // 处理引号
                        if (inQuotes && line[i + 1] === '"') {
                            // 转义的引号
                            current += '"';
                            i++;
                        } else {
                            // 切换引号状态
                            inQuotes = !inQuotes;
                        }
                    } else if (char === "," && !inQuotes) {
                        // 字段分隔符（不在引号内）
                        result.push(current.trim());
                        current = "";
                    } else {
                        current += char;
                    }
                }

                // 添加最后一个字段
                result.push(current.trim());
                return result;
            };

            // 解析表头
            const headers = parseCsvLine(lines[0]);

            // 解析数据行
            const results: any[] = [];
            for (let i = 1; i < lines.length; i++) {
                const values = parseCsvLine(lines[i]);
                const obj: any = {};

                headers.forEach((header, index) => {
                    obj[header] = values[index] || "";
                });

                results.push(obj);
            }

            resolve(results);
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * 解析Parquet文件内容
 * @param buffer Parquet文件的ArrayBuffer
 * @returns Promise<any[]> 解析后的数据数组
 */
async function parseParquetContent(buffer: ArrayBuffer): Promise<any[]> {
    try {
        // 创建AsyncBuffer
        const asyncBuffer = {
            byteLength: buffer.byteLength,
            slice(start: number, end?: number): ArrayBuffer {
                return buffer.slice(start, end);
            },
        };

        // 使用hyparquet解析，传入compressors以支持 ZSTD/Snappy 等
        const data = await parquetReadObjects({
            file: asyncBuffer,
            compressors
        });
        return data;
    } catch (error: any) {
        console.error("Parquet parsing error:", error);
        throw error;
    }
}

/**
 * 解析JSON文本内容
 * @param text JSON文本内容
 * @returns Promise<any> 解析后的JSON对象或数组
 */
async function parseJsonContent(text: string): Promise<any> {
    try {
        return JSON.parse(text);
    } catch (error) {
        console.error("JSON parsing error:", error);
        throw error;
    }
}

/**
 * 格式化数据为预览文本
 * @param data 数据对象
 * @param type 文件类型
 * @returns 格式化后的预览文本
 */
function formatPreview(data: any, type: string): string {
    if (type === "json") {
        return JSON.stringify(data, null, 2);
    }

    if (Array.isArray(data)) {
        if (data.length === 0) {
            return "空文件";
        }

        // 对于CSV和Parquet，显示表格格式
        const maxRows = Math.min(10, data.length);
        const preview = data.slice(0, maxRows);

        // 获取所有列名
        const columns = Object.keys(preview[0] || {});

        // 构建表格
        let table = `共 ${data.length} 行数据，显示前 ${maxRows} 行:\n\n`;

        // 表头
        table += columns.join(" | ") + "\n";
        table += columns.map(() => "---").join(" | ") + "\n";

        // 数据行
        preview.forEach((row) => {
            const rowData = columns.map((col) => {
                const value = row[col];
                // 限制单元格长度
                const str = String(value ?? "");
                return str.length > 50 ? str.substring(0, 47) + "..." : str;
            });
            table += rowData.join(" | ") + "\n";
        });

        return table;
    }

    return String(data);
}

/**
 * 解析ZIP文件
 * @param blob ZIP文件的Blob对象
 * @returns Promise<ZipParseResult> 解析结果
 */
export async function parseZipFile(blob: Blob): Promise<ZipParseResult> {
    try {
        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        // fflate.unzipSync 是同步且极快的
        const unzipped = unzipSync(uint8Array);
        const files: ParsedFileContent[] = [];

        // 只处理文件，跳过可能的目录（fflate 返回的对象键是完整路径）
        const filePromises = Object.entries(unzipped)
            .filter(([filename, data]) => data.length > 0) // 简单过滤潜在目录
            .map(async ([filename, fileData]) => {
                try {
                    const lowerFilename = filename.toLowerCase();
                    const headBuffer = fileData.buffer;

                    // Pre-read first 4 bytes to check for Parquet magic number "PAR1"
                    const magic = new Uint8Array(headBuffer.slice(0, 4));
                    const isParquetMagic =
                        magic[0] === 0x50 && // P
                        magic[1] === 0x41 && // A
                        magic[2] === 0x52 && // R
                        magic[3] === 0x31;   // 1

                    if (isParquetMagic || lowerFilename.endsWith(".parquet")) {
                        // Parquet文件
                        const data = await parseParquetContent(headBuffer as ArrayBuffer);
                        const preview = formatPreview(data, "parquet");
                        return {
                            filename,
                            type: "parquet" as const,
                            data,
                            preview,
                        };
                    } else if (lowerFilename.endsWith(".csv")) {
                        // CSV文件
                        const text = new TextDecoder().decode(fileData);
                        const data = await parseCsvContent(text);
                        const preview = formatPreview(data, "csv");
                        return {
                            filename,
                            type: "csv" as const,
                            data,
                            preview,
                        };
                    } else if (lowerFilename.endsWith(".json")) {
                        // JSON文件
                        const text = new TextDecoder().decode(fileData);
                        const data = await parseJsonContent(text);
                        const preview = formatPreview(data, "json");
                        return {
                            filename,
                            type: "json" as const,
                            data,
                            preview,
                        };
                    } else {
                        // 其他文件类型，作为纯文本处理
                        const text = new TextDecoder().decode(fileData);
                        const preview =
                            text.length > 1000 ? text.substring(0, 997) + "..." : text;
                        return {
                            filename,
                            type: "text" as const,
                            data: text,
                            preview,
                        };
                    }
                } catch (error) {
                    console.error(`Error parsing file ${filename}:`, error);
                    return {
                        filename,
                        type: "text" as const,
                        data: null,
                        preview: `解析错误: ${(error as Error).message}`,
                    };
                }
            });

        // 等待所有文件解析完成
        const parsedFiles = await Promise.all(filePromises);
        files.push(...parsedFiles);

        return {
            files,
        };
    } catch (error) {
        console.error("ZIP parsing error:", error);
        return {
            files: [],
            error: `ZIP解析失败: ${(error as Error).message}`,
        };
    }
}
