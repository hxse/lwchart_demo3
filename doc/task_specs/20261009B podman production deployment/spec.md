# Podman 生产部署

## 任务边界

交付 dev／local／remote 配置覆盖、独立服务产物、Containerfile、统一 Just 部署入口和验证。
开发与正式检查维持宿主 Bun；生产使用 Podman，不创建开发容器或任何开机自启服务。
本地与 ssh rn 均按目标原生 Linux amd64 装配；远程目录 ~/dev/lwchart_demo3。
以现有看盘 API、鉴权、静态服务及页面为唯一业务链路，不修改行情算法、URL 或 Notebook 行为。
保留 just market／legacy／check／test；market build 扩展为前端与独立服务打包，serve 共用正式实现。
新增配置公共模板，不覆盖用户已有 config.toml。缺失的私有 local／remote 文件可由本任务创建。
不上传本地镜像，不同步 node_modules、Git／JJ、测试缓存、草稿或其它项目文件。
不修改、停止或清理后端容器、trading-net、其他项目资源或共享缓存。
所有代码／离线验证、生产镜像和本地／远端服务验收通过即可交付；真实后端账号权限不作验收承诺。
依赖镜像／包仓库或 SSH 不可用时报告实际限制，不伪造部署成功，也不修改规范豁免必要验收。

## 任务规范

### 配置与运行角色

配置唯一加载器先读取基础 TOML，再根据 APP_CONFIG_PROFILE 叠加同目录同名 .local／.remote 覆盖。
profile 为 dev／local／remote，缺失或非法明确失败。普通 Just 命令注入 dev，部署注入目标名称。
dev 只读基础文件；覆盖缺失继承基础，存在但不可读取、TOML 非法或最终配置非法均明确报错。
表递归合并，数组／其他值整体替换，false／0／空串有效；合并后统一校验，不写回源文件。
legacy 与看盘沿同一文件加载链，各自既有业务校验职责保留。
dev 监听限制保持回环；local／remote 生产必须内部监听 0.0.0.0，宿主 publish_host 只接受 127.0.0.1。
预检与实际服务使用同一加载器和校验；runtime 继续只公开 defaults，不含 backend、deploy 或私有值。
deploy 可缺省，默认网络 trading-net、容器 lwchart-market、镜像 localhost/lwchart-market、
发布 127.0.0.1:5174、日志上限 10MiB，远端 ssh_host=rn、root_dir=~/dev/lwchart_demo3。
新增 deploy 字段不改变现有基础文件的兼容性；显式非法或未知字段失败。
本次缺失的 config.local.toml 使用容器后端地址、内部监听及 publish_port=5175；
config.remote.toml 使用相同容器地址及内部监听，发布默认 5174。基础凭据不改写。

### 产物与镜像

前端继续生成 dist-crypto；共用构建入口再生成 dist-market/server.js 与 dist-market/public。
生产服务实现移入独立模块，开发／构建才加载 Vite；生产包只依赖 Bun，静态根仅 public。
服务支持配置预检、公开部署元数据和后端连通探针；探针限时且不登录或请求真实行情。
增加只表示本服务就绪的 /healthz，不把上游账号权限纳入服务健康，不暴露私有材料。
Containerfile 为构建／运行两阶段，同用官方 Debian slim Bun 基底：
docker.io/oven/bun:1.4.2-slim@sha256:debbe76858f2e398d2937c1eceeb82c571ac1fcd78aadf00e9634578ac2b5ef7。
构建阶段使用 bun install --frozen-lockfile 与正式构建脚本；最终只复制 dist-market。
最终镜像无项目源码、配置、node_modules、Vite、编译器、Just、Git 历史。
镜像设置 PROJECT_EXECUTION_CONTEXT=prod，直接执行 Bun 服务，缺少有效场景时拒绝启动。
容器以调用 Podman 的 UID/GID 读取只读配置；rootless 使用 keep-id，不改用户配置权限。
远端新配置快照归属接收端 UID/GID，权限 600；不继承本机 UID/GID。预检与运行采用相同只读及权限限制。
配置目录位于构建上下文之外。源码按固定白名单生成可校验 manifest，内容决定发布 ID。
依赖安装层和同内容镜像可复用；仅构建／完整组合准备产物，start 不隐式编译或拉取镜像。

### 本地与远程编排

