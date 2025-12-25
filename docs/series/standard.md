# 标准图表系列参考

本文档详细描述基础图表类型的选项。

## 1. Candlestick (蜡烛图) & Bar (条形图)

### CandleOption / BarOption
| 字段 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| `upColor` | `string` | 上涨颜色 | `"#26a69a"` |
| `downColor` | `string` | 下跌颜色 | `"#ef5350"` |
| `borderVisible` | `boolean` | 是否显示边框 | `true` |
| `wickVisible` | `boolean` | 是否显示影线 | `true` |

## 2. Line (折线图) & Area (面积图)

### LineOption / AreaOption
| 字段 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| `color` | `string` | 线条/边线颜色 | `"#2962FF"` |
| `lineWidth` | `number` | 线条宽度 | `3` |
| `lineStyle` | `number` | 线条样式 (0:实线, 2:虚线) | `0` |
| `topColor` | `string` | (仅Area) 面积顶部颜色 | `RGBA` |

## 3. Histogram (直方图) & Volume (成交量)

### HistogramOption
- `color`: 颜色
- `base`: 基线值

### VolumeOption
- `priceScaleMarginTop`: 顶部边距 (默认 0.7)
- `adjustMainSeries`: 自动避开主图 K 线 (默认 true)

---

[返回首页](../README.md)
