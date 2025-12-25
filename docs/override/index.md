# 配置覆盖机制 (Override)

## 📋 概述

`DashboardOverride` 允许在不修改 ZIP 内部 `chartConfig.json` 的情况下，动态覆盖显示配置。

### 覆盖场景
1. **[Notebook 模式](./notebook.md)**: 通过 Python 对象传递覆盖参数。
2. **[浏览器模式](./browser.md)**: 通过 URL 参数快速调整。

### 可覆盖的核心项
- `template`: 布局模板。
- `show`: 指标显示/隐藏 (使用 `slot,pane,series,status` 坐标)。
- `showInLegend`: 控制指标在 Legend 中的显隐 (坐标同上)。
- `viewMode`: 视图模式切换 (`chart` | `table`)。
- `showBottomRow`: 是否显示底部回测详细信息栏。
- `showRiskLegend`: 控制 SL/TP 线在 Legend 中的显隐 (`"sl,tp,tsl,psar"` 格式)。
- `selectedInternalFileName`: 初始选中的数据文件名。
- `showLegendInAll`: 是否在所有同步图表中同时显示 Legend。

---

[返回首页](../README.md)
