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
   - 共享同一个价格轴和时间轴
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
}
```

### SeriesItemConfig 接口

```typescript
interface SeriesItemConfig {
  // 运行时自动分配的全局顺序索引（从0开始）
  // 前端自动生成，配置文件中无需提供
  idx?: number;
  
  // 系列类型
  type: "candle" | "line" | "histogram" | "area" | "baseline" | "bar" | "hline" | "vline";
  
  // 数据源（hline/vline 类型时可不填）
  fileName?: string;
  dataName?: string | string[];
  
  // 是否显示
  show: boolean;
  
  // 各类型专用选项（根据 type 只填写对应的选项）
  candleOpt?: CandleOption;
  lineOpt?: LineOption;
  histogramOpt?: HistogramOption;
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

## 📝 完整配置示例

```json
{
  "template": "vertical-1x3",
  "showBottomRow": true,
  "viewMode": "chart",
  "selectedInternalFileName": "data_dict/source_ohlcv_15m.parquet",
  
  "chart": [
    // ========== Grid Slot 0: 15分钟周期 ==========
    [
      // ----- Pane 0: 主图 -----
      [
        {
          "type": "candle",
          "show": true,
          "fileName": "data_dict/source_ohlcv_15m.parquet",
          "dataName": ["open", "high", "low", "close"],
          "candleOpt": {
            "upColor": "#26a69a",
            "downColor": "#ef5350",
            "borderVisible": false
          }
        },
        {
          "type": "histogram",
          "show": true,
          "fileName": "data_dict/source_ohlcv_15m.parquet",
          "dataName": "volume",
          "histogramOpt": {
            "color": "#26a69a"
          }
        },
        {
          "type": "line",
          "show": true,
          "fileName": "backtest_results/indicators_ohlcv_15m.parquet",
          "dataName": "bbands_upper",
          "lineOpt": {
            "color": "#1f77b4",
            "lineWidth": 2,
            "lineStyle": 0
          }
        },
        {
          "type": "line",
          "show": true,
          "fileName": "backtest_results/indicators_ohlcv_15m.parquet",
          "dataName": "bbands_middle",
          "lineOpt": {
            "color": "#ff7f0e",
            "lineWidth": 2,
            "lineStyle": 0
          }
        },
        {
          "type": "line",
          "show": true,
          "fileName": "backtest_results/indicators_ohlcv_15m.parquet",
          "dataName": "bbands_lower",
          "lineOpt": {
            "color": "#2ca02c",
            "lineWidth": 2,
            "lineStyle": 0
          }
        }
      ],
      
      // ----- Pane 1: RSI副图 -----
      [
        {
          "type": "line",
          "show": false,
          "fileName": "backtest_results/indicators_ohlcv_15m.parquet",
          "dataName": "bbands_bandwidth",
          "lineOpt": {
            "color": "#9467bd",
            "lineWidth": 2
          }
        }
      ],
      
      // ----- Pane 2: 另一个副图 -----
      [
        {
          "type": "line",
          "show": false,
          "fileName": "backtest_results/indicators_ohlcv_15m.parquet",
          "dataName": "bbands_percent",
          "lineOpt": {
            "color": "#8c564b",
            "lineWidth": 2
          }
        }
      ]
    ],
    
    // ========== Grid Slot 1: 1小时周期 ==========
    [
      // ----- Pane 0: 主图 -----
      [
        {
          "type": "candle",
          "show": true,
          "fileName": "data_dict/source_ohlcv_1h.parquet",
          "dataName": ["open", "high", "low", "close"],
          "candleOpt": {
            "upColor": "#26a69a",
            "downColor": "#ef5350"
          }
        },
        {
          "type": "histogram",
          "show": true,
          "fileName": "data_dict/source_ohlcv_1h.parquet",
          "dataName": "volume"
        }
      ],
      
      // ----- Pane 1: RSI副图 -----
      [
        {
          "type": "line",
          "show": true,
          "fileName": "backtest_results/indicators_ohlcv_1h.parquet",
          "dataName": "rsi",
          "lineOpt": {
            "color": "#9467bd",
            "lineWidth": 2
          }
        },
        {
          "type": "hline",
          "show": true,
          "hLineOpt": {
            "value": 50.0,
            "color": "#faad14",
            "label": "rsi_center"
          }
        }
      ]
    ],
    
    // ========== Grid Slot 2: 4小时周期 ==========
    [
      // ----- Pane 0: 主图 -----
      [
        {
          "type": "candle",
          "show": true,
          "fileName": "data_dict/source_ohlcv_4h.parquet",
          "dataName": ["open", "high", "low", "close"]
        },
        {
          "type": "histogram",
          "show": true,
          "fileName": "data_dict/source_ohlcv_4h.parquet",
          "dataName": "volume"
        },
        {
          "type": "line",
          "show": true,
          "fileName": "backtest_results/indicators_ohlcv_4h.parquet",
          "dataName": "sma_0",
          "lineOpt": {
            "color": "#1f77b4",
            "lineWidth": 2
          }
        },
        {
          "type": "line",
          "show": true,
          "fileName": "backtest_results/indicators_ohlcv_4h.parquet",
          "dataName": "sma_1",
          "lineOpt": {
            "color": "#ff7f0e",
            "lineWidth": 2
          }
        }
      ]
    ]
  ]
}
```

---

## 🎯 配置最佳实践

### 1. 只输出有值的选项字段

❌ **不推荐**（冗余）:
```json
{
  "type": "line",
  "candleOpt": null,
  "histogramOpt": null,
  "lineOpt": {
    "color": "#1f77b4"
  },
  "hLineOpt": null
}
```

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
  // 不填 candleOpt，将使用默认颜色和样式
}
```

### 3. Pane 分组建议

- **主图 Pane**: 通常包含价格数据（Candle/Bar）+ 价格相关指标（MA, Bollinger等）
- **副图 Pane**: 每个独立的技术指标占一个 Pane（RSI, MACD, Volume等）
- **空 Pane**: 如果某个 Pane 暂时没有数据，传空数组 `[]`

### 4. show 字段用法

- `show: true` - 系列会被渲染
- `show: false` - 系列不会被渲染，但仍保留在配置中（方便后续动态显示）

---

## 🔄 URL 参数覆盖（浏览器模式）

浏览器模式支持通过 URL 参数覆盖部分配置：

```
http://.../?template=grid-2x2&viewMode=table&selectedZipFileName=result.zip&isShow=2,0&isShow=5,1
```

### 支持的覆盖参数

| 参数名 | 说明 | 示例 |
|-------|------|------|
| `template` | 覆盖布局模板 | `template=grid-2x2` |
| `viewMode` | 覆盖视图模式 | `viewMode=table` |
| `selectedInternalFileName` | 选中的内部文件 | `selectedInternalFileName=data.csv` |
| `selectedZipFileName` | 自动加载的ZIP文件名 | `selectedZipFileName=result.zip` |
| `isShow` | 覆盖系列显隐状态 | `isShow=2,0` (隐藏idx=2的系列) |

> **注意**: `isShow` 参数使用的是运行时分配的 `idx` 索引，格式为 `idx,status`（1=显示, 0=隐藏）。

---

## 📚 相关文档

- [图表系列选项参考](./chart_series_options.md) - 各图表类型的详细选项字段说明
