import { TabulatorFull as Tabulator } from "tabulator-tables";
import "tabulator-tables/dist/css/tabulator.min.css";

/**
 * 创建并渲染 Tabulator 表格
 * @param container 容器元素
 * @param data 表格数据
 * @returns Tabulator 实例
 */
export function createTable(container: HTMLElement, data: any[]): Tabulator | null {
    if (!container || !data || data.length === 0) {
        return null;
    }

    // 自动生成列定义
    const columns = Object.keys(data[0]).map((key) => ({
        title: key,
        field: key,
        // headerFilter removed as per user request
    }));

    return new Tabulator(container, {
        data: data,
        columns: columns,
        layout: "fitColumns",
        height: "100%",
        pagination: true,
        paginationSize: 20,
        paginationSizeSelector: [10, 20, 50, 100],
        movableColumns: true,
    });
}
