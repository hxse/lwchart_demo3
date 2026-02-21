# JSON 配置接口标准

本文档定义了 `chartConfig.json` 的核心接口结构。

## 📋 核心接口

### ChartConfigJSON 接口

```typescript
interface ChartConfigJSON {
  // 网格布局模板
  template: string;
  
  // 是否显示底部回测结果栏
  showBottomRow: boolean;
  
  // 默认视图模式
  viewMode: "chart" | "table";
  
  // 默认选中的内部文件名
  selectedInternalFileName: string;
  
  // 三维数组: [Grid Slots][Panes][Series]
  chart: SeriesItemConfig[][][];
  
  // 底部栏图表配置 (可选)
  bottomRowChart?: SeriesItemConfig[][][];

  // 风险线 Legend 显示设置 (sl, tp, tsl, psar)
  showRiskLegend?: [boolean, boolean, boolean, boolean];

  // 是否在所有图表中同时显示 Legend (默认 false)
  showLegendInAll?: boolean;
}
```

### SeriesItemConfig 接口

```typescript
interface SeriesItemConfig {
  // 系列类型 (注意: PositionArrow 和 SlTpLine 是由系统根据回测数据自动生成的，无需此处定义)
  type: "candle" | "line" | "histogram" | "volume" | "area" | "baseline" | "bar" | "hline" | "vline";
  
  // 数据源 (hline/vline 类型时可不填)
  fileName?: string;
  dataName?: string | string[];
  
  // 是否显示该系列
  show: boolean;

  // 是否在 Legend 中显示该系列的值 (默认 false)
  showInLegend?: boolean;
  
  // 各类型专用选项 (根据 type 填写，均支持透传，详见下方说明)
  candleOpt?: CandleOption;
  lineOpt?: LineOption;
  histogramOpt?: HistogramOption;
  volumeOpt?: VolumeOption;
  areaOpt?: AreaOption;
  baselineOpt?: BaselineOption;
  barOpt?: BarOption;
  hLineOpt?: HorizontalLineOption;
  vLineOpt?: VerticalLineOption;
}
```

### VolumeOption 接口
| 字段 | 类型 | 说明 |
|------|------|------|
| `priceScaleMarginTop` | `number` | (0-1) 叠加层顶部边距，默认 0.7 |
| `adjustMainSeries` | `boolean` | 是否自动调整同 Pane 主系列边距，默认 true |

## 🔀 属性透传机制

前端对**所有** `*Opt` 接口启用了透传支持。后端在 JSON 中写入的任何字段，只要是 [lightweight-charts 官方 API](https://tradingview.github.io/lightweight-charts/docs/api) 支持的属性，前端都会原样转发给渲染层，无需前端额外适配。

**工作原理**：前端会先设置一组默认值，再用后端传入的字段覆盖（`{...defaults, ...backendOpt}`）。后端传了就用后端的，没传就走前端默认值。

### 各系列类型可透传属性速查

| 系列类型 | Opt 字段 | 底层映射 | 常用透传属性 |
|---------|---------|---------|-------------|
| `candle` | `candleOpt` | `CandlestickSeriesOptions` | `upColor`, `downColor`, `wickUpColor`, `wickDownColor`, `borderVisible`, `borderUpColor`, `borderDownColor` |
| `bar` | `barOpt` | `BarSeriesOptions` | 同 candle + `openVisible`, `thinBars` |
| `line` | `lineOpt` | `LineSeriesOptions` | `color`, `lineWidth`(1-4), `lineStyle`(0-4), `lineType`(0-2), `lineVisible`, `pointMarkersVisible`, `crosshairMarkerVisible` |
| `histogram` | `histogramOpt` | `HistogramSeriesOptions` | `color`, `base` |
| `volume` | `volumeOpt` | `HistogramSeriesOptions` | `priceScaleMarginTop` |
| `area` | `areaOpt` | `AreaSeriesOptions` | `topColor`, `bottomColor`, `lineColor`, `lineWidth`, `lineStyle`, `lineVisible` |
| `baseline` | `baselineOpt` | `BaselineSeriesOptions` | `baseValue`, `topLineColor`, `bottomLineColor`, `topFillColor1`, `topFillColor2`, `bottomFillColor1`, `bottomFillColor2`, `lineWidth`, `lineStyle` |
| `hline` | `hLineOpt` | `PriceLineOptions` | `lineWidth`(1-4), `lineStyle`(0-4), `lineVisible`, `axisLabelVisible`, `axisLabelColor`, `axisLabelTextColor` |
| `vline` | `vLineOpt` | `SeriesMarker` | `shape`(`arrowUp`/`arrowDown`/`circle`/`square`), `size`(数字), `position`(`aboveBar`/`belowBar`/`inBar`) |

> `lineStyle` 枚举: 0=Solid, 1=Dotted, 2=Dashed, 3=LargeDashed, 4=SparseDotted
>
> `lineWidth` 取值: 1 \| 2 \| 3 \| 4

### 后端用法示例

```json
{
  "type": "line",
  "fileName": "data.parquet",
  "dataName": "ema20",
  "show": true,
  "lineOpt": {
    "color": "#ff9800",
    "lineWidth": 2,
    "lineStyle": 2,
    "lineType": 2,
    "pointMarkersVisible": true
  }
}
```

```json
{
  "type": "hline",
  "show": true,
  "hLineOpt": {
    "value": 70,
    "color": "red",
    "label": "RSI Overbought",
    "showLabel": true,
    "lineWidth": 2,
    "lineStyle": 2,
    "axisLabelColor": "#ff0000",
    "axisLabelTextColor": "#ffffff"
  }
}
```

### 后端 Pydantic 模型对照

以 `HorizontalLineOption` 为例，后端可以直接扩充字段：

```python
class HorizontalLineOption(BaseModel):
    color: str
    value: float
    label: Optional[str] = None
    showLabel: bool = False
    # 以下字段前端均支持透传 (不传则走前端默认值)
    lineWidth: Optional[int] = None       # 1-4
    lineStyle: Optional[int] = None       # 0-4
    lineVisible: Optional[bool] = None
    axisLabelVisible: Optional[bool] = None
    axisLabelColor: Optional[str] = None
    axisLabelTextColor: Optional[str] = None
```

其他系列类型同理：只需在对应的 Pydantic Model 中加字段，前端自动透传，无需联调。

## 🌟 布局模板选项

| 模板名称 | 说明 | Slots 数量 |
|---------|------|----------|
| `single` | 单图 | 1 |
| `vertical-1x1` | 垂直2图 | 2 |
| `horizontal-1x1` | 水平2图 | 2 |
| `vertical-1x1x1` | 垂直3图 | 3 |
| `horizontal-1x1x1` | 水平3图 | 3 |
| `vertical-1x2` | 垂直1大2小 | 3 |
| `horizontal-1x2` | 水平1大2小 | 3 |
| `grid-2x2` | 2x2网格 | 4 |

## ⚙️ 自动注入系列

当满足以下条件时，系统会自动在图表中注入特定系列：

### 1. PositionArrow (仓位标记)
- **触发条件**: 文件夹中存在 `backtest_result.parquet` 或 `backtest_result.csv`。
- **作用区域**: 仅自动注入到 Slot 0 的主图窗格。

### 2. SlTpLine (止损止盈连线)
- **触发条件**: 同样基于回测结果文件，且存在有效的 `sl_*/tp_*/tsl_*` 价格字段。
- **显示控制**: 可通过 `showRiskLegend` 进行精细化显隐控制。

---

[返回首页](../README.md)