Just 薄入口，Bash 负责参数、Podman／SSH／rsync、互斥和生命周期，Bun 负责配置及内容清单。
状态等公开元数据可以持久保存为生成状态文件，不维护手写执行日志或将进度写入任务文档。
本地只读挂原基础与 local 文件，不复制私有配置；远端完整基础与 remote 覆盖上传到独立配置快照。
两地受管文件位于项目 .deploy 目录；远端只在 ~/dev/lwchart_demo3/.deploy 管理源码发布、配置和状态。
rsync 按清单及内容校验增量同步，删除只允许对应受管源码目录，不删除配置快照或远端项目内容。
上传完成并核对 manifest 后发布待用指针；失败不改变运行中实例及其配置。
skip-config 复用已有完整远端快照；首次缺少完整配置时失败，不从不完整片段拼装。
build／start／stop 等变更串行互斥；控制日志／状态可独立查看，不创建第二个服务实例。
容器使用同名外部网络，启动前检查存在、DNS 启用及后端可连通；缺失不创建另一套网络。
发布显式包含 127.0.0.1，不使用 host 网络、全网卡映射、restart 策略或 systemd 自启。
容器日志限量；只按项目及目标标签管理资源，同名但未归属本项目的容器必须报错。
相同镜像和配置已在运行时重复 start 为无变化成功。更新先完成新配置与连通预检，
再确认旧实例退出并保留旧容器／镜像；新实例在有限时间内通过 /healthz 才登记生效并清理被替代资源。
启动失败删除本次候选并恢复保留旧实例；远端旧实例继续使用原配置快照。
本地原配置不复制；更新前也校验旧镜像可接受当前配置，不兼容时不停止旧实例，需另行安排迁移。
本地内部端口改变时旧映射无法恢复，启动前拒绝原地更新并保留旧实例；发布端口可以独立调整。
stop／status／logs 使用已登记的实例元数据，不因凭据失效或配置文件暂不可用而无法控制实例。
不执行全局 prune，只在成功替换后清理本项目已退出容器和被替代且无引用的镜像 ID。

## 公开接口与用户写法

```bash
just market
just market --build
just deploy --target=local --build --start
just deploy --target=local --status
just deploy --target=local --logs
just deploy --target=local --stop
just deploy --target=remote --upload --build --start
just deploy --target=remote --upload --build --start --skip-config
just deploy --target=remote --build
just deploy --target=remote --start
just deploy --target=remote --status
just deploy --target=remote --logs
just deploy --target=remote --stop
```

无动作只显示帮助；实际动作必须明确 target。上传仅远程有效；skip-config 仅远程上传有效。
upload／build／start 可组合且按此顺序；status／logs／stop 单独使用。未知、重复、非法组合退出 2。
config 指定基础文件，覆盖文件按同目录同名派生；远程 root_dir 的 ~ 仅在远端展开。

```toml
# config.toml 可选部署段
[deploy]
container_network = "trading-net"
publish_host = "127.0.0.1"
publish_port = 5174

[deploy.remote]
ssh_host = "rn"
root_dir = "~/dev/lwchart_demo3"
```

```toml
# config.local.toml；remote 同样填写 backend 与 server，发布端口可继承基础
[backend]
base_url = "http://ccxt-proxy2:5123"
[server]
host = "0.0.0.0"
[deploy]
publish_port = 5175
```

宿主使用 http://127.0.0.1:5123；容器使用 http://ccxt-proxy2:5123。
本次本地入口 http://127.0.0.1:5175，远端 rn 回环入口 http://127.0.0.1:5174。
客户端可用 ssh -N -L 127.0.0.1:6174:127.0.0.1:5174 rn 建立隧道。
非法 publish_host、profile、未知覆盖字段、缺配置、缺网络／DNS、未准备镜像、外来同名资源均明确失败。

## 测试、验证与阶段过渡

正式顺序 just check、just test、just market --build，均须通过，无阶段性失败。
离线单元覆盖递归合并、替换值、场景、坏覆盖、秘密错误隔离、端口限制、部署元数据、
manifest 白名单及内容变化、命令参数、资源所有权、幂等、失败恢复与成功清理。
既有全部浏览器回归继续使用本地 fixture，生产路径使用独立包，证明不依赖 Vite 或项目源码。
另提供 just test-container：只使用已构建缓存镜像及本地 fixture／临时网络，不自动拉取或安装。
覆盖镜像无私有材料、配置只读挂载、生产 API 与自身健康、网络及回环发布、控制幂等和回滚。
真实部署通过正式 deploy 入口分别本地构建启动、远程上传构建启动，再 status 和有限健康探测。
现场验收核对发布地址、trading-net、角色、镜像内容及配置排除，不执行真实市场在线测试。
基础入口迁移同期更新调用方，保持 stop 原有进程识别；不引入备用运行环境或双重配置加载器。
