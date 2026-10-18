# 20261018A 图表分配优化

- 概括：减少图表查询、图例及缺口绘制的重复分配，精简旧入口 Base64 转换副本。
- 级别：二星；涉及共享图表生命周期、真实 SDK 等价回归与离线性能对照。
- 影响范围：共享图表时间线、光标与可见性查询、图例、缺口分段、旧入口文件转换、测试。
- 主任务：无。
- 前置任务：20261017B。
- 相关 current spec：doc/current_specs/chart_updates.md、doc/current_specs/commands.md、doc/current_specs/crypto_dashboard.md。
