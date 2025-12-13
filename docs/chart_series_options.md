# 图表系列选项参考

本文档详细说明每种图表类型支持的选项字段。后端生成配置文件时，请根据 `type` 字段**只填写对应的选项**。

---

## 🎨 通用说明

### 数据格式要求

所有时间序列数据都需要 `time` 字段（Unix时间戳，**单位：秒**）。

```json
{
  "time": 1699200000,  // Unix时间戳（秒）
  "value": 100.5       // 或其他数据字段
}
```

### 颜色格式

支持以下颜色格式：
- 十六进制: `"#26a69a"`
- RGB: `"rgb(38, 166, 154)"`
- RGBA（透明度）: `"rgba(38, 166, 154, 0.5)"`

---

## 1. Candlestick (蜡烛图)

### 基本配置

```json
{
  "type": "candle",
  "show": true,
  "fileName": "source_ohlcv.parquet",
  "dataName": ["open", "high", "low", "close"],
  "candleOpt": { /* 选项见下方 */ }
}
```

### CandleOption 字段

| 字段 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| `upColor` | `string` | 上涨蜡烛颜色 | `"#26a69a"` |
| `downColor` | `string` | 下跌蜡烛颜色 | `"#ef5350"` |
| `wickUpColor` | `string` | 上涨影线颜色 | 同 `upColor` |
| `wickDownColor` | `string` | 下跌影线颜色 | 同 `downColor` |
| `borderVisible` | `boolean` | 是否显示边框 | `true` |
| `borderUpColor` | `string` | 上涨边框颜色 | 同 `upColor` |
| `borderDownColor` | `string` | 下跌边框颜色 | 同 `downColor` |
| `wickVisible` | `boolean` | 是否显示影线 | `true` |

### 示例

```json
{
  "type": "candle",
  "show": true,
  "fileName": "source_ohlcv_15m.parquet",
  "dataName": ["open", "high", "low", "close"],
  "candleOpt": {
    "upColor": "#26a69a",
    "downColor": "#ef5350",
    "borderVisible": false,
    "wickUpColor": "#26a69a",
    "wickDownColor": "#ef5350"
  }
}
```

---

## 2. Line (折线图)

### 基本配置

```json
{
  "type": "line",
  "show": true,
  "fileName": "indicators.parquet",
  "dataName": "sma_50",
  "lineOpt": { /* 选项见下方 */ }
}
```

### LineOption 字段

| 字段 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| `color` | `string` | 线条颜色 | `"#2962FF"` |
| `lineWidth` | `number` | 线条宽度（像素） | `3` |
| `lineStyle` | `number` | 线条样式（见下表） | `0` |
| `lineType` | `number` | 线条类型（见下表） | `0` |
| `lineVisible` | `boolean` | 是否显示线条 | `true` |
| `pointMarkersVisible` | `boolean` | 是否显示数据点标记 | `false` |
| `crosshairMarkerVisible` | `boolean` | 是否显示十字光标标记 | `true` |

#### lineStyle 枚举

| 值 | 说明 |
|----|------|
| `0` | Solid（实线）**推荐** |
| `1` | Dotted（点线） |
| `2` | Dashed（虚线） |
| `3` | LargeDashed（大虚线） |
| `4` | SparseDotted（稀疏点线） |

#### lineType 枚举

| 值 | 说明 |
|----|------|
| `0` | Simple（简单连接）**推荐** |
| `1` | WithSteps（阶梯式） |
| `2` | Curved（平滑曲线） |

### 示例

```json
{
  "type": "line",
  "show": true,
  "fileName": "indicators.parquet",
  "dataName": "bbands_upper",
  "lineOpt": {
    "color": "#1f77b4",
    "lineWidth": 2,
    "lineStyle": 0
  }
}
```

---

## 3. Histogram (直方图)

### 基本配置

```json
{
  "type": "histogram",
  "show": true,
  "fileName": "indicators.parquet",
  "dataName": "some_indicator",
  "histogramOpt": { /* 选项见下方 */ }
}
```

### HistogramOption 字段

| 字段 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| `color` | `string` | 柱子颜色 | `"#26a69a"` |
| `base` | `number` | 基线值 | `0` |

### 示例

```json
{
  "type": "histogram",
  "show": true,
  "fileName": "indicators.parquet",
  "dataName": "rsi_histogram",
  "histogramOpt": {
    "color": "#2962FF",
    "base": 0
  }
}
```

---

## 4. Volume (成交量)

> **说明**: Volume已作为独立类型，专门用于成交量柱状图显示。

### 基本配置

```json
{
  "type": "volume",
  "show": true,
  "fileName": "source_ohlcv_15m.parquet",
  "dataName": "volume",
  "volumeOpt": { /* 选项见下方 */ }
}
```

