# Podman 生产部署

## 环境与配置

开发与正式检查在宿主 Bun 执行；生产镜像运行 market 服务，不启用开发容器或开机自启。
两目标均使用原生 Linux amd64，官方 Bun 1.4.2 Debian slim 基底固定到 Containerfile 的 digest。
其它平台在构建前明确拒绝，不启用模拟构建。当前本机使用 rootless、ssh rn 使用既有 rootful Podman。

配置唯一加载器先读取基础 TOML，再按 APP_CONFIG_PROFILE 处理覆盖：

| 场景 | 配置 |
| --- | --- |
| dev | 仅基础文件 |
| local | 基础 + 同目录同名 .local.toml |
| remote | 基础 + 同目录同名 .remote.toml |

普通 Just 命令注入 dev，部署注入 local／remote；直接运行入口缺少或指定非法场景时报错。
覆盖缺失继承基础，存在但不可读或解析失败明确报错。表递归合并，数组／其他值整体替换，
false、0、空字符串有效；合并后校验，不回写文件。配置修改默认重启生效。

dev 仅回环监听，默认后端 http://127.0.0.1:5123。容器内部必须监听 0.0.0.0，
后端默认 http://ccxt-proxy2:5123；宿主发布地址仅允许 127.0.0.1。
生产与宿主共用配置、API、鉴权、数据及静态服务实现；runtime 只公开页面 defaults。

## 部署参数

deploy 可省略，基础模板见 [config.example.toml](../../config.example.toml)。
local／remote 差异模板见 [本地模板](../../config.local.example.toml)、[远端模板](../../config.remote.example.toml)。

| 字段 | 默认与限制 |
| --- | --- |
| container_network | trading-net；部署使用外部已有启用 DNS 的网络 |
| container_name | lwchart-market；只管理同项目、同 profile 标签的资源 |
| image_name | localhost/lwchart-market；本地镜像名称，不推送 registry |
| publish_host | 仅 127.0.0.1 |
| publish_port | 5174，1..65535 |
| log_max_size | 10485760 字节，1024..104857600 |
| remote.ssh_host | rn，SSH 别名，无隐式 sudo 或执行用户切换 |
| remote.root_dir | ~/dev/lwchart_demo3；~ 在远端展开 |

程序内部 server.port 与宿主 publish_port 分离。实际本地覆盖使用 5175，避免与宿主 5174 冲突；
远端发布 5174。网络与后端必须处于调用 Podman 的同一环境，既有后端和网络由原项目管理。
容器通过 keep-id 与显式调用 UID/GID 读取配置，不 chown 用户配置，不传密码到命令行或环境。
远端传输的私有快照归属接收端 UID/GID、文件权限 600，不继承本机所有权；预检与运行采用相同权限限制。

## 产物与镜像

just market --build 共用构建脚本生成 dist-crypto，以及 dist-market/server.js 与 public 静态目录。
服务单独打包为 Bun 产物，生产不加载 Vite；最终镜像仅含 Bun、server.js 和 public。
生产构建拒绝服务端引入 lightweight-charts、fancy-canvas、Svelte 或 trading-signals；
这些实现只属于浏览器链路。容器沿用 Bun 默认 GC，不注入强制回收或 --smol。
配置、源码、node_modules、Just、编译器、Git／JJ 不进入最终镜像。静态根仅 public，
server.js 与运行配置在静态根外。/healthz 仅返回自身 ready，不检查真实账号权限。

构建阶段安装 frozen-lockfile 依赖、运行相同程序构建，运行阶段仅复制产物。
Containerfile 在依赖安装前复制 patches；源码白名单只包含 package.json 中登记的
项目内普通补丁文件，拒绝越界路径及文件／目录符号链接，未登记补丁不进入发布输入。
补丁内容参与发布 ID，远端上传与本地构建复用同一内容清单，不单独维护远端版本。
容器执行相同 market build 入口，在编译前核对已安装库版本和完整 DX.js 的固定指纹，
不匹配就构建失败；校验器随源码白名单传输，最终镜像不保留该源码检查或 node_modules。
固定白名单和内容清单组成构建上下文，私有文件不进入。发布 ID 来自文件内容及模式，
相同输入镜像可复用。构建成功后登记 prepared-image；start／restart 只消费与待用
版本配套的已登记镜像，不隐式拉取、安装或构建。未登记或镜像缺失明确失败。
本机源码变化不影响已有镜像的启停；显式 build 才准备当前源码，不能只因工作区
变化阻止已有版本启动，也不能拿旧镜像冒充刚上传但尚未构建的新发布。

## 本地与远程入口

```bash
just deploy --target=local --build --start
just deploy --target=local --restart
just deploy --target=local --build --restart
just deploy --target=local --build --stop
just deploy --target=local --status
just deploy --target=local --logs
just deploy --target=local --stop
just deploy --target=remote --upload --build --start
just deploy --target=remote --upload --build --restart --skip-config
just deploy --target=remote --build
just deploy --target=remote --start
just deploy --target=remote --restart
just deploy --target=remote --build --stop
just deploy --target=remote --status
just deploy --target=remote --logs
just deploy --target=remote --stop
```

