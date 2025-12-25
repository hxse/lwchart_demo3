# Notebook/Python 配置覆盖使用方法

## 基础使用

在 Jupyter 中通过字典传递覆盖配置：

```python
override_config = {
    "template": "grid-2x2",
    "show": ["0,0,1,0"],  # 隐藏 slot0, pane0, series1
    "showInLegend": ["-1,0,0,1"] # 在底部区域显示第一个指标的 Legend
}
```

## DashboardOverride 核心参数

| 参数名 | 说明 | 示例值 |
|--------|------|--------|
| `template` | 布局模板 | `"vertical-1x1"` |
| `show` | 指标/连线显隐 | `["0,0,0,0"]` |
| `showInLegend` | Legend 显隐 | `["0,0,0,1"]` |
| `showRiskLegend`| 风险线控制 | `"1,1,1,0"` |
| `showBottomRow` | 底部栏开关 | `True` / `False` |

## show 参数坐标详解

**格式**: `"slotIdx,paneIdx,seriesIdx,status"`

- `slotIdx`: 网格索引，**-1 代表底部区域 (Bottom Row)**。
- `paneIdx`: 窗格索引 (0:主图, 1,2...:副图)。
- `seriesIdx`: 系列索引。
- `status`: 1 为显示，0 为隐藏。

> [!NOTE]
> 在底部区域使用时，`slotIdx` 始终为 `-1`。

---

[返回首页](../README.md)