### VolumeOption 字段（用户可配置）

| 字段 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| `priceScaleMarginTop` | `number` | 叠加层顶部边距（0-1）<br/>例如 `0.7` 表示volume占据底部30% | `0.7` |
| `adjustMainSeries` | `boolean` | 是否自动调整同Pane主系列避免重叠 | `true` |

### 自动功能（无需配置）

前端会**自动**执行以下操作：

1. ✅ **涨跌颜色**: 根据同文件OHLC数据自动设置
   - 涨（close ≥ open）: 绿色 `#26a69a`
   - 跌（close < open）: 红色 `#ef5350`

2. ✅ **叠加层配置**: 自动应用
   - `priceFormat: { type: 'volume' }` - 格式化成交量显示
   - `priceScaleId: ""` - 设置为叠加层（不使用左右价格轴）

3. ✅ **防重叠**: 当 `adjustMainSeries: true` 时
   - 自动调整同Pane主系列（Candle/Bar）的边距
   - 主系列 `bottom = 1 - priceScaleMarginTop`（动态计算，无缝衔接）
   - 例如：volume `top=0.9` 时，主系列 `bottom=0.1`

### 示例

```json
{
  "type": "volume",
  "show": true,
  "fileName": "source_ohlcv_15m.parquet",
  "dataName": "volume",
  "volumeOpt": {
    "priceScaleMarginTop": 0.7,
    "adjustMainSeries": true
  }
}
```

> **最简配置**: 可直接使用 `"volumeOpt": {}` 或不传，使用所有默认值

---

## 5. Area (面积图)

### 基本配置

```json
{
  "type": "area",
  "show": true,
  "fileName": "indicators.parquet",
  "dataName": "volume_ma",
  "areaOpt": { /* 选项见下方 */ }
}
```

### AreaOption 字段

| 字段 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| `topColor` | `string` | 面积顶部颜色（建议RGBA） | `"rgba(41, 98, 255, 0.28)"` |
| `bottomColor` | `string` | 面积底部颜色（建议RGBA） | `"rgba(41, 98, 255, 0.05)"` |
| `lineColor` | `string` | 边线颜色 | `"#2962FF"` |
| `lineWidth` | `number` | 边线宽度 | `3` |
| `lineStyle` | `number` | 边线样式 | `0` |

### 示例

```json
{
  "type": "area",
  "show": true,
  "fileName": "indicators.parquet",
  "dataName": "ema_20",
  "areaOpt": {
    "topColor": "rgba(31, 119, 180, 0.4)",
    "bottomColor": "rgba(31, 119, 180, 0.05)",
    "lineColor": "#1f77b4",
    "lineWidth": 2
  }
}
```

---

## 6. Baseline (基线图)

### 基本配置

```json
{
  "type": "baseline",
  "show": true,
  "fileName": "indicators.parquet",
  "dataName": "price_diff",
  "baselineOpt": { /* 选项见下方 */ }
}
```

### BaselineOption 字段

| 字段 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| `baseValue` | `number` | 基线值 | `0` |
| `topLineColor` | `string` | 基线上方线条颜色 | `"#26a69a"` |
| `bottomLineColor` | `string` | 基线下方线条颜色 | `"#ef5350"` |
| `topFillColor1` | `string` | 上方填充颜色1（顶部） | `"rgba(38, 166, 154, 0.28)"` |
| `topFillColor2` | `string` | 上方填充颜色2（基线） | `"rgba(38, 166, 154, 0.05)"` |
| `bottomFillColor1` | `string` | 下方填充颜色1（基线） | `"rgba(239, 83, 80, 0.05)"` |
| `bottomFillColor2` | `string` | 下方填充颜色2（底部） | `"rgba(239, 83, 80, 0.28)"` |
| `lineWidth` | `number` | 线条宽度 | `3` |
| `lineStyle` | `number` | 线条样式 | `0` |

### 示例

```json
{
  "type": "baseline",
  "show": true,
  "fileName": "indicators.parquet",
  "dataName": "price_oscillator",
  "baselineOpt": {
    "baseValue": 0,
    "topLineColor": "#26a69a",
    "bottomLineColor": "#ef5350",
    "lineWidth": 2
  }
}
```

---

## 7. Bar (条形图)

### 基本配置

```json
{
  "type": "bar",
  "show": true,
  "fileName": "ohlcv.parquet",
  "dataName": ["open", "high", "low", "close"],
  "barOpt": { /* 选项见下方 */ }
}
```

### BarOption 字段

Bar 与 Candlestick 使用相同的选项字段。

