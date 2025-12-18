/**
 * 检测时间列的类型和需要的转换
 */
interface TimeTransform {
    needsConversion: boolean;
    isBigInt: boolean;
    isString: boolean;
    timeUnit: 'nano' | 'micro' | 'milli' | 'second';
}

function detectTimeTransform(sampleRows: any[]): TimeTransform {
    if (sampleRows.length === 0) {
        return { needsConversion: false, isBigInt: false, isString: false, timeUnit: 'second' };
    }

    // 检查前几行数据以确定时间类型
    const firstTime = sampleRows[0].time;
    const isBigInt = typeof firstTime === 'bigint';
    const isString = typeof firstTime === 'string';

    // 转换为数字以检测单位
    let numTime: number;
    if (isBigInt) {
        numTime = Number(firstTime);
    } else if (isString) {
        numTime = Number(firstTime);
    } else {
        numTime = firstTime;
    }

    // 检测时间单位
    let timeUnit: 'nano' | 'micro' | 'milli' | 'second' = 'second';
    if (numTime > 10000000000000000) {
        timeUnit = 'nano';
    } else if (numTime > 10000000000000) {
        timeUnit = 'micro';
    } else if (numTime > 10000000000) {
        timeUnit = 'milli';
    }

    return {
        needsConversion: isBigInt || isString || timeUnit !== 'second',
        isBigInt,
        isString,
        timeUnit
    };
}

/**
 * 快速时间转换（针对已知类型优化）
 */
function convertTime(time: any, transform: TimeTransform): number {
    let numTime: number;

    if (transform.isBigInt) {
        numTime = Number(time);
    } else if (transform.isString) {
        numTime = Number(time);
        if (isNaN(numTime)) return time; // 保持原值
    } else {
        numTime = time;
    }

    // 单位转换
    switch (transform.timeUnit) {
        case 'nano':
            return Math.floor(numTime / 1000000000);
        case 'micro':
            return Math.floor(numTime / 1000000);
        case 'milli':
            return Math.floor(numTime / 1000);
        default:
            return numTime;
    }
}

export function parseChartData(data: any[]): any[] {
    if (!data || data.length === 0) return [];

    try {
        const firstRow = data[0];
        if (!("time" in firstRow)) {
            return data;
        }

        // 获取列名
        const keys = Object.keys(firstRow);

        // 检测时间转换需求（采样前10行）
        const sampleSize = Math.min(10, data.length);
        const sampleRows = data.slice(0, sampleSize);
        const timeTransform = detectTimeTransform(sampleRows);

        // 检测是否需要值转换（采样检测）
        // 检查是否存在: bigint、NaN、字符串类型的值
        let needsValueTransform = false;
        for (const row of sampleRows) {
            for (const key of keys) {
                if (key === 'time') continue;
                const val = row[key];
                if (typeof val === 'bigint' ||
                    (typeof val === 'number' && isNaN(val)) ||
                    typeof val === 'string') {
                    // 只要有字符串类型的值，就需要转换（CSV 数据都是字符串）
                    needsValueTransform = true;
                    break;
                }
            }
            if (needsValueTransform) break;
        }

        // 快速路径：如果不需要任何转换
        if (!timeTransform.needsConversion && !needsValueTransform) {
            // 仍需要排序和去重
            const sorted = [...data].sort((a, b) => a.time - b.time);

            if (sorted.length < 2) return sorted;

            const uniqueData = [sorted[0]];
            let lastTime = sorted[0].time;

            for (let i = 1; i < sorted.length; i++) {
                const t = sorted[i].time;
                if (t > lastTime) {
                    uniqueData.push(sorted[i]);
                    lastTime = t;
                }
            }

            return uniqueData;
        }

        // 需要转换的路径
        const processed: any[] = [];

        for (let i = 0; i < data.length; i++) {
            const row = data[i];

            // 转换时间
            const time = timeTransform.needsConversion
                ? convertTime(row.time, timeTransform)
                : row.time;

            // 如果不需要值转换，直接复用行对象
            if (!needsValueTransform) {
                if (time !== row.time) {
                    processed.push({ ...row, time });
                } else {
                    processed.push(row);
                }
                continue;
            }

            // 需要值转换
            const newRow: any = { time };

            for (let j = 0; j < keys.length; j++) {
                const key = keys[j];
                if (key === 'time') continue;

                let val = row[key];

                // BigInt -> Number
                if (typeof val === 'bigint') {
                    newRow[key] = Number(val);
                    continue;
                }

                // NaN -> null
                if (typeof val === 'number') {
                    newRow[key] = isNaN(val) ? null : val;
                    continue;
                }

                // String处理
                if (typeof val === 'string') {
                    const lowerVal = val.toLowerCase();
                    if (lowerVal === "nan" || lowerVal === 'null' || val.trim() === '') {
                        newRow[key] = null;
                        continue;
                    }

                    const num = Number(val);
                    newRow[key] = isNaN(num) ? val : num;
                    continue;
                }

                newRow[key] = val;
            }

            processed.push(newRow);
        }

        // 过滤null时间
        const filtered: any[] = [];
        for (let i = 0; i < processed.length; i++) {
            if (processed[i].time !== null && processed[i].time !== undefined) {
                filtered.push(processed[i]);
            }
        }

        // 排序
        filtered.sort((a, b) => (a.time as number) - (b.time as number));

        // 去重
        if (filtered.length < 2) return filtered;

        const uniqueData = [filtered[0]];
        let lastTime = filtered[0].time as number;

        for (let i = 1; i < filtered.length; i++) {
            const t = filtered[i].time as number;
            if (t > lastTime) {
                uniqueData.push(filtered[i]);
                lastTime = t;
            }
        }

        return uniqueData;
    } catch (e) {
        console.error("解析数据时间失败:", e);
        return data;
    }
}
