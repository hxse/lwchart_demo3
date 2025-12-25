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
  
  // 各类型专用选项 (根据 type 填写)
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
