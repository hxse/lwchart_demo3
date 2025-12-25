# 三层渲染架构

Chart Dashboard 采用**三维数组结构**，精确映射前端的三层渲染架构。

## 🏗️ 架构概览

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

## 层级说明

### 1. 第一层 - Grid Slots (网格插槽)
- 对应 GridTemplate 的不同插槽。
- 通常用于显示不同时间周期的图表。
- 例: `[15m图表, 1h图表, 4h图表]`。

### 2. 第二层 - Panes (窗格)
- 对应 Lightweight Charts 中的多价格轴窗格。
- 在同一个图表中垂直排列。
- 例: `[主图Pane, RSI副图Pane, MACD副图Pane]`。
- **关键**: Pane 索引由数组位置决定，无需手动指定 `position` 字段。

### 3. 第三层 - Series (系列)
- 同一个 Pane 内的多条线/蜡烛图/直方图。
- 共享同一个价格轴和时间轴。
- 例: `[蜡烛图, 布林带上轨, 布林带中轨, 布林带下轨]`。

---

[返回首页](../README.md)
