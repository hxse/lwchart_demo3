# 20261009B.001 前端独立启动

- 概括：取消部署启动前的后端连通要求，使前端可在后端离线时构建、运行及重复启动。
- 级别：一星；修改共享启动前置条件，保留容器生命周期与失败恢复。
- 影响范围：部署启动脚本、离线部署与容器验证、部署规范和指南。
- 主任务：20261009B podman production deployment。
- 前置任务：20261009C market viewport following。
- 替代范围：20261009B 中启动前必须验证后端连通的要求。
- 相关 current spec：doc/current_specs/deployment.md。
