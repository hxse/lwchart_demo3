import type { SeriesItemConfig } from '../chartDashboard.types';
import type { ParsedFileContent } from '../../../utils/zipParser';
import type { SeriesConfig } from '../../../utils/chartTypes';
import { mapSeriesType } from '../../../components/lw-chart/logic/SeriesTypeMapper';
import { getOptionsForType, applyDefaultScaleMargins, DEFAULT_SCALE_MARGIN_TOP } from '../../../components/lw-chart/logic/SeriesOptionsBuilder';
import { extractValueSeriesData, extractMultiKeySeriesData } from './SeriesDataExtractor';
import { buildPositionArrowSeries } from './PositionMarkerBuilder';
import { buildSlTpLines } from './SlTpLineBuilder';
import { legacyIndicatorSeries, applyLegacyReferences, type LegacyIndicatorGroup } from '../../../indicators/legacy';
import { applyIndicatorCandleScale } from '../../../indicators/presentation';

export function buildLegacyPane(
    paneSeriesList: SeriesItemConfig[],
    paneIdx: number,
    slotIdx: number,
    files: ParsedFileContent[],
    groups: Map<string, LegacyIndicatorGroup>,
    showRiskLegend?: [boolean, boolean, boolean, boolean],
    tradingDecorations = true
): SeriesConfig[] {
    const paneSeries: SeriesConfig[] = [];
    const records = new Map<number, SeriesConfig>();

    // 分离普通系列、独立的HLine/VLine以及需要显示的参考线
    const hLineItems = paneSeriesList.filter(c => c.type === "hline");
    const vLineItems = paneSeriesList.filter(c => c.type === "vline");

    // 处理普通系列
    paneSeriesList.forEach((itemConfig, itemIndex) => {
        if (itemConfig.type === "hline" || itemConfig.type === "vline") return;
        if (!itemConfig.show && !itemConfig.showInLegend) return;
        if (!itemConfig.fileName || !itemConfig.dataName) return;

        // 严格匹配文件
        const file = files.find(f => f.filename === itemConfig.fileName);
        if (!file) {
            console.warn(`[Config] File not found: ${itemConfig.fileName}`);
            return;
        }
        if (!Array.isArray(file.data)) return;

        // 提取数据（使用拆分模块）
        let extracted;
        if (typeof itemConfig.dataName === 'string') {
            extracted = extractValueSeriesData(file.data, itemConfig.dataName, itemConfig.type, itemConfig.histogramOpt?.color, 'light', !!itemConfig.indicator);
        } else if (Array.isArray(itemConfig.dataName)) {
            extracted = extractMultiKeySeriesData(file.data, itemConfig.dataName);
        } else {
            return;
        }

        // 获取选项
        const lwcType = mapSeriesType(itemConfig.type) as any;
        const metadata = itemConfig.indicator ? legacyIndicatorSeries(itemConfig, groups.get(itemConfig.indicator.id)!, 'light') : undefined;
        let options = {
            ...(metadata?.options ?? getOptionsForType(itemConfig)),
            visible: !!itemConfig.show
        };

        // 智能应用 scaleMargins
        const isVolume = itemConfig.type === 'volume';
        const isMainSeries = lwcType === 'Candlestick' || lwcType === 'Bar';
        const paneHasVolume = paneSeriesList.some(item => item.type === 'volume');

        let finalOptions = options;
        if (!isVolume && !(isMainSeries && paneHasVolume) && !options.scaleMargins) {
            finalOptions = applyDefaultScaleMargins(options);
        }

        const record: SeriesConfig = {
            ...metadata,
            type: lwcType,
            data: extracted.data,
            pane: paneIdx,
            options: finalOptions,
            priceLines: [],
            name: metadata?.name ?? extracted.name,
            showInLegend: itemConfig.showInLegend ?? false
        };
        paneSeries.push(record); records.set(itemIndex, record);

        // 生成仓位标记（仅对第一个主图）
        let backtestFile: ParsedFileContent | undefined = undefined;
        if (tradingDecorations && slotIdx === 0 && isMainSeries && file.data.length > 0) {
            // 查找 backtest_result 文件
            backtestFile = files.find(f => {
                const filename = f.filename.toLowerCase();
                return filename.endsWith('backtest_result.parquet') ||
                    filename.endsWith('backtest_result.csv');
            });

            if (backtestFile && Array.isArray(backtestFile.data) && backtestFile.data.length > 0) {
                const firstRow = backtestFile.data[0];
                const hasPositionFields =
                    'entry_long_price' in firstRow ||
                    'entry_short_price' in firstRow ||
                    'exit_long_price' in firstRow ||
                    'exit_short_price' in firstRow;

                if (hasPositionFields) {
                    const arrowSeries = buildPositionArrowSeries(backtestFile.data, paneIdx, file.data);
                    if (arrowSeries) {
                        paneSeries.push(arrowSeries);
                    }
                }
            }
        }

        // 添加 SL/TP/TSL 价格线（仅第一个主图，使用拆分模块）
        if (slotIdx === 0 && isMainSeries && backtestFile && Array.isArray(backtestFile.data)) {
            const slTpSeries = buildSlTpLines(backtestFile.data, paneIdx, showRiskLegend);
            paneSeries.push(...slTpSeries);
        }
    });

    // 如果没有数据系列，但有 HLine 或 VLine，则注入一个透明的 Line 系列作为载体
    if (paneSeries.length === 0 && (hLineItems.length > 0 || vLineItems.length > 0)) {
        // 使用一个极小的数据集或者空数据集来初始化占位线
        // LWChart 需要一个系列来承载 priceLines 和 markers
        paneSeries.push({
            type: 'Line',
            data: [],
            pane: paneIdx,
            options: {
                visible: false,
                lastPriceAnimation: 0,
                priceLineVisible: false,
                baseLineVisible: false,
                crosshairMarkerVisible: false,
                autoscaleInfoProvider: () => ({
                    priceRange: {
                        minValue: 0,
                        maxValue: 100,
                    },
                }),
            },
            name: 'ReferenceLinesHolder',
            showInLegend: false
        });
    }

    // 处理独立的HLine（附加到第一个系列）
    if (paneSeries.length > 0) {
        const first = paneSeries[0];
        if (!first.priceLines) first.priceLines = [];

        // 处理独立的VLine（附加到第一个系列作为 Marker 或使用插件，此处简化为 Marker）
        if (vLineItems.length > 0) {
            if (!first.markers) first.markers = [];
            vLineItems.forEach(vl => {
                if (vl.vLineOpt && vl.show) {
                    const { value, color, label, ...passthrough } = vl.vLineOpt;
                    first.markers!.push({
                        time: value as any,
                        position: 'inBar',
                        color: color,
                        shape: 'arrowUp', // 临时占位，后续可扩展专用插件
                        text: label || 'VLine',
                        ...passthrough
                    });
                }
            });
        }
    }

    const candleScaleIds = paneSeries.filter(series => (series.type === 'Candlestick' || series.type === 'Bar')
        && series.options?.visible !== false && series.data.length).map(series => series.options?.priceScaleId ?? 'right');
    for (const [index, record] of records) {
        const annotation = paneSeriesList[index]!.indicator;
        if (annotation) applyIndicatorCandleScale(record, groups.get(annotation.id)!.spec, candleScaleIds);
    }
    applyLegacyReferences(paneSeriesList, paneIdx, groups, records, paneSeries[0], 'light');
    adjustVolumeMargins(paneSeries, paneSeriesList, records);
    return paneSeries;
}

/**
 * 调整 Pane 内的 Volume 与主系列边距
 * @param paneSeries Pane 中的系列配置
 * @param paneSeriesList 原始配置（用于读取 volumeOpt）
 */
function adjustVolumeMargins(
    paneSeries: SeriesConfig[],
    paneSeriesList: SeriesItemConfig[],
    records: Map<number, SeriesConfig>
): void {
    const volumeSeriesInPane = records.get(paneSeriesList.findIndex(item => item.type === 'volume'));

    if (volumeSeriesInPane && volumeSeriesInPane.options) {
        const volumeConfig = paneSeriesList.find(item => item.type === 'volume');
        const needAdjust = volumeConfig?.volumeOpt?.adjustMainSeries !== false;

        if (needAdjust) {
            const volumeMarginTop = volumeSeriesInPane.options.priceScaleMarginTop || 0.7;
            const seriesBottom = 1 - volumeMarginTop;

            paneSeries.forEach(series => {
                if (series !== volumeSeriesInPane) {
                    if (!series.options) series.options = {};
                    series.options.scaleMargins = {
                        top: DEFAULT_SCALE_MARGIN_TOP,
                        bottom: seriesBottom
                    };
                }
            });
        }
    }
}

