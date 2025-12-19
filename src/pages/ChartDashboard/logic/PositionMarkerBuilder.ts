/**
 * 仓位进出场标记生成器
 * 负责从 backtest_result 数据生成 Lightweight Charts 的 markers
 */

/**
 * 生成仓位进出场标记
 * @param fileData 原始文件数据数组（包含 entry_long_price, entry_short_price, exit_long_price, exit_short_price）
 * @returns markers 数组
 */
export function generatePositionMarkers(fileData: any[]): any[] {
    const perfStart = performance.now();
    const markers: any[] = [];



    // 状态追踪变量
    let prevLongEntry: number | null = null;
    let prevLongExit: number | null = null;
    let prevShortEntry: number | null = null;
    let prevShortExit: number | null = null;

    // 单次循环遍历所有数据
    for (let i = 0; i < fileData.length; i++) {
        const row = fileData[i];
        const time = row.time;

        const entryLong = row.entry_long_price;
        const exitLong = row.exit_long_price;
        const entryShort = row.entry_short_price;
        const exitShort = row.exit_short_price;

        // === 处理多头进场 ===
        if (entryLong !== null && entryLong !== undefined && !isNaN(Number(entryLong))) {
            // 判断是否显示
            let shouldShow = false;

            if (prevLongExit !== null) {
                // 上一个多头离场存在，显示当前进场
                shouldShow = true;
            } else if (prevLongEntry === null) {
                // 第一次进场
                shouldShow = true;
            }
            // else: 连续进场，不显示

            if (shouldShow) {
                markers.push({
                    time: time,
                    position: 'belowBar',
                    color: '#26a69a',  // 绿色
                    shape: 'arrowUp',
                    size: 0.7,
                    text: 'L-B ' + Number(entryLong).toFixed(2)
                });
            } else {
                // 不显示，只保留 time
                markers.push({ time: time });
            }

            prevLongEntry = Number(entryLong);
            prevLongExit = null; // 重置离场状态
        }

        // === 处理多头离场 ===
        if (exitLong !== null && exitLong !== undefined && !isNaN(Number(exitLong))) {
            markers.push({
                time: time,
                position: 'aboveBar',
                color: '#ef5350',  // 红色
                shape: 'arrowDown',
                size: 0.7,
                text: 'L-S ' + Number(exitLong).toFixed(2)
            });

            prevLongExit = Number(exitLong);
        }

        // === 处理空头进场 ===
        if (entryShort !== null && entryShort !== undefined && !isNaN(Number(entryShort))) {
            let shouldShow = false;

            if (prevShortExit !== null) {
                shouldShow = true;
            } else if (prevShortEntry === null) {
                shouldShow = true;
            }

            if (shouldShow) {
                markers.push({
                    time: time,
                    position: 'aboveBar',
                    color: '#ef5350',  // 红色
                    shape: 'arrowDown',
                    size: 0.7,
                    text: 'S-S ' + Number(entryShort).toFixed(2)
                });
            } else {
                markers.push({ time: time });
            }

            prevShortEntry = Number(entryShort);
            prevShortExit = null;
        }

        // === 处理空头离场 ===
        if (exitShort !== null && exitShort !== undefined && !isNaN(Number(exitShort))) {
            markers.push({
                time: time,
                position: 'belowBar',
                color: '#26a69a',  // 绿色
                shape: 'arrowUp',
                size: 0.7,
                text: 'S-B ' + Number(exitShort).toFixed(2)
            });

            prevShortExit = Number(exitShort);
        }
    }

    const perfEnd = performance.now();

    console.log(`[Performance] Position markers generation: ${(perfEnd - perfStart).toFixed(2)}ms - ${markers.length} markers from ${fileData.length} bars`);

    return markers;
}
