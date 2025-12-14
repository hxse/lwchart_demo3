import type { GridItem, ChartConfigJSON, SeriesItemConfig } from "./chartDashboard.types";
import EmptyGridItem from "../../components/EmptyGridItem.svelte";
import LWChart from "../../components/lw-chart/LWChart.svelte";
import type { ParsedFileContent } from "../../utils/zipParser";
import type { SeriesConfig } from "../../utils/seriesMatcher";
import { matchColumnsToSeries } from "../../utils/seriesMatcher";

// Helper: Convert user friendly type to LWChart type
function mapSeriesType(type: string): "Candlestick" | "Line" | "Histogram" | "Area" | "Baseline" | "Bar" | "HLine" | "VLine" {
    const t = type.toLowerCase();
    switch (t) {
        case "candle":
        case "candlestick": return "Candlestick";
        case "line": return "Line";
        case "bar": return "Bar";
        case "histogram": return "Histogram";
        case "volume": return "Histogram";  // Volume使用Histogram渲染
        case "area": return "Area";
        case "baseline": return "Baseline";
        case "hline": return "HLine";
        case "vline": return "VLine";
        default: return "Line";
    }
}

const defaultTop = 0.02
const defaultBottom = 0.02

// Helper: Apply default scale margins to options
function applyDefaultScaleMargins(options: any, top: number = defaultTop, bottom: number = defaultBottom): any {
    return {
        ...options,
        scaleMargins: {
            top,
            bottom
        }
    };
}

// Helper: Get options for a series based on its type
function getOptionsForType(config: SeriesItemConfig): any {
    // 默认值
    const DEFAULT_CANDLE_OPTIONS = {
        upColor: "#26a69a",
        downColor: "#ef5350",
        wickUpColor: "#26a69a",
        wickDownColor: "#ef5350",
        borderVisible: false,
    };

    switch (config.type) {
        case 'candle':
            return { ...DEFAULT_CANDLE_OPTIONS, ...config.candleOpt };
        case 'bar':
            return { ...DEFAULT_CANDLE_OPTIONS, ...config.barOpt };
        case 'line':
            return {
                lineWidth: 1.5,  // 线条粗细，默认1（更细）
                ...config.lineOpt
            };
        case 'histogram':
            return config.histogramOpt || {};
        case 'volume':
            // Volume默认配置（自动应用）
            const volumeOpt = config.volumeOpt || {};
            const marginTop = volumeOpt.priceScaleMarginTop || 0.7;

            return {
                priceFormat: { type: 'volume' },
                priceScaleId: '',
                scaleMargins: {
                    top: marginTop,
                    bottom: 0
                },
                ...volumeOpt
            };
        case 'area':
            return config.areaOpt || {};
        case 'baseline':
            return config.baselineOpt || {};
        default:
            return {};
    }
}

