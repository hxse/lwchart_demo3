/**
 * 系列数据提取器
 * 负责从原始文件数据中提取并转换为图表系列所需的数据格式
 */

/**
 * 提取后的系列数据
 */
export interface ExtractedSeriesData {
    data: any[];
    name: string;
}

/**
 * 提取单值系列数据（适用于 line, histogram, area 等类型）
 * @param fileData 原始文件数据数组（每行包含 time 和各种字段）
 * @param dataName 要提取的字段名
 * @param seriesType 系列类型（用于特殊处理如 volume）
 * @returns 提取后的系列数据
 */
export function extractValueSeriesData(
    fileData: any[],
    dataName: string,
    seriesType?: string
): ExtractedSeriesData {
    const rawData = fileData.map((row: any) => {
        const val = row[dataName];
        return {
            time: row.time,
            value: (val === null || val === undefined || isNaN(Number(val))) ? null : Number(val)
        };
    });

    // 过滤掉 time 或 value 为 null 的数据点
    let seriesData = rawData.filter((d: any) => {
        const validTime = d.time !== null && d.time !== undefined;
        const validValue = d.value !== null && d.value !== undefined && !isNaN(d.value);
        return validTime && validValue;
    });

    // Volume 类型：自动设置涨跌颜色
    if (seriesType === 'volume') {
        seriesData = applyVolumeColors(seriesData, fileData);
    }

    return {
        data: seriesData,
        name: dataName
    };
}

/**
 * 提取多键系列数据（适用于 candle, bar 等 OHLC 类型）
 * @param fileData 原始文件数据数组
 * @param dataNames 要提取的字段名数组（如 ['open', 'high', 'low', 'close']）
 * @returns 提取后的系列数据
 */
export function extractMultiKeySeriesData(
    fileData: any[],
    dataNames: string[]
): ExtractedSeriesData {
    const seriesData = fileData.map((row: any) => {
        const newRow: any = { time: row.time };
        dataNames.forEach(k => {
            newRow[k] = row[k];
        });
        return newRow;
    });

    return {
        data: seriesData,
        name: 'OHLC'
    };
}

/**
 * 为 Volume 数据应用涨跌颜色
 * @param volumeData volume 系列数据
 * @param fileData 原始文件数据（用于查找对应的 OHLC）
 * @returns 带颜色的 volume 数据
 */
function applyVolumeColors(volumeData: any[], fileData: any[]): any[] {
    // 检查是否有 OHLC 数据
    if (fileData.length === 0 ||
        fileData[0].close === undefined ||
        fileData[0].open === undefined) {
        return volumeData;
    }

    return volumeData.map((vol: any) => {
        const ohlcRow = fileData.find((r: any) => r.time === vol.time);
        if (ohlcRow && ohlcRow.close !== undefined && ohlcRow.open !== undefined) {
            const isUp = Number(ohlcRow.close) >= Number(ohlcRow.open);
            return {
                ...vol,
                color: isUp ? '#26a69a' : '#ef5350'  // 涨绿跌红
            };
        }
        return vol;
    });
}
