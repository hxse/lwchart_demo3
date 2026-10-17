# 20261017B 手动 ATR 风险下单面板

- 概括：为 market 增加手动风险定额下单面板，复用 ATR，确认入场后提交双保护并展示核对结果。
- 级别：三星；涉及真实写操作、含费数量计算、部分成交和跨服务失败语义。
- 影响范围：market 按钮栏与面板、公共显示设置、自选草稿编辑、共享图表价格线、行情与指标消费、Bun／Vite API、鉴权客户端、离线测试及相关规范。
- 主任务：无。
- 前置任务：20261017A。
- 相关 current spec：doc/current_specs/manual_orders.md、doc/current_specs/crypto_dashboard.md、doc/current_specs/indicators.md、doc/current_specs/chart_updates.md、doc/current_specs/commands.md、doc/current_specs/deployment.md。
