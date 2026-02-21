# 参考线系列参考

## 概述

从 v3.2 开始，`HLine` 和 `VLine` 支持在**空窗格**中独立显示。系统会自动注入一个不可见的占位系列来承载这些参考线。

两者均支持**属性透传**：除了下表中列出的基础字段外，后端可以传入任意 lightweight-charts 底层 API 支持的属性，前端会原样转发。未传的字段走前端默认值。

## 1. HLine (水平参考线)

HLine **不需要数据源**，只需配置 `hLineOpt`。底层实现为 LWChart 的 `priceLine`。

### 基础字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `value` | `number` | 是 | 价格位置 |
| `color` | `string` | 是 | 线条颜色 |
| `label` | `string` | 否 | 文本内容 |
| `showLabel` | `boolean` | 否 | 是否在图表线上显示标题文本，默认 `false` |

### 可透传属性 (均为可选，不传走默认值)

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `lineWidth` | `1\|2\|3\|4` | `1` (RSI center 线为 `2`) | 线条粗细 |
| `lineStyle` | `0-4` | `0` (Solid) | 线型: 0=Solid, 1=Dotted, 2=Dashed, 3=LargeDashed, 4=SparseDotted |
| `lineVisible` | `boolean` | `true` | 是否显示线条 |
| `axisLabelVisible` | `boolean` | `true` | 是否在价格轴显示标签 |
| `axisLabelColor` | `string` | 跟随 `color` | 价格轴标签背景色 |
| `axisLabelTextColor` | `string` | `''` | 价格轴标签文字色 |

### 示例

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

## 2. VLine (垂直参考线)

VLine 同样不需要数据源，只需配置 `vLineOpt`。底层实现为系列的 `marker`。

### 基础字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `value` | `number\|string` | 是 | Unix 时间戳或日期字符串 |
| `color` | `string` | 是 | 标记颜色 |
| `label` | `string` | 否 | 标记文本，默认 `"VLine"` |

### 可透传属性 (均为可选，不传走默认值)

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `shape` | `string` | `"arrowUp"` | 标记形状: `arrowUp`, `arrowDown`, `circle`, `square` |
| `size` | `number` | `1` | 标记大小 |
| `position` | `string` | `"inBar"` | 标记位置: `aboveBar`, `belowBar`, `inBar` |

### 示例

```json
{
  "type": "vline",
  "show": true,
  "vLineOpt": {
    "value": 1700000000,
    "color": "blue",
    "label": "Entry Point",
    "shape": "circle",
    "size": 3,
    "position": "aboveBar"
  }
}
```

---

[返回首页](../README.md)
