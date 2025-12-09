export function parseChartData(data: any[]): any[] {
    if (!data || data.length === 0) return [];

    // 纯粹的时间转换逻辑
    try {
        const firstRow = data[0];
        if (!("time" in firstRow)) {
            // console.log("数据缺少 'time' 字段，跳过转换");
            return data;
        }

        const new_data = data.map((row) => {
            let time: number | string = row.time;

            // 0. Handle BigInt (often from Parquet)
            if (typeof time === "bigint") {
                // Determine if we need to scale down (e.g. nanoseconds to seconds)
                // BigInt doesn't support decimals, so divide first then Number, or Number then divide.
                // Number(time) might lose precision if > 2^53, but for timestamps (13-19 digits) it's usually fine for "seconds" precision.
                // Let's safe cast.
                time = Number(time);
            }

            // 1. String -> Number
            if (typeof time === "string") {
                const numTime = Number(time);
                if (!isNaN(numTime)) {
                    time = numTime;
                }
            }

            // 2. Milliseconds/Nanoseconds -> Seconds
            // Standard unix timestamp (seconds) is ~1.7e9 (10 digits)
            // Milliseconds is ~1.7e12 (13 digits)
            // Microseconds is ~1.7e15 (16 digits)
            // Nanoseconds is ~1.7e18 (19 digits)

            if (typeof time === "number") {
                if (time > 10000000000000000) {
                    // Likely Nanoseconds (19 digits), divide by 1e9
                    time = Math.floor(time / 1000000000);
                } else if (time > 10000000000000) {
                    // Likely Microseconds (16 digits), divide by 1e6
                    time = Math.floor(time / 1000000);
                } else if (time > 10000000000) {
                    // Likely Milliseconds (13 digits), divide by 1e3
                    time = Math.floor(time / 1000);
                }
            }

            const newRow: any = { ...row, time };

            // Convert other numeric fields
            Object.keys(row).forEach(key => {
                if (key === 'time') return;
                let val = row[key];

                // Handle BigInt for values
                if (typeof val === 'bigint') {
                    val = Number(val);
                    newRow[key] = val;
                    return;
                }

                // Handle explicit number conversion
                if (typeof val === 'number') {
                    if (isNaN(val)) {
                        newRow[key] = null; // Convert actual NaN number to null
                    }
                    return;
                }

                if (typeof val === 'string') {
                    // Check for "nan", "NaN", "null" strings
                    const lowerVal = val.toLowerCase();
                    if (lowerVal == "nan" || lowerVal === 'null' || val.trim() === '') {
                        newRow[key] = null;
                        return;
                    }

                    // Try strict number conversion
                    const num = Number(val);
                    if (!isNaN(num)) {
                        newRow[key] = num;
                    }
                    // Else: keep as original string (e.g. date usually)
                }
            });

            return newRow;
        });

        const filtered_data = new_data.filter((row: any) => row.time !== null);
        filtered_data.sort((a, b) => (a.time as number) - (b.time as number));

        // Deduplicate
        const uniqueData = [];
        let lastTime = -Infinity;
        for (const row of filtered_data) {
            const t = row.time as number;
            // Ensure strictly ascending
            if (t > lastTime) {
                uniqueData.push(row);
                lastTime = t;
            }
        }
        return uniqueData;
    } catch (e) {
        console.error("解析数据时间失败:", e);
        return data;
    }
}
