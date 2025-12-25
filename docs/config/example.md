# 配置最佳实践与示例

## 📊 bottomRowChart 字段说明

`bottomRowChart` 用于定义底部区域的图表内容（通常是净值曲线）。

**数据结构**: 三维数组 `[Slots][Panes][Series]`，逻辑与主图 `chart` 字段完全统一。建议目前只使用一个 Slot。

### 配置示例

#### 单 Slot 单 Pane 多 Series (推荐格式)

```json
{
  "showBottomRow": true,
  "bottomRowChart": [
    [  // Slot 0
      [  // Pane 0
        {
          "type": "line",
          "show": true,
          "fileName": "backtest_result.parquet",
          "dataName": "balance",
          "lineOpt": { "color": "#2962FF", "lineWidth": 2 }
        }
      ]
    ]
  ]
}
```

## 📝 完整示例

参考以下 JSON 结构创建一个典型的包含主图和 RSI 副图的配置：

[点击查看完整 JSON 示例...（略，内容已在 README 索引中）]

---

[返回首页](../README.md)
