# Chart Dashboard 开发文档索引

本文档是 Chart Dashboard (v3.1) 的核心技术文档索引。

## 📁 文档目录

### 1. 核心模型与架构
- [三层渲染架构](./config/architecture.md) - 了解 Grid/Pane/Series 的层级关系。
- [JSON 配置接口标准](./config/schema.md) - `chartConfig.json` 的详细字段定义。
- [配置最佳实践与示例](./config/example.md) - 各种场景的完整 JSON 示例。

### 2. 图表系列参考 (Series Options)
- [标准图表系列](./series/standard.md) - 蜡烛图、折线图、面积图、直方图等。
- [参考线系列](./series/reference.md) - 水平参考线 (HLine) 和垂直参考线 (VLine)。
- [回测专用系列](./series/backtest.md) - 仓位标记 (PositionArrow) 及止损止盈线 (SlTpLine)。

### 3. 高级功能
- [配置覆盖机制 (Override)](./override/index.md) - 动态覆盖 ZIP 内部配置的原理。
- [Notebook/Python 使用指南](./override/notebook.md) - 在 Jupyter 环境中精细化控制图表。
- [浏览器 URL 参数指南](./override/browser.md) - 通过 URL 参数快速调整布局。

---

## 🛠️ 相关资源
- [GitHub Repository](https://github.com/...)
- [Lightweight Charts 官方文档](https://tradingview.github.io/lightweight-charts/)
