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

            // 1. String -> Number
            if (typeof time === "string") {
                const numTime = Number(time);
                if (!isNaN(numTime)) {
                    time = numTime;
                }
            }

            // 2. Milliseconds -> Seconds (if > 10 digits)
            if (typeof time === "number" && time > 10000000000) {
                time = Math.floor(time / 1000);
            }

            const newRow: any = { ...row, time };

            // Convert other numeric fields
            Object.keys(row).forEach(key => {
                if (key === 'time') return;
                const val = row[key];

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

                    // Try parse float
                    const num = parseFloat(val);
                    if (!isNaN(num)) {
                        newRow[key] = num;
                    } else {
                        // If it's a string that can't be parsed
                        newRow[key] = null;
                    }
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