export function generateGridItemsFromConfig(
    config: ChartConfigJSON,
    files: ParsedFileContent[],
    syncHandlers?: {
        onRegister: (id: string, api: any) => void;
        onSync: (id: string, param: any) => void;
        onBottomClick?: (time: number) => void;
    }
): GridItem[] {
    const perfStart = performance.now();
    const gridItems: GridItem[] = [];
    const { chart: chartConfigs, showBottomRow } = config;

    // 三维遍历: [Grid Slots][Panes][Series]
    chartConfigs.forEach((slotPanes, slotIdx) => {
        const allPaneSeries: SeriesConfig[][] = [];

        // 遍历Panes
        slotPanes.forEach((paneSeriesList, paneIdx) => {
            const paneSeries: SeriesConfig[] = [];

            // 分离普通系列和独立的HLine/VLine
            const seriesItems = paneSeriesList.filter(c => !["hline", "vline"].includes(c.type));
            const hLineOnlyItems = paneSeriesList.filter(c => c.type === "hline");

            // 处理普通系列
            seriesItems.forEach(itemConfig => {
                if (!itemConfig.show) return;
                if (!itemConfig.fileName || !itemConfig.dataName) return;

                // 严格匹配文件
                const file = files.find(f => f.filename === itemConfig.fileName);
                if (!file) {
                    console.warn(`[Config] File not found: ${itemConfig.fileName}`);
                    return;
                }
                if (!Array.isArray(file.data)) return;

                // 提取数据
                let seriesData: any[] = [];

                if (typeof itemConfig.dataName === 'string') {
                    const key = itemConfig.dataName;
                    const rawData = file.data.map((row: any) => {
                        const val = row[key];
                        return {
                            time: row.time,
                            value: (val === null || val === undefined || isNaN(Number(val))) ? null : Number(val)
                        };
                    });

                    // 过滤掉time或value为null的数据点
                    seriesData = rawData.filter((d: any) => {
                        const validTime = d.time !== null && d.time !== undefined;
                        const validValue = d.value !== null && d.value !== undefined && !isNaN(d.value);
                        return validTime && validValue;
                    });

                    // 过滤null值（静默）

                    // Volume类型：自动设置涨跌颜色
                    if (itemConfig.type === 'volume') {
                        // 查找同文件的OHLC数据用于判断涨跌
                        if (file.data.length > 0 && file.data[0].close !== undefined && file.data[0].open !== undefined) {
                            seriesData = seriesData.map((vol: any) => {
                                const ohlcRow = file.data.find((r: any) => r.time === vol.time);
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
                    }
                } else if (Array.isArray(itemConfig.dataName)) {
                    const keys = itemConfig.dataName as string[];
                    seriesData = file.data.map((row: any) => {
                        const newRow: any = { time: row.time };
                        keys.forEach(k => {
                            newRow[k] = row[k];
                        });
                        return newRow;
                    });
                }

                // 获取选项
                const lwcType = mapSeriesType(itemConfig.type) as any;
                let options = getOptionsForType(itemConfig);

                // 处理附属的价格线
                const priceLines: any[] = [];
                if (itemConfig.hLineOpt) {
                    priceLines.push({
                        price: itemConfig.hLineOpt.value,
                        color: itemConfig.hLineOpt.color,
                        lineWidth: 1,
                        lineStyle: 1,
                        axisLabelVisible: true,
                        title: itemConfig.hLineOpt.label || ''
                    });
                }

                // Series添加（静默）

                // 智能应用scaleMargins
                // 排除：1. volume类型（有特殊的priceScaleMarginTop）
                //       2. 主系列如果同Pane有volume（后面会特殊处理）
                const isVolume = itemConfig.type === 'volume';
                const isMainSeries = lwcType === 'Candlestick' || lwcType === 'Bar';
                const paneHasVolume = paneSeriesList.some(item => item.type === 'volume');

                let finalOptions = options;
                if (!isVolume && !(isMainSeries && paneHasVolume)) {
                    // 只给普通series添加默认边距
                    finalOptions = applyDefaultScaleMargins(options);
                }

                paneSeries.push({
                    type: lwcType,
                    data: seriesData,
                    pane: paneIdx,
                    options: finalOptions,
                    priceLines: priceLines,
                    name: (typeof itemConfig.dataName === 'string') ? itemConfig.dataName : 'OHLC'
                });
            });

            // 处理独立的HLine（附加到第一个系列）
            if (paneSeries.length > 0) {
                const first = paneSeries[0];
                if (!first.priceLines) first.priceLines = [];

                hLineOnlyItems.forEach(hl => {
                    if (hl.hLineOpt && hl.show) {
                        // 检测是否是RSI center线（通常label包含"center"或value=50）
                        const label = hl.hLineOpt.label || '';
                        const isRSICenter = label.toLowerCase().includes('center') ||
                            label.toLowerCase().includes('rsi') && hl.hLineOpt.value === 50;

                        first.priceLines!.push({
                            price: hl.hLineOpt.value,
                            color: hl.hLineOpt.color,
                            lineWidth: isRSICenter ? 2 : 1,  // RSI center更粗
                            lineStyle: 0,  // 实线
                            axisLabelVisible: true,
                            title: ''   // 不显示label
                        });
                    }
                });
            }

            // 检查是否有volume且overlay=false，需要调整主系列边距
            const volumeSeriesInPane = paneSeries.find(s =>
                s.name && typeof s.name === 'string' && s.name.toLowerCase().includes('volume')
            );

            if (volumeSeriesInPane && volumeSeriesInPane.options) {
                const volumeConfig = paneSeriesList.find(item => item.type === 'volume');

                // 如果volume的adjustMainSeries不为false（默认true），调整同Pane所有series
                const needAdjust = volumeConfig?.volumeOpt?.adjustMainSeries !== false;

                if (needAdjust) {
                    // 动态计算边距，确保与volume无缝衔接
                    const volumeMarginTop = volumeSeriesInPane.options.priceScaleMarginTop || 0.7;
                    const seriesBottom = 1 - volumeMarginTop;  // 例如: 1-0.9=0.1

                    // 调整同Pane所有非Volume的series
                    paneSeries.forEach(series => {
                        if (series !== volumeSeriesInPane) {  // 排除volume自己
                            if (!series.options) series.options = {};
                            series.options.scaleMargins = {
                                top: defaultTop,
                                bottom: seriesBottom
                            };
                        }
                    });
                    // Volume调整完成（静默）
                }
            }

            if (paneSeries.length > 0) {
                allPaneSeries.push(paneSeries);
            }
        });

        // 为每个Slot创建GridItem（所有Pane组合在一起）
        if (allPaneSeries.length > 0) {
            const chartId = `chart-slot-${slotIdx}`;
            const flatSeries = allPaneSeries.flat();

            gridItems.push({
                id: chartId,
                component: LWChart,
                props: {
                    series: flatSeries,
                    fitContent: false,  // 改为false，初始显示最新数据
                    fitContentOnDblClick: true,  // 启用双击fitContent功能
                    chartOptions: {
                        timeScale: { timeVisible: true, secondsVisible: false }
                    },
                    onRegister: syncHandlers ? (api: any) => syncHandlers.onRegister(chartId, api) : undefined,
                    onCrosshairMove: syncHandlers ? (p: any) => syncHandlers.onSync(chartId, p) : undefined,
                }
            });
        } else {
            gridItems.push({
                id: `empty-slot-${slotIdx}`,
                component: EmptyGridItem,
                props: {}
            });
        }
    });

    // 处理底部栏（回测结果）
    if (showBottomRow) {
        const backtestFile = files.find(f =>
            f.filename.includes("backtest_result.csv") ||
            f.filename.includes("backtest_result.parquet")
        );

        if (backtestFile) {
            const backtestSeries = matchColumnsToSeries(backtestFile);
            if (backtestSeries.length > 0) {
                gridItems.push({
                    id: "bottom-row-backtest",
                    component: LWChart,
                    props: {
                        series: backtestSeries,
                        fitContent: true,
                        fitContentOnDblClick: true,  // 启用双出fitContent功能
                        chartOptions: {
                            handleScroll: true,
                            handleScale: true,
                            timeScale: { minBarSpacing: 0.001 }
                        },
                        onClick: syncHandlers?.onBottomClick ? (param: any) => {
                            console.log('[底栏点击] param:', param);
                            if (param.time) {
                                console.log('[底栏点击] 准备跳转到时间:', param.time);
                                syncHandlers.onBottomClick!(param.time);
                            } else {
                                console.warn('[底栏点击] param.time为空，无法跳转');
                            }
                        } : undefined,
                        onRegister: syncHandlers ? (api: any) => syncHandlers.onRegister("bottom-row-backtest", api) : undefined,
                        onCrosshairMove: syncHandlers ? (p: any) => syncHandlers.onSync("bottom-row-backtest", p) : undefined,
                    }
                });
            } else {
                gridItems.push({ id: "bottom-empty-data", component: EmptyGridItem, props: {} });
            }
        } else {
            gridItems.push({ id: "bottom-empty-file", component: EmptyGridItem, props: {} });
        }
    }

    // 性能统计
    const perfEnd = performance.now();
    const totalTime = perfEnd - perfStart;
    const totalSeries = gridItems.reduce((sum, item) => {
        if (item.props?.series) {
            return sum + item.props.series.length;
        }
        return sum;
    }, 0);

    console.log(`[Performance] Grid generation: ${totalTime.toFixed(2)}ms - ${gridItems.length} grids, ${totalSeries} series`);

    return gridItems;
}
