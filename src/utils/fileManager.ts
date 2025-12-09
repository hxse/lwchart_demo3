import { api } from "../services/api";
import { parseZipFile, type ParsedFileContent } from "./zipParser";

export interface FileItem {
    filename: string;
    path: string;
}

/**
 * 下载并解析 ZIP 文件
 * @param file 要下载的文件信息
 * @returns 解析后的文件内容数组
 */
export async function downloadAndParseZip(file: FileItem): Promise<ParsedFileContent[]> {
    try {
        const response = await api.fetch(
            `/file/download?filename=${encodeURIComponent(file.filename)}&path=${encodeURIComponent(file.path)}`
        );

        if (!response.ok) {
            throw new Error(`Download failed: ${response.statusText}`);
        }

        const blob = await response.blob();
        const result = await parseZipFile(blob);

        if (result.error) {
            throw new Error(result.error);
        }

        return result.files;
    } catch (error) {
        console.error("Error in downloadAndParseZip:", error);
        throw error;
    }
}

/**
 * 获取文件列表
 */
export async function fetchFileList(): Promise<FileItem[]> {
    try {
        const response = await api.fetchFileList();
        if (response && Array.isArray(response.files)) {
            return response.files;
        }
        throw new Error("Invalid file list format");
    } catch (error) {
        console.error("Failed to fetch file list:", error);
        throw error;
    }
}

/**
 * 仅下载文件 Blob
 */
export async function downloadFileBlob(file: FileItem): Promise<Blob> {
    try {
        const response = await api.fetch(
            `/file/download?filename=${encodeURIComponent(file.filename)}&path=${encodeURIComponent(file.path)}`
        );

        if (!response.ok) {
            throw new Error(`Download failed: ${response.statusText}`);
        }

        return await response.blob();
    } catch (error) {
        console.error("Error in downloadFileBlob:", error);
        throw error;
    }
}
