# 参考线系列参考

## 概述

从 v3.2 开始，`HLine` 和 `VLine` 支持在**空窗格**中独立显示。系统会自动注入一个不可见的占位系列来承载这些参考线。

## 1. HLine (水平参考线)

HLine **不需要数据源**，只需配置 `hLineOpt`。它在底层被实现为 LWChart 的 `priceLine`。

### HLineOption 字段
| 字段 | 类型 | 说明 |
|------|------|------|
| `value` | `number` | 价格位置 |
| `color` | `string` | 线条颜色 |
| `label` | `string` | (可选) 文本内容 |
| `showLabel` | `boolean` | (可选) 是否在图表线上显示标题文本，默认 `false` |

## 2. VLine (垂直参考线)

VLine 同样不需要数据源，只需配置 `vLineOpt`。它在底层被实现为系列的 `marker`。

### VLineOption 字段
| 字段 | 类型 | 说明 |
|------|------|------|
| `value` | `number|string` | Unix 时间戳或日期字符串 |
| `color` | `string` | 线条颜色 |
| `label` | `string` | (可选) 标记文本 |

---

[返回首页](../README.md)
