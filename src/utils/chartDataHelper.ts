export function parseChartData(data: any[]): any[] {
    if (!data || data.length === 0) return [];

    try {
        const firstRow = data[0];
        if (!("time" in firstRow)) {
            return data;
        }

        // 预先获取所有字段名（只做一次）
        const keys = Object.keys(firstRow);
        const hasTime = keys.includes('time');
        if (!hasTime) return data;

        // 直接修改原数组，避免创建新对象
        const processed: any[] = [];

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            let time: number | string = row.time;

            // BigInt -> Number
            if (typeof time === "bigint") {
                time = Number(time);
            }

            // String -> Number
            if (typeof time === "string") {
                const numTime = Number(time);
                if (!isNaN(numTime)) {
                    time = numTime;
                }
            }

            // 时间单位转换（纳秒/微秒/毫秒 -> 秒）
            if (typeof time === "number") {
                if (time > 10000000000000000) {
                    time = Math.floor(time / 1000000000);
                } else if (time > 10000000000000) {
                    time = Math.floor(time / 1000000);
                } else if (time > 10000000000) {
                    time = Math.floor(time / 1000);
                }
            }

            // 只在需要时创建新对象
            const needsTransform = time !== row.time || keys.some(key => {
                if (key === 'time') return false;
                const val = row[key];
                return typeof val === 'bigint' ||
                    (typeof val === 'number' && isNaN(val)) ||
                    (typeof val === 'string' && (val.toLowerCase() === 'nan' || val.toLowerCase() === 'null' || val.trim() === ''));
            });

            if (!needsTransform) {
                processed.push(row);
                continue;
            }

            // 需要转换时才创建新对象
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

        // 过滤null时间，假设大部分数据有效，避免filter
        const filtered: any[] = [];
        for (let i = 0; i < processed.length; i++) {
            if (processed[i].time !== null && processed[i].time !== undefined) {
                filtered.push(processed[i]);
            }
        }

        // 排序（假设数据基本有序，TimSort快）
        filtered.sort((a, b) => (a.time as number) - (b.time as number));

        // 去重（假设重复少，提前退出）
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
