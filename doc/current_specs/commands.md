# 命令与运行配置

## 场景入口

根 `justfile` 为薄编排，默认 `just` 仅显示帮助。
`scripts/scenario.sh` 统一解析参数，安全透传 argv，不 eval。
宿主 Bun／Bash 是唯一开发环境；本项目不使用开发或生产容器。

```bash
just legacy                               # 默认 --build
just legacy --build --config=config.toml
just crypto                               # 默认 --dev
just crypto --dev --config=config.toml
just crypto --build
just crypto --serve --config=config.toml
just crypto --stop                         # 停止本项目当前配置的 dev／serve
just check
just test
```

每个场景支持 --help；动作互斥，未知参数、空配置路径及旧场景的 dev／serve／stop 退出 2。
帮助不读取配置、不构建、不联网。缺配置／配置非法在绑定服务前退出 2。
配置在启动时读取，修改后重启；本任务不启用 local／remote 覆盖。

legacy 只校验 legacy.library_target_dir，按 `vite.config.lib.ts` 构建 dist-lib，复制
`dist-lib/.` 到目标目录。默认目标 `~/dev/pyo3-quant/data/lwchart`；仅展开开头的 ~/，
其它 `$` 和 `${...}` 保持字面值，路径空格安全。失败停止，不继续复制。
原 package.json build:lib 退出，不保留同职责包装。

crypto dev 以 `src/crypto` 为 Vite 根，端口来自 TOML，默认 5174。
该入口同时支持 CCXT／TQ 只读看盘，名字保持 crypto。
crypto build 只构建 dist-crypto，不读凭据、不登录、不请求行情。
crypto serve 只运行已有 dist-crypto，缺少 index.html 明确失败，不隐式构建。
开发中间件与 Bun 生产服务共用同一配置、鉴权与 API 实现；生产静态根仅 dist-crypto。
服务只监听回环地址，Ctrl+C 关闭所启动的服务。
crypto stop 不读业务配置，不需要有效凭据。按 Linux /proc 匹配同仓库、同入口、同
配置路径的 dev／serve；不会按端口杀其它程序。先 SIGTERM，等待最多 5 秒，仍为同一
进程时 SIGKILL。没有匹配进程时成功退出；--config 可选，默认 config.toml。

package.json 只保留依赖、工具级 dev／build／preview 和原子检查命令。
check:svelte 检查全部前端；check:ts 检查 Vite／Playwright 配置；check:runtime 严格
检查 Bun 服务及测试，允许由 Bun 转译的 TypeScript class 语法。
Just 串行组织检查，均不格式化或改写源码。

## 依赖与构建工具

package.json 与 bun.lock 是唯一项目依赖链，安装使用 `bun install --frozen-lockfile`，
显式升级使用 `bun update --latest`；本项目没有 uv 管理的 Python 依赖。
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

## 离线验证

`just test` 顺序执行 Bun 逻辑／服务回归和 Playwright 浏览器测试。
所有数据为本地 fixture；不登录真实后端，不请求外网，不隐式安装浏览器。
EMA 独立标准结果已保存在 fixture 中。Python 生成器仅用于显式再生参考数据，
不是 just test 的调用方，不为服务或默认测试引入 Python 依赖。
浏览器套件构建新页面、旧演示页面和原 Notebook 库，用临时配置验证旧复制目标，不能写入用户
真实 pyo3-quant 目录。虚拟鉴权后端与开发／生产适配服务只绑定本机测试端口。
测试结束关闭所属进程、清理临时配置；截图和失败 trace 留在忽略的 test-results。

浏览器优先用 PLAYWRIGHT_CHROMIUM_EXECUTABLE 或已安装缓存，否则使用 Playwright
默认安装。NixOS 复用已存在的动态库，不修改系统环境。
典型验证顺序为 `just check`、`just test`、`just crypto --build`。
