export function parseChartData(data: any[]): any[] {
    if (!data || data.length === 0) return [];

    // 纯粹的时间转换逻辑
    try {
        const firstRow = data[0];
        if (!("time" in firstRow)) {
            // console.log("数据缺少 'time' 字段，跳过转换");
            return data;
        }

        return data.map((row) => {
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
                if (typeof val === 'string') {
                    // Try parse float
                    // However, keep non-numeric strings as is (e.g. IDs, names)
                    const num = parseFloat(val);
                    if (!isNaN(num)) {
                        newRow[key] = num;
                    }
                }
            });

            return newRow;
        });
    } catch (e) {
        console.error("解析数据时间失败:", e);
        return data;
    }
}
