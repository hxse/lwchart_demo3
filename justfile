set shell := ["bash", "-euc"]
set positional-arguments

# 显示入口，不加载配置或启动服务
[default]
help:
    @just --list

# 旧场景：Notebook 图表库构建与复制
legacy *args:
    @bash scripts/scenario.sh legacy "$@"

# 新场景：实时多周期看盘；--stop 停止所选配置的进程
market *args:
    @bash scripts/scenario.sh market "$@"

# 全部静态检查，不改写源码
check:
    @bun run check:svelte
    @bun run check:ts
    @bun run check:runtime

# 离线逻辑、服务与浏览器回归
test:
    @bun test tests/unit
    @bun --bun node_modules/@playwright/test/cli.js test
