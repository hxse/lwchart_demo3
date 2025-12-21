# Chart Dashboard 配置文件结构说明

本文档描述 Chart Dashboard 的配置文件结构（v3.0 - 三维数组架构）。

---

## 📁 配置文件位置

ZIP 文件根目录必须包含 `chartConfig.json`。

---

## 🏗️ 三层架构设计

配置文件采用**三维数组结构**，精确映射前端的三层渲染架构：

```
Chart 配置 [Grid Slots][Panes][Series]
    │
    ├─ Grid Slot 0 (例: 15分钟周期)
    │   ├─ Pane 0 (主图)
    │   │   ├─ Series: Candle
    │   │   ├─ Series: Volume Histogram
    │   │   └─ Series: Bollinger Bands Lines
    │   ├─ Pane 1 (副图1)
    │   │   └─ Series: RSI
    │   └─ Pane 2 (副图2)
    │       └─ Series: MACD
    │
    ├─ Grid Slot 1 (例: 1小时周期)
    │   └─ ...
    │
    └─ Grid Slot 2 (例: 4小时周期)
        └─ ...
```

### 层级说明

1. **第一层 - Grid Slots（网格插槽）**
   - 对应 GridTemplate 的不同插槽
   - 通常用于显示不同时间周期的图表
   - 例: `[15m图表, 1h图表, 4h图表]`

2. **第二层 - Panes（窗格）**
   - 对应 Lightweight Charts 中的多价格轴窗格
   - 在同一个图表中垂直排列
   - 例: `[主图Pane, RSI副图Pane, MACD副图Pane]`
   - **关键**: Pane索引由数组位置决定，无需手动指定 `position` 字段

3. **第三层 - Series（系列）**
   - 同一个 Pane 内的多条线/蜡烛图/直方图
   - 共享同一个价格轴 and 时间轴
   - 例: `[蜡烛图, 布林带上轨, 布林带中轨, 布林带下轨]`

---

## 📋 配置文件结构

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
  
  // 底部栏图表配置（可选）
  // 如果 showBottomRow 为 true 但此字段为空，显示空白
  bottomRowChart?: SeriesItemConfig[][];  // [Panes][Series]
}
```

### SeriesItemConfig 接口

```typescript
interface SeriesItemConfig {
  // 运行时自动分配的全局顺序索引（从0开始）
  // 前端自动生成，配置文件中无需提供
  idx?: number;
  
  // 系列类型
  type: "candle" | "line" | "histogram" | "volume" | "area" | "baseline" | "bar" | "hline" | "vline";
  
  // 数据源（hline/vline 类型时可不填）
  fileName?: string;
  dataName?: string | string[];
  
  // 是否显示该系列
  show: boolean;

  // 是否在 Legend 中显示该系列的值（默认 false）
  showInLegend?: boolean;
  
