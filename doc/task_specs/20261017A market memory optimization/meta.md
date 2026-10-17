# 20261017A 看盘内存优化

- 概括：减少服务端无关依赖与行情复制，降低浏览器增量更新分配，并实测 Bun 低内存模式。
- 级别：二星；涉及数据所有权、共享绘图更新和离线性能对照。
- 影响范围：market 服务、行情窗口、指标结果、图表时间线、相关测试与验证入口。
- 主任务：无。
- 前置任务：20261012B。
- 相关 current spec：doc/current_specs/crypto_dashboard.md、doc/current_specs/chart_updates.md、doc/current_specs/indicators.md、doc/current_specs/deployment.md、doc/current_specs/commands.md。
