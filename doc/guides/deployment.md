# 本地与远程容器部署

## 配置

开发仍使用 just market，读取 config.toml，后端默认 http://127.0.0.1:5123。
本地部署读取 config.toml + config.local.toml；远端读取基础 + config.remote.toml。
覆盖文件只写差异，未写字段继承基础。使用配置模板填写后端账号密码，私有文件不纳入版本控制。

```toml
# 本地或远端生产覆盖
[backend]
base_url = "http://ccxt-proxy2:5123"
[server]
host = "0.0.0.0"
```

本地模板另设 publish_port=5175，让宿主 5174 与容器共存。远端默认发布 5174。
容器内 0.0.0.0 用于容器网络监听，宿主发布始终绑定 127.0.0.1。
两个目标都需已有启用 DNS 的 trading-net，以及同一 Podman 环境中的 ccxt-proxy2 后端。

## 本地部署

```bash
just deploy --target=local --build --start
just deploy --target=local --status
just deploy --target=local --logs
just deploy --target=local --stop
```

本次本地覆盖的页面入口为 http://127.0.0.1:5175。
build 安装锁定依赖并装配生产镜像，可复用缓存；start 不隐式构建。配置只读挂原文件，改配置后重新 start。
仅 start 时源码须与已准备版本一致；代码修改后重新 --build --start。

## 远端部署

远端通过 ssh rn 操作，部署目录 ~/dev/lwchart_demo3。
首次使用：

```bash
just deploy --target=remote --upload --build --start
```

源码、锁文件及完整配置分别同步，在 rn 装配镜像。私有配置不进入镜像，也不热改旧容器的配置快照。
需要保留远端完整配置时：

```bash
just deploy --target=remote --upload --build --start --skip-config
just deploy --target=remote --status
just deploy --target=remote --logs
just deploy --target=remote --stop
```

单独 upload 不构建，单独 build 不上传，单独 start 消费已上传并构建的版本；可以分别执行。
首次没有完整配置时不能 skip-config。状态、日志及停止不依赖凭据是否有效。
远端只发布自身回环地址，浏览器可通过 SSH 隧道访问：

```bash
ssh -N -L 127.0.0.1:6174:127.0.0.1:5174 rn
```

打开 http://127.0.0.1:6174。本任务不配置任何开机自启。

## 验证与失败

```bash
just check
just test
just market --build
just test-container
```

普通测试只用离线 fixture。test-container 需要先构建当前配套镜像，使用独立本地假后端和临时网络，
不会拉取镜像或访问真实行情；不满足准备条件会明确报错。
部署预检失败保持旧实例；候选未就绪恢复旧实例。成功后只清理本项目被替代且无引用的资源。
本地修改内部 server.port 时，原容器映射无法保证恢复，需先安排迁移；通常只修改 publish_port。
不会自动停止占端口的其它服务，不删除后端容器或 trading-net。
完整契约见 [生产部署规范](../current_specs/deployment.md)。
