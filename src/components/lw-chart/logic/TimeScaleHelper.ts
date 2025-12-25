/**
 * 时间轴辅助工具
 * 从 ChartController 拆分出的时间轴操作逻辑
 */

import type { ITimeScaleApi, ISeriesApi } from "lightweight-charts";

/**
 * 在系列数据中查找最接近目标时间的时间点（使用二分查找，O(log n)）
 * @param seriesMap 系列映射表
 * @param targetTime 目标时间戳
 * @returns 最接近的时间戳，如果没找到则返回 null
 */
export function findClosestTime(
    seriesMap: Map<string, ISeriesApi<any>>,
    targetTime: number
): number | null {
    let closestTime: number | null = null;
    let closestDistance = Infinity;

    // 只需要从第一个 series 获取数据（所有 series 共享相同的时间轴）
    const firstSeries = seriesMap.values().next().value;
    if (!firstSeries) return null;

    try {
        // @ts-ignore - 访问内部 API 获取数据
        const data = firstSeries.data?.() || [];
        if (data.length === 0) return null;

        // 二分查找最接近且不超过目标时间的点
        let left = 0;
        let right = data.length - 1;

        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const midTime = data[mid].time;

            if (typeof midTime !== 'number') {
                // 如果时间不是数字，跳过
                left = mid + 1;
                continue;
            }

            if (midTime === targetTime) {
                return midTime; // 精确匹配
            } else if (midTime < targetTime) {
                const distance = targetTime - midTime;
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestTime = midTime;
                }
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }
    } catch (e) {
        console.warn('[findClosestTime] 无法获取 series 数据:', e);
    }

    return closestTime;
}

/**
 * 计算居中显示的新可视范围
 * @param timeScale 时间轴 API
 * @param logicalIndex 目标逻辑索引
 * @returns 新的可视范围对象，如果无法获取则返回 null
 */
export function calculateCenteredRange(
    timeScale: ITimeScaleApi<any>,
    logicalIndex: number
): { from: number; to: number } | null {
    const visibleRange = timeScale.getVisibleLogicalRange();
    if (!visibleRange) return null;

    // 获取当前可见范围的宽度（Logical 距离）
    const barSpacing = visibleRange.to - visibleRange.from;

    // 计算新的范围，使 logicalIndex 居中
    const halfSpacing = barSpacing / 2;
    return {
        from: logicalIndex - halfSpacing,
        to: logicalIndex - halfSpacing + barSpacing
    };
}
