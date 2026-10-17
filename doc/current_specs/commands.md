# 命令与运行配置

## 场景入口

根 `justfile` 为薄编排，默认 `just` 仅显示帮助。
`scripts/scenario.sh` 统一解析参数，安全透传 argv，不 eval。
宿主 Bun／Bash 是唯一开发环境；生产使用 Podman，无开发容器或开机自启。

```bash
just legacy                               # 默认 --build
just legacy --build --config=config.toml
just market                               # 默认 --dev
just market --dev --config=config.toml
just market --build
just market --serve --config=config.toml
just market --stop                         # 停止本项目当前配置的 dev／serve
just check
just test
just deploy --target=local --build --start
just deploy --target=remote --upload --build --start
just test-container
just benchmark-memory --baseline=/tmp/lwchart-memory-baseline --runs=3
```

每个场景支持 --help；动作互斥，未知参数、空配置路径及旧场景的 dev／serve／stop 退出 2。
帮助不读取配置、不构建、不联网。缺配置／配置非法在绑定服务前退出 2。
配置在启动时读取，修改后重启。普通入口使用 dev；生产 local／remote 的覆盖与部署见
[deployment.md](deployment.md)。

legacy 在依赖文件校验通过后校验 legacy.library_target_dir，按 `vite.config.lib.ts` 构建 dist-lib，复制
`dist-lib/.` 到目标目录。默认目标 `~/dev/pyo3-quant/data/lwchart`；仅展开开头的 ~/，
其它 `$` 和 `${...}` 保持字面值，路径空格安全。失败停止，不继续复制。
原 package.json build:lib 退出，不保留同职责包装。
同次构建使用 TypeScript 7 生成 chart-dashboard.d.ts、chart-dashboard.es.d.ts、
chart-dashboard.umd.d.ts 及 types/，复制包含全部声明；失败时不复制不完整产物。
声明范围及消费示例见 [技术指标使用](../guides/indicators.md)。

market dev 以 `src/crypto` 为 Vite 根，端口来自 TOML，默认 5174。
该入口同时支持 CCXT／TQ 只读看盘，命令名为 market。
market build 共用构建脚本生成 dist-crypto 与 dist-market 独立服务包，不读运行凭据、不登录、不请求行情。
market serve 只运行已有 dist-crypto，缺少 index.html 明确失败，不隐式构建。
开发中间件与 Bun 生产服务共用同一配置、鉴权与 API 实现；生产静态根仅 dist-crypto。
宿主服务只监听回环地址，生产容器内部监听 0.0.0.0、宿主只发布 127.0.0.1；Ctrl+C 关闭宿主服务。
market stop 不读业务配置，不需要有效凭据。按 Linux /proc 匹配同仓库、同入口、同
配置路径的 dev／serve；不会按端口杀其它程序。先 SIGTERM，等待最多 5 秒，仍为同一
进程时 SIGKILL。没有匹配进程时成功退出；--config 可选，默认 config.toml。

package.json 只保留依赖、工具级 dev／build／preview 和原子检查命令。
check:svelte 检查全部前端；check:ts 检查 Vite／Playwright 配置；check:runtime 严格
检查 Bun 服务及测试，允许由 Bun 转译的 TypeScript class 语法。
Just 串行组织检查，均不格式化或改写源码。
`just check`、`just test` 首先执行共享指标依赖校验；market dev／build 在加载配置、
监听或编译前执行，legacy build 在构建与复制前执行。校验规则见下节。

## 依赖与构建工具