  // 各类型专用选项（根据 type 只填写对应的选项）
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

> **重要**: 每个 Series **只需填写与其 `type` 对应的选项字段**。例如：
> - `type: "candle"` → 只填 `candleOpt`
> - `type: "line"` → 只填 `lineOpt`
> - `type: "hline"` → 只填 `hLineOpt`

详细的选项字段定义请参考 [图表系列选项参考](./chart_series_options.md)。

---

## 🌟 布局模板选项

`template` 字段支持以下值：

| 模板名称 | 说明 | Slots数量 |
|---------|------|----------|
| `single` | 单图 | 1 |
| `vertical-1x1` | 垂直2图 | 2 |
| `horizontal-1x1` | 水平2图 | 2 |
| `vertical-1x2` | 垂直1大2小 | 3 |
| `horizontal-1x2` | 水平1大2小 | 3 |
| `grid-2x2` | 2x2网格 | 4 |
| `vertical-1x1x1` | 垂直3图 | 3 |
| `horizontal-1x1x1` | 水平3图 | 3 |

---

## 📊 bottomRowChart 字段说明

### 概述

`bottomRowChart` 是可选字段，用于显式定义底部栏的图表内容。

**数据结构**: 二维数组 `[Panes][Series]`

- **第一维（Panes）**: 底部栏中的不同窗格
- **第二维（Series）**: 每个窗格中的系列

### 与主图的区别

| 字段 | 结构 | 说明 |
|------|------|------|
| `chart` | `[Slots][Panes][Series]` | 主图表，支持多个网格插槽 |
| `bottomRowChart` | `[Panes][Series]` | 底部栏，仅一个固定区域 |

### 配置示例

#### 单 Pane 多 Series（最常见）

```json
{
  "showBottomRow": true,
  "bottomRowChart": [
    [  // Pane 0
      {
        "type": "line",
        "show": true,
        "fileName": "backtest_result.parquet",
        "dataName": "balance",
        "lineOpt": {
          "color": "#2962FF",
          "lineWidth": 2
        }
      },
      {
        "type": "line",
        "show": true,
        "fileName": "backtest_result.parquet",
        "dataName": "equity",
        "lineOpt": {
          "color": "#FF6D00",
          "lineWidth": 2
        }
      }
    ]
  ]
}
```

#### 多 Pane（分离显示）

```json
{
  "showBottomRow": true,
  "bottomRowChart": [
    [  // Pane 0: Balance
      {
        "type": "line",
        "show": true,
        "fileName": "backtest_result.parquet",
        "dataName": "balance",
        "lineOpt": {"color": "#2962FF", "lineWidth": 2}
      }
    ],
    [  // Pane 1: Equity
      {
        "type": "line",
        "show": true,
        "fileName": "backtest_result.parquet",
        "dataName": "equity",
        "lineOpt": {"color": "#FF6D00", "lineWidth": 2}
      }
    ]
  ]
}
```

### 降级处理

如果 `showBottomRow: true` 但 `bottomRowChart` 未定义或为空：
- ✅ 不会报错
- ⚠️ 显示空白底部栏
- 📝 控制台警告: `[BottomRow] showBottomRow is true but bottomRowChart is not defined`

---

## 📝 完整配置示例

```json
{
  "template": "vertical-1x2",
  "showBottomRow": true,
  "viewMode": "chart",
  "selectedInternalFileName": "data_dict/source_ohlcv_15m.csv"
  "chart": [
    [
      [
        {
          "type": "candle",
          "show": true,
          "showInLegend": true,
          "fileName": "data_dict/source_ohlcv_15m.csv",
          "dataName": [
            "open",
            "high",
            "low",
            "close"
          ]
        },
        {
          "type": "volume",
          "show": false,
          "showInLegend": false,
          "fileName": "data_dict/source_ohlcv_15m.csv",
          "dataName": "volume",
          "volumeOpt": {
            "priceScaleMarginTop": 0.9,
            "adjustMainSeries": true
          }
        },
        {
          "type": "line",
          "show": true,
          "showInLegend": false,
          "fileName": "backtest_results/indicators_ohlcv_15m.csv",
          "dataName": "bbands_upper"
        },
        {
          "type": "line",
          "show": true,
          "showInLegend": false,
          "fileName": "backtest_results/indicators_ohlcv_15m.csv",
          "dataName": "bbands_middle"
        },
        {
          "type": "line",
          "show": true,
          "showInLegend": false,
          "fileName": "backtest_results/indicators_ohlcv_15m.csv",
          "dataName": "bbands_lower"
        }
      ],
      [
        {
          "type": "line",
          "show": false,
          "showInLegend": false,
          "fileName": "backtest_results/indicators_ohlcv_15m.csv",
          "dataName": "bbands_bandwidth"
        }
      ],
      [
        {
          "type": "line",
          "show": false,
          "showInLegend": false,
          "fileName": "backtest_results/indicators_ohlcv_15m.csv",
          "dataName": "bbands_percent"
        }
      ]
    ],
    [
      [
        {
          "type": "candle",
          "show": true,
          "showInLegend": true,
          "fileName": "data_dict/source_ohlcv_1h.csv",
          "dataName": [
            "open",
            "high",
            "low",
            "close"
          ]
        },
        {
          "type": "volume",
          "show": false,
          "showInLegend": false,
          "fileName": "data_dict/source_ohlcv_1h.csv",
          "dataName": "volume",
          "volumeOpt": {
            "priceScaleMarginTop": 0.9,
            "adjustMainSeries": true
          }
        }
      ],
      [
        {
          "type": "line",
          "show": true,
          "showInLegend": false,
          "fileName": "backtest_results/indicators_ohlcv_1h.csv",
          "dataName": "rsi"
        },
        {
          "type": "hline",
          "show": true,
          "showInLegend": false,
          "hLineOpt": {
            "color": "#faad14",
            "value": 50.0,
            "label": "rsi_center"
          }
        }
      ]
    ],
    [
      [
        {
          "type": "candle",
          "show": true,
          "showInLegend": true,
          "fileName": "data_dict/source_ohlcv_4h.csv",
          "dataName": [
            "open",
            "high",
            "low",
            "close"
          ]
        },
        {
          "type": "volume",
          "show": false,
          "showInLegend": false,
          "fileName": "data_dict/source_ohlcv_4h.csv",
          "dataName": "volume",
          "volumeOpt": {
            "priceScaleMarginTop": 0.9,
            "adjustMainSeries": true
          }
        },
        {
          "type": "line",
          "show": true,
          "showInLegend": false,
          "fileName": "backtest_results/indicators_ohlcv_4h.csv",
          "dataName": "sma_0",
          "lineOpt": {
            "color": "#1f77b4",
            "lineWidth": 2
          }
        },
        {
          "type": "line",
          "show": true,
          "showInLegend": false,
          "fileName": "backtest_results/indicators_ohlcv_4h.csv",
          "dataName": "sma_1",
          "lineOpt": {
            "color": "#ff7f0e",
            "lineWidth": 2
          }
        }
      ]
    ]
  ],
  "bottomRowChart": [
    [
      {
        "type": "line",
        "show": true,
        "showInLegend": false,
        "fileName": "backtest_results/backtest_result.csv",
        "dataName": "balance",
        "lineOpt": {
          "color": "#2962FF",
          "lineWidth": 2
        }
      },
      {
        "type": "line",
        "show": true,
        "showInLegend": false,
        "fileName": "backtest_results/backtest_result.csv",
        "dataName": "equity",
        "lineOpt": {
          "color": "#FF6D00",
          "lineWidth": 2
        }
      }
    ]
  ]
}
```

---

## 🎯 配置最佳实践

### 1. 只输出有值的选项字段

✅ **推荐**（简洁）:
```json
{
  "type": "line",
  "lineOpt": {
    "color": "#1f77b4",
    "lineWidth": 2
  }
}
```

### 2. 利用默认值

大多数选项字段都有默认值，只需覆盖需要自定义的部分：

```json
{
  "type": "candle",
  "show": true,
  "fileName": "ohlcv.parquet",
  "dataName": ["open", "high", "low", "close"]
}
```

### 3. show 字段用法

- `show: true` - 系列会被渲染
- `show: false` - 系列不会被渲染

### 4. showInLegend 字段用法

- `showInLegend: true` - 该系列的值会显示在图表左上角的 Legend 中
- `showInLegend: false` - 不在 Legend 中显示（默认值）

---

## 🔄 URL 参数覆盖（浏览器模式）

浏览器模式支持通过 URL 参数覆盖部分配置：

```
http://.../?template=grid-2x2&viewMode=table&selectedZipFileName=result.zip&show=0,0,0,1&showInLegend=0,0,0,1
```

### 支持的覆盖参数

| 参数名 | 说明 | 示例 |
|-------|------|------|
| `template` | 覆盖布局模板 | `template=grid-2x2` |
| `viewMode` | 覆盖视图模式 | `viewMode=table` |
| `selectedInternalFileName` | 选中的内部文件 | `selectedInternalFileName=data.csv` |
| `selectedZipFileName` | 自动加载的ZIP文件名 | `selectedZipFileName=result.zip` |
| `show` | 覆盖指标显隐（三维坐标） | `show=0,0,0,1` |
| `showInLegend` | 覆盖 Legend 显隐（三维坐标） | `showInLegend=0,0,0,1` |
| `showRiskLegend` | 风险线 Legend 显示 (sl,tp,tsl,psar) | `showRiskLegend=1,0,0,1` |

> **注意**: `show` 和 `showInLegend` 使用相同的坐标格式：`slotIdx,paneIdx,seriesIdx,status`（1=显示/启用, 0=隐藏/禁用）。

---

## 📚 相关文档

- [图表系列选项参考](./chart_series_options.md) - 各图表类型的详细选项字段说明
- [Dashboard Override 配置覆盖使用指南](./dashboard_override_guide.md) - 详细了解覆盖机制
