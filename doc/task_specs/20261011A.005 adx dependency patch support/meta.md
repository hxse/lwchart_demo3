# 20261011A.005 ADX 依赖补丁与计算支持

- 概括：修复锁定依赖的零波幅 DX 边界，按统一指标链路开放 ADX。
- 级别：二星；涉及依赖补丁、严格增量对齐、图表与生产构建输入。
- 影响范围：依赖锁定与补丁、文件校验与命令入口、指标能力、离线测试、镜像构建白名单、有效规范与说明。
- 主任务：20261011A unified technical indicators。
- 前置任务：20261011A.004 indicator integration validation。
- 替代范围：主任务与计算阶段禁止本地依赖补丁的约束，仅对本任务定义的 ADX 零波幅修复例外。
- 相关 current spec：doc/current_specs/indicators.md、doc/current_specs/crypto_dashboard.md、doc/current_specs/commands.md、doc/current_specs/deployment.md。