package.json 与 bun.lock 是唯一项目依赖链，安装使用 `bun install --frozen-lockfile`，
显式升级使用 `bun update --latest`；本项目没有 uv 管理的 Python 依赖。
trading-signals 精确锁定 8.3.0，唯一依赖补丁是 ADX 零波幅修复，见
[指标规范](indicators.md)。`patchedDependencies` 登记的 patches 文件随源码和锁文件
跟踪，冻结安装自动应用；不手工修改 node_modules 作为正式安装方式。
维护补丁使用 [Bun 正式 patch 流程](https://bun.com/docs/pm/cli/patch)，先准备包副本，
再编辑并提交，避免修改缓存硬链接。补丁和版本变更均须重新通过指标准入。
`scripts/indicators/check-dependency.ts` 是唯一文件校验器：实际安装版本必须符合
指标准入版本，补丁后整个 DX.js 的原始字节 SHA-256 必须等于代码中固定的审核值。
缺文件、版本不符或内容变化时报错并停止后续操作；不自动安装、修改文件或刷新指纹。
可先冻结安装恢复；有意变更则重新审核和准入后手动更新指纹。
帮助、停止和消费已有产物的 serve／生产服务不要求安装库，不执行该源码校验。
Vite 使用正式 8 系列，旧 rolldown-vite 别名与 override 退出；crypto 明确加载
根目录 svelte.config.js。旧浏览器构建用 rolldownOptions 将表格库独立成包，
Notebook 库仍输出原 ES／UMD 文件名和全局名。

TypeScript 按官方组合安装：@typescript/native 别名提供 7 系列 tsc，typescript
指向 @typescript/typescript6，提供 Svelte 工具必需的 JS API。
check:svelte 使用 --tsgo --incremental，全部正式类型检查使用 7 编译器；
不在检查失败时回退到旧编译器。生成的 .svelte-check 缓存不纳入版本控制。

## 私有配置

config.toml 与其备份忽略跟踪，完整公共模板为
[config.example.toml](../../config.example.toml)。私有值不写进 bundle、库产物或浏览器。
配置加载、公开参数及 HTTP 契约见 [crypto_dashboard.md](crypto_dashboard.md)。
用户已有 config.toml 不被运行或测试命令自动覆盖。
通用默认值位于 dashboard，两个来源的默认身份位于 ccxt／tq；旧来源字段和
incremental_bars／max_catchup_pages 必须迁移，启动不保留旧配置兼容。
公共 main_pane_ratio 缺省为 0.7，TOML 必须使用严格在零和一之间的有限数值；
local／remote 覆盖共用加载与校验。浏览器设置和 query 只改变页面默认布局，
不回写文件或保存手动拖动高度；写法见 [看盘说明](../guides/crypto_dashboard.md)。
逐窗口指标覆盖仅在页面／query 设置，TOML 继续提供公共 indicators，不增加
chart_indicators 文件字段；服务公开默认值提供空映射，各窗口默认继承公共。

## 离线验证

`just test` 顺序执行 Bun 逻辑／服务回归和 Playwright 浏览器测试。
所有数据为本地 fixture；不登录真实后端，不请求外网，不隐式安装浏览器。
指标使用 trading-signals 的原生类完整重放，与应用增量结果严格对齐；
indicator-golden.json 保留固定期望，来源与读取口径见 [indicators.md](indicators.md)。
旧 EMA 专用参考 fixture 与 Python 生成器已退出，不提供再生入口。
ADX 安装回归使用新的临时目录和已有缓存，离线冻结安装生产白名单中的依赖与补丁，
执行相同文件校验并直接验证原生零波幅恢复；缺失补丁安装失败，不隐式联网。
文件漂移和命令阻断回归使用临时依赖副本，不修改工作区 node_modules 或共享缓存。
浏览器套件构建新页面、旧演示页面和原 Notebook 库，用临时配置验证旧复制目标，不能写入用户
真实 pyo3-quant 目录。虚拟鉴权后端与开发／生产适配服务只绑定本机测试端口。
测试递归核对库复制内容，并从临时目标消费 ES／UMD 声明，验证合法写法和反向类型报错。
测试结束关闭所属进程、清理临时配置；截图和失败 trace 留在忽略的 test-results。

浏览器优先用 PLAYWRIGHT_CHROMIUM_EXECUTABLE 或已安装缓存，否则使用 Playwright
默认安装。NixOS 复用已存在的动态库，不修改系统环境。
典型验证顺序为 `just check`、`just test`、`just market --build`。

## 离线内存对照

`just benchmark-memory --baseline=/path --runs=3` 为显式诊断，不进入默认测试。
在修改前通过 `just market --build` 准备基线，再将 src、dist-market、package.json、
config.example.toml 保存到独立目录，并提供可解析的同版本 node_modules；当前工作区
也须先通过正式构建准备对应产物。诊断消费已有业务产物，仅临时构建浏览器 fixture。
不自动创建／切换 JJ change，不安装依赖、下载浏览器或访问真实行情服务。

baseline 必须是独立的已准备目录；runs 为 1..10 的整数，默认 3。缺文件、未知／
重复参数及非法次数在启动服务前报错。使用同一 Bun 和已有 Chromium，轮换比较
基线服务、优化后默认服务与 --smol，并交错比较两版本的正式浏览器计算／绘图链。
两来源模拟后端只监听临时回环端口，配置使用离线凭据，退出清理所属进程和文件。

标准输出逐行 JSON：服务记录启动、四路加速请求、两秒空闲后的 RSS／匿名内存／
峰值及延迟；浏览器记录四窗口 1000／10000 根的重复、末根、追加裁剪耗时和堆大小，
以及包含已回收对象的 CDP 累计采样分配估计。三轮以上比较中位数，终态必须严格相同。
浏览器阶段间的显式 GC 仅用于测量，生产没有对应调用。加速负载不等同五秒真实
节拍，累计分配量不等同常驻内存或峰值，也不等同 Cockpit 的容器统计；不默认写报告。