无动作只显示帮助，不加载业务配置。操作须明确 target；upload 只用于远端，skip-config
只用于远端 upload。stop／start／restart 三选一；可单独使用，也可接在显式 upload
和 build 之后，顺序固定为上传→构建→所选启停动作，失败即停。status／logs 必须
独立查询，不与准备或启停组合。未知／重复／非法组合在操作前退出 2。
config 指定基础文件；例如 --config=/path/project.toml 对应 project.local.toml 或 project.remote.toml。

Just 薄编排；Bash 执行参数、Podman、SSH、rsync 与锁，Bun 负责配置及内容清单。
本地配置只读挂原文件；远端源码与完整配置独立传输，在远端原生装配镜像，不上传本地镜像。
受管目录在项目 .deploy 下。远端只修改 ~/dev/lwchart_demo3/.deploy 的发布、配置和生成状态，
不对项目根执行 rsync --delete；删除只限定对应源码发布目录，配置快照不热改运行中版本。
skip-config 复用已保存的完整远端配置；首次没有完整配置时明确失败。
远端单独 build／start／restart 使用已上传的引擎与资料，不读取本机配置或计算源码
指纹，也不隐式上传；控制引擎自身的升级须显式 upload。默认帮助不加载业务配置。

## 生命周期与失败

变更在目标实例上互斥，restart 的停止和启动持有同一把操作锁，后台容器不继承锁；
status／logs 可独立查看，冲突的变更立即拒绝、不排队。
build 是前置准备，成功后才执行所选启停；构建失败保留原实例状态。
start 发现已运行实例就拒绝，即使镜像和配置相同也不视为成功，不替换、不停止。
stop 对已停止或不存在的实例成功返回，已停止时明确提示；停止失败或仍运行时，
restart 不得继续启动。restart 复用停止→完整启动，已停止时直接进入启动阶段，
不调用 Podman restart，也不直接启动原容器绕过配置加载。
存在性或运行状态查询失败不能当作不存在／已停止；停止后的核对失败也终止启动。
`container exists` 只有退出码 1 表示不存在，125 等存储错误必须传播，见
[Podman 存在性检查](https://docs.podman.io/en/latest/markdown/podman-container-exists.1.html)。

启动前检查已登记镜像及发布配套关系，启动阶段重新加载并校验配置、共享网络和 DNS，
不探测或等待后端。本地重新读取原配置和可选覆盖，远端重新读取目标端已上传快照；
本机修改远端配置须显式 upload。后端未运行、DNS 暂未注册或无法连接不阻断镜像
构建、首次启动或显式重启，重复 start 仍按已运行规则拒绝。
显式后端连通诊断保留有限超时，不属于默认部署流程；真实账号权限由用户后端管理。
同名但无项目／profile 标签的容器拒绝操作，不按端口停止外来服务。

更新先保留旧容器，确认退出后启动候选。候选在有限时间内通过自身 /healthz 才登记为 active。
健康验收只检查前端自身；无后端时静态页面和 runtime 仍可用，行情请求按既有受控
错误返回。后端随后可用时正常行情请求恢复，无需重新部署前端。
停止后的配置、网络或候选启动失败保持停止；清理本次候选并保留已停止的旧实例，
必要时恢复旧名称，不自动启动旧容器。远端旧实例仍持有原配置快照。本地不复制私有
配置，重启使用新配置；不再用旧镜像回滚校验限制内部端口调整。
成功后按准确 ID 清理被替代的已退出容器及无引用旧镜像，不执行全局 prune。
被其它容器／镜像引用的资源保留。后端、共享网络、其它项目镜像与共享构建缓存不清理。
stop／status／logs 使用已登记元数据，不依赖后端凭据或配置文件当前是否可用。
日志使用限量容器日志驱动；无 restart 策略、systemd 或其它开机自启。

## 验证入口

just check、just test、just market --build 为正式宿主检查、离线回归和程序构建。
浏览器生产 fixture 使用独立服务包，默认测试不访问真实后端、registry 或 SSH。
just test-container 仅使用已经构建的配套缓存镜像及独立本地 fixture／临时网络，不自动拉取镜像。
该入口证明无后端时前端独立启动、后端恢复后的两来源 API、镜像边界、只读配置、
回环发布、重复启动拒绝、重启及失败保持停止。
默认离线测试使用外部命令替身运行真实本地入口和模拟 SSH 上传／远端引擎，覆盖
动作互斥、构建先行、源码变化不强制重建、配置重载、停止失败、候选失败及无隐式上传。
真实部署验收通过正式 deploy 入口，核对镜像、发布、共享网络和自身健康；不自动测试真实账号权限。