| 字段 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| `upColor` | `string` | 上涨条形颜色 | `"#26a69a"` |
| `downColor` | `string` | 下跌条形颜色 | `"#ef5350"` |
| `openVisible` | `boolean` | 是否显示开盘价刻度 | `true` |
| `thinBars` | `boolean` | 是否使用细条形 | `false` |

### 示例

```json
{
  "type": "bar",
  "show": true,
  "fileName": "source_ohlcv_4h.parquet",
  "dataName": ["open", "high", "low", "close"],
  "barOpt": {
    "upColor": "#26a69a",
    "downColor": "#ef5350",
    "thinBars": false
  }
}
```

---

## 8. HLine (水平参考线)

### 基本配置

HLine **不需要数据源**，只需配置参数。

```json
{
  "type": "hline",
  "show": true,
  "hLineOpt": { /* 选项见下方 */ }
}
```

### HLineOption 字段

| 字段 | 类型 | 说明 | 必填 |
|------|------|------|------|
| `value` | `number` | 水平线的价格值 | ✅ |
| `color` | `string` | 线条颜色 | ✅ |
| `label` | `string` | 标签文本 | ❌ |

### 示例

```json
{
  "type": "hline",
  "show": true,
  "hLineOpt": {
    "value": 50.0,
    "color": "#faad14",
    "label": "rsi_center"
  }
}
```

---

## 9. VLine (垂直参考线)

### 基本配置

VLine **不需要数据源**，只需配置参数。

```json
{
  "type": "vline",
  "show": true,
  "vLineOpt": { /* 选项见下方 */ }
}
```

### VLineOption 字段

| 字段 | 类型 | 说明 | 必填 |
|------|------|------|------|
| `value` | `number` \| `string` | 时间值（Unix时间戳或日期字符串） | ✅ |
| `color` | `string` | 线条颜色 | ✅ |
| `label` | `string` | 标签文本 | ❌ |

### 示例

```json
{
  "type": "vline",
  "show": true,
  "vLineOpt": {
    "value": 1699200000,
    "color": "#ff6b6b",
    "label": "重要事件"
  }
}
```

---

## 🎨 推荐配色方案

```python
# 经典配色
COLORS = {
    "green": "#26a69a",      # 上涨/正值
    "red": "#ef5350",        # 下跌/负值
    "blue": "#1f77b4",       # 主要指标
    "orange": "#ff7f0e",     # 次要指标
    "purple": "#9467bd",     # 辅助指标
    "yellow": "#faad14",     # 警告/中性
}

# Matplotlib 风格（多条线时使用）
MATPLOTLIB_COLORS = [
    "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728",
    "#9467bd", "#8c564b", "#e377c2", "#7f7f7f"
]
```

---

## 📝 后端实现建议

### Python 示例代码

```python
def create_series_config(series_type: str, **kwargs):
    """创建系列配置
    
    Args:
        series_type: 系列类型 ("candle", "line", "histogram"等)
        **kwargs: 其他配置参数
    
    Returns:
        配置字典（已移除None值）
    """
    config = {
        "type": series_type,
        "show": kwargs.get("show", True),
    }
    
    # 添加数据源（如果有）
    if "fileName" in kwargs:
        config["fileName"] = kwargs["fileName"]
    if "dataName" in kwargs:
        config["dataName"] = kwargs["dataName"]
    
    # 根据类型添加对应的选项
    opt_map = {
        "candle": "candleOpt",
        "line": "lineOpt",
        "histogram": "histogramOpt",
        "area": "areaOpt",
        "baseline": "baselineOpt",
        "bar": "barOpt",
        "hline": "hLineOpt",
        "vline": "vLineOpt",
    }
    
    opt_key = opt_map.get(series_type)
    if opt_key and opt_key in kwargs:
        config[opt_key] = kwargs[opt_key]
    
    # 移除None值
    return {k: v for k, v in config.items() if v is not None}


# 使用示例
candle_config = create_series_config(
    "candle",
    fileName="ohlcv.parquet",
    dataName=["open", "high", "low", "close"],
    candleOpt={
        "upColor": "#26a69a",
        "downColor": "#ef5350",
        "borderVisible": False,
    }
)

line_config = create_series_config(
    "line",
    fileName="indicators.parquet",
    dataName="sma_50",
    lineOpt={
        "color": "#1f77b4",
        "lineWidth": 2,
        "lineStyle": 0,
    }
)

hline_config = create_series_config(
    "hline",
    hLineOpt={
        "value": 50.0,
        "color": "#faad14",
        "label": "中线",
    }
)
```

---

## 📚 相关文档

- [配置文件结构说明](./chart_config_structure.md) - 三维数组配置架构
- [Lightweight Charts 官方文档](https://tradingview.github.io/lightweight-charts/)
