# 20261009C 看盘视窗跟随

- 概括：按最新蜡烛是否被右边界裁切决定跟随，保持新增 K 线的精确水平间距。
- 级别：二星；涉及绘制几何、增量与窗口裁剪，以及真实浏览器验证。
- 影响范围：just market 使用的共享图表更新入口、相关离线测试及图表规范。
- 主任务：无。
- 前置任务：20261009B podman production deployment。
- 相关 current spec：doc/current_specs/chart_updates.md、doc/current_specs/crypto_dashboard.md。
