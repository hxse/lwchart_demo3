# 浏览器 URL 参数覆盖指南

## URL 格式示例

```
http://.../chart-dashboard?template=single&show=0,0,1,0&viewMode=table
```

## 支持参数表

| 参数名 | 示例 | 说明 |
|--------|------|------|
| `template` | `grid-2x2` | 修改布局模板 |
| `viewMode` | `table` | 默认视图模式 (`chart` 或 `table`) |
| `show` | `0,0,1,0` | 隐藏/显示特定指标 (详见下方坐标说明) |
| `showInLegend` | `0,0,1,1` | 控制指标在 Legend 中的显隐 |
| `showBottomRow` | `0` | 是否显示底部回测详细信息栏 (0或1) |
| `showRiskLegend` | `1,0,0,1` | SL,TP,TSL,PSAR 连线 Legend 控制 |
| `showLegendInAll` | `1` | 是否在所有同步图表中同时显示 Legend |
| `selectedZipFileName` | `result.zip` | 自动加载指定的 ZIP 文件 |
| `selectedInternalFileName` | `data.csv` | 初始选中的数据文件名 |

## 🕹️ 坐标说明 (show / showInLegend)

这两个参数使用四维坐标格式：`slotIdx,paneIdx,seriesIdx,status`。

- `slotIdx`: 网格插槽索引 (从 0 开始；`-1` 代表底部栏)。
- `paneIdx`: 窗格索引 (从 0 开始)。
- `seriesIdx`: 系列索引 (从 0 开始)。
- `status`: `1` 为显示，`0` 为隐藏。

> [!NOTE]
> `show` 和 `showInLegend` 参数可以多次出现，例如：
> `?show=0,0,0,0&show=0,0,1,0` 会同时隐藏 Slot 0, Pane 0 的前两个系列。

---

[返回首页](../README.md)
