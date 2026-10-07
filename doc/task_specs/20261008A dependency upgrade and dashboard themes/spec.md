# 依赖升级与看盘主题

## 任务边界

- 交付全部 package.json 直接运行／开发依赖的最新稳定版本及对应 bun.lock；
  使用既有 Bun 升级，不增加 uv／Python 或全局工具安装。
- 将旧 rolldown-vite 别名与 override 替换为正式 Vite 8，处理受影响的配置、类型和旧代码。
  旧浏览器入口、Notebook 库、ZIP／Parquet 数据与自定义交易标记保持既有能力。
- 为 `just crypto` 加入默认深色和设置中的深／浅选择，与完整 URL、配置默认值同步。
  必要时扩展共享图表和图例；旧场景维持现有浅色默认。
- 保留数据请求、历史数量、EMA、增量恢复、布局与光标联动语义，主题切换不重取历史。
  不修改后端、不新增交易功能、不迁移未受影响的旧业务或文档。
- 完成约定检查、构建及离线浏览器验证即可交付；不得通过降级必需验证或重新创建
  图表掩盖兼容问题。本任务不包含远程推送、发布或全局环境变更。

## 任务规范

### 依赖与构建

- package.json 声明可维护的版本范围，bun.lock 冻结实际解析版本；不保留旧 Vite 别名。
  packageManager 与现有宿主 Bun 一致，不安装第二份运行时。
- 所有场景使用同一正式 Vite／Svelte 插件链；crypto 明确使用根目录 Svelte 配置，
  不因自己的 HTML 根目录采用另一套预处理默认值。
- TypeScript 采用官方并行安装方式：@typescript/native 是最新版 typescript 的别名，
  提供 tsc；typescript 是最新版 @typescript/typescript6 的别名，提供 Svelte 必需的
  JS API。svelte-check 显式 --tsgo，正式检查都使用 7 编译器，不加检查失败回退。
- 按新工具正式配置适配弃用选项；库的 ES／UMD 文件名、全局名和 mountDashboard 保持。
  旧浏览器入口将表格库独立成包，不改变 ZIP／Parquet 文件查看器的调用与表格行为。
  若依赖存在真正不兼容，定位实际限制，不静默把旧版本宣布为最新或弱化检查。

### 主题状态与更新

- DashboardOptions 增加必填 theme，值仅为 dark／light；公开模板与本地私有配置默认 dark。
  同字段遵循 URL > TOML，完整 URL 序列化加入 theme。
- 菜单新增主题选择，沿用实时预览、应用、取消、Esc 与前进／后退的同一状态链。
  不引入 localStorage 或另一个默认值来源；无效主题在取行情前报错。
- crypto 集中维护深浅配色表，画布与 DOM 使用同一选中主题。初始空白／加载状态
  使用暗色底，菜单、标题、状态文字、坐标轴、网格、光标和共享图例保证可辨识。
- 图表初始创建应用主题；后续切换只通过原 ChartController 的 applyOptions 更新
  颜色。不得重建 chart／series、setData、fitContent、resetTimeScale 或改变用户视口。
  配色更新不携带初始化的 rightOffset、autoscale 或边距设置。
- 图例沿用 LegendManager，通过页面 CSS 变量变化；变量未提供时保持旧浅色值。
  蜡烛涨跌色、EMA 橙绿蓝顺序和上下 3% 边距维持原约定。
- 主题变化不进入 MarketHub 行情身份，也不因重新创建等价指标数组重建数据订阅。

### 校验与失败语义

- TOML 启动时、URL 解析与菜单提交前共用 normalizeOptions 校验 theme；空值、
  大小写变体及其他字符串明确失败，不回退到 dark。
- 初始化 URL 非法不请求行情；非法菜单编辑保留最后有效设置／URL／图表。
  runtime 投影包含 theme，仍不暴露后端凭据。
- 本地 config.toml 的改动只增加该字段，保留用户现有身份、端口和鉴权信息及文件权限。

## 公开接口与用户写法

### 依赖与命令

依赖安装／升级沿用 Bun：

```bash
bun install --frozen-lockfile
bun update --latest
just crypto
just crypto --build
just legacy --build --config=config.toml
just check
just test
```

Vite 作为正式依赖写入 package.json；uv 不管理本项目库。Just 场景动作不改变。

### 主题参数

```toml
[dashboard]
theme = "dark"
```

这是完整 config.example.toml 中 dashboard 的新增字段，其他必填字段仍按现有模板。
浅色默认可以在该字段写 `"light"`，修改 TOML 后重启看盘服务。

```text
http://127.0.0.1:5174/
http://127.0.0.1:5174/?theme=light
http://127.0.0.1:5174/?theme=dark&layout=1x2&timeframes=30m%2C4h
```

第一例从 TOML 读取 dark 并自动补全完整参数；第二例覆盖为浅色。
设置中的“主题”提供“深色”“浅色”，有效选择立即预览并同步 theme；取消恢复打开前值。
`?theme=auto`、`?theme=Dark` 和 `?theme=` 明确报参数错误，不默默采用默认主题。
runtime 的 defaults 新增 theme，因此 DashboardOptions 的 URL 字段从九项变为十项。

### 共享图表

LWChart 的导出方法和 onRegister 的 ChartApi 都提供：

```ts
import type { ChartOptions, DeepPartial } from 'lightweight-charts';
const colors: DeepPartial<ChartOptions> = {
  layout: { textColor: '#d1d4dc' },
  grid: { vertLines: { color: '#242833' }, horzLines: { color: '#242833' } },
};
chartApi.applyOptions(colors);
```

该方法在原控制器上更新现有图表选项，不承担数据或主题状态存储职责。
既有导出方法、props 和注册回调仍有效，旧调用方不需要新增参数。

## 测试、验证与阶段过渡

1. 依赖阶段先升级和适配，执行 `just check`、`just test` 与 `bun run build`，
   离线套件覆盖 crypto 与旧库构建／复制、旧 ZIP／Parquet／自定义标记浏览器入口。
   通过后进入主题阶段，不把旧入口兼容问题拖到主题完成之后。
2. 主题阶段同步模型、URL、TOML 模板／私有配置、菜单、共享图表和图例，全部调用方
   同步到新 runtime 投影，不保留缺少 theme 的长期兼容链路。
3. 验证主题参数的合法／非法配置、编码往返、默认补全、菜单预览／取消和历史导航；
   浏览器证明初始画布与 DOM 为深色，浅色可切换，光标同步与实时行情仍工作。
   切换时保持 chart／canvas 实例和可视位置，不重取历史；旧场景保持浅色图例。
4. 完成受影响 current spec 与 guide 同步，执行正式 `just check`、`just test`、
   `just crypto --build` 及旧浏览器构建检查，核对 warning／deprecation 和失败汇总。

默认验证全部离线，用既有 fixture／mock；不新增自动在线登录或交易请求。
升级依赖的 registry 访问属于用户本次授权。浏览器不隐式下载或修改全局环境。
本任务不批准桥接、测试失败豁免或功能暂不可用；新配置和产物须来自同一 revision，
更新后用户重启 `just crypto` 即加载新 runtime。清理本次启动的预览服务，避免占用端口。
本地版本操作限于新任务 change；不重写前置任务，不推送远端。
