# 加密货币实时多周期看板

## 任务边界

### 交付物与场景边界

1. 根目录新增 `justfile`，两个场景入口为 `legacy` 与 `crypto`；独立提供帮助、检查和
   离线测试入口。package.json 只保留依赖声明和工具级原子命令。
2. 旧入口继续用 `vite.config.lib.ts` 构建 `dist-lib/`，复制目的地改为
   `~/dev/pyo3-quant/data/lwchart`。移除 package.json 的 `build:lib`，不保留同职责包装。
3. 新增独立的 `src/crypto/index.html`、`src/crypto/main.ts`、页面、URL／菜单逻辑、
   行情状态及 `vite.config.crypto.ts`。新页面不经过旧 `App.svelte` 和 ZIP 看板路由。
4. 根目录提供 `config.toml` 与 `config.example.toml`；前者为忽略跟踪的私有运行文件，
   后者为不含真实凭据的完整格式示例。配置不放进 public、前端 bundle 或 Notebook 库。
5. 图表复用 `src/components/lw-chart/LWChart.svelte` 及其控制器、图例、类型、时间工具；
   网格复用 `GridTemplate` 与既有模板。新场景的控制、参数和请求代码独立维护。
6. 将通用 `ChartSyncManager` 从旧页面的 logic 目录移到共享图表目录，同步更新旧引用。
   保持一份实现，不保留旧路径转发壳。新增卸载与重入保护服务两种场景。

必须保留旧 ZIP 配置、文件解析、回测标记、SL／TP 展示、浏览器路由、Notebook props、
`mountDashboard` 和现有库产物命名。共享组件只做必要扩展，不顺手重写这些行为。

本任务只使用 CCXT 的行情读取接口；不加入交易所直连、TQ／CTP／AMP、下单、账户
挂单／持仓线、其他技术指标、绘图工具系统、数据库或部署容器，不改动 ccxt-proxy2。
保留旧 docs 的有效内容，不进行文档目录迁移或历史任务改写。

### 停止线

文档准备阶段交付本任务的 meta、context、spec、两份配置及必要忽略规则，不创建
Justfile 或应用代码。后续实施阶段以两入口可用、默认四图与参数交互符合本规范、
增量数据和 EMA 正确、全部约定离线验证通过、受影响 current spec／guide 已同步为止。
不能以真实交易所历史不足请求数量为失败，也不能把后端错误或短历史冒充完整历史。

## 任务规范

### 入口、环境与配置所有权

- 宿主环境是唯一开发环境，复用项目的 Bun、Svelte、Vite 工具链，不增加容器或 Python。
- Just 为薄编排。通用参数与进程控制放 `scripts/` 下的 Bash，语言相关配置、Vite 和
  本地 HTTP 服务使用 Bun／TypeScript；同职责不维护两套宿主实现。
- `legacy` 只构建原 Notebook 库并复制 `dist-lib/.`；只校验它需要的配置，不因新场景
  凭据为空而拒绝旧构建。展开目的路径开头的 `~/`，不展开配置中的 `$`、`${...}`。
- `crypto --dev` 提供新 Vite 页面与本地 API，`--build` 仅生成 `dist-crypto/`，
  `--serve` 运行已构建的新页面及同一 API。构建不登录、不取行情、不内嵌运行配置。
- Vite 新入口以 `src/crypto/` 为 HTML 根；共享图表从已有源码导入。生产 HTTP 只提供
  `dist-crypto/` 的受管静态文件及明确的 API，不能把项目根目录作为静态文件根。
- `just` 默认仅显示帮助，不读私有配置、不安装依赖、不联网、不启动任何场景。
- `crypto --stop` 不读取业务配置，按 Linux /proc 定位同仓库、同入口及所选配置路径
  的 dev／serve；匹配进程启动时间防止 PID 复用。先 SIGTERM，最多等 5 秒后对仍匹配
  的同一进程 SIGKILL，不按端口杀程序；无匹配进程时成功退出，重复调用安全。
- 开发运行读取所选基础 TOML，默认是根目录 config.toml；本任务不启用 local／remote
  配置覆盖，不创建空差异文件。读取、校验只在服务启动时完成，修改后重启。
- 统一加载器拒绝未知键、错误类型及无效组合。crypto 的 username／password 必须非空，
  原样使用，不 trim 密码。缺配置或校验失败在绑定端口前以退出码 2 结束，不打印凭据。
- 后端 URL 仅允许 HTTP／HTTPS 且不含用户信息、query 或 fragment；去掉末尾 `/`。
  本任务前端服务只支持回环监听。端口 1..65535；HTTP 超时为 1..300 秒的整数。
- Vite 保留默认文件拒绝规则并阻止私有 TOML、备份、Git／JJ 元数据的文件访问；
  私有配置不能通过 `/@fs/`、public、错误堆栈或源码映射进入浏览器。

### 本地适配层与鉴权

- 浏览器与本地看盘服务同源，只访问 `/api/crypto/runtime` 和本节冻结的行情 API。
  后端地址、用户名、密码及 Bearer token 留在服务进程；不使用旧 settings／api.ts。
- `/api/crypto/runtime` 返回公开的规范化默认显示选项与行情数量预算，不返回 backend、
  legacy、server 分组或鉴权材料。前端不另维护一套默认常量作为配置失败时的回退。
- 适配层只转发 GET `/api/ccxt/fetch_ohlcv/latest-limit` 与
  `/api/ccxt/fetch_ohlcv/since-limit`，去掉 `/api` 后访问配置中的后端。不开放通配代理。
  查询参数按已核对的后端契约校验，未知参数返回本地 400，写方法返回 405。
- API 返回 Server-Timing：upstream 为鉴权和后端读取（含正文解析）的总耗时，
  local 为本地参数／响应校验及序列化耗时，单位毫秒；仅公开耗时，不公开凭据。
- 服务端 POST `/auth/token`，Content-Type 为 `application/x-www-form-urlencoded`，
  表单包括 `grant_type=password`、`username`、`password`。接受 JSON 中非空
  access_token、token_type=bearer、正整数 expires_in；不存在 refresh-token 链路。
- token 只存在内存，按 expires_in 管理有效期。并发请求共享一次正在进行的登录；
  某旧 token 遇到 401 时，只失效同一代 token，共享重新登录并将原 GET 重试一次。
  已被其他请求更新的 token 不再次失效，第二次 401 或登录失败不循环重试。
- 不向浏览器转发登录响应或 Set-Cookie。浏览器不提交后端登录密码，也不在 URL、
  localStorage、sessionStorage 或可分享布局中保存凭据。
- 请求失败、超时、取消均保留真实失败语义；不切换身份或数据源，不返回假 K 线。
  可观察错误只包含稳定错误码、可理解消息和状态码，不包含原始鉴权正文或请求头。

### 行情身份与初始历史

- 一个行情状态对应 `(exchange_name, market, is_live, symbol, timeframe, variant)`。
  本任务 variant 固定 `default`，enable_cache 固定 true；不向 URL／菜单暴露这两项。
  所选后端身份必须已启用，503 SERVICE_NOT_ENABLED／NOT_READY 应明确展示。
- 相同身份的重复周期槽共享一次获取和轮询，渲染实例仍独立。每个槽有稳定标识；
  改布局／指标不重取未改变身份的历史，改某槽周期只重建其行情订阅。
- 普通固定周期初始 GET latest-limit，limit=history_bars，默认 1500，上限 10000。分页由后端负责；
  前端不能把交易所单页上限误当成后端上限，也不使用已删除的 `/ccxt/fetch_ohlcv`。
- 周线初始 GET since-limit，since=`1000000000000`、limit=history_bars。
  这是后端允许的 UTC 毫秒下界，早于所支持加密货币的历史；用于避免大量周线倒推
  起点为负的后端限制。有效短历史原样显示，不用本机日期减 interval，也不改后端。
- 支持的周期固定为 `1m,3m,5m,15m,30m,1h,2h,4h,6h,8h,12h,1d,3d,1w`。
  `1M` 不属于本任务：后端将自然月限制为单页，不能满足统一的历史数量初始化契约。
- 后端成功形状固定为 `{ rows, last_bar_completion_confirmed }`；rows 每行有六项
  `[time, open, high, low, close, volume]`，time 为 UTC epoch milliseconds。
- 先完整校验响应再提交一页：时间是安全整数且处于后端合法范围，数值有限，成交量
  非负，OHLC 范围有效；rows 升序且时间戳唯一，长度不超过本次 limit。
  metadata 必须为 boolean／null；空 rows 必须对应 null，非空 rows 必须对应 boolean。
- `false` 只表示尾根尚无完成证据，不能据此删除尾根；实时看盘必须展示该根。
  初始空历史显示无数据，后续每个轮询周期重新尝试初始化，不凭空构造 since。
- 每身份保留最新 history_bars 根，默认最多 1500；合并后裁掉前端最旧展示行。
  初始加载完成后显示最新行情，用户仍可拖动查看保留的历史。
- history_bars 属于显示选项，TOML 提供默认值，URL 和菜单允许覆盖，统一限制 1..10000。
  改数量释放旧请求及状态，按新上限重新取历史；同身份且同数量的重复槽继续共享请求。
  后端成功返回不足请求数量的合法 rows 仍为 ready，原样显示，不补造、不要求精确条数。
- 新看盘价格轴上下各保留 3% 空间，以当前可见 K 线的 high／low 自动缩放。
  EMA 不参与主价格轴的范围计算，避免长期 EMA 把 K 线压缩到中间；旧场景边距不变。

### 增量、断网与并发

1. 初始成功后，以 refresh_seconds 的固定节拍轮询，默认 5 秒；正在处理的身份跳过
   新节拍，不创建叠加请求。各周期分别加载、显示错误，单图失败不清空其他图。
2. 令 T 为该身份最后一根已接受 K 线的原始毫秒时间戳；GET since-limit 的
   since=T、limit=incremental_bars，默认 10。正常同根更新也走此接口，不改成 limit=1。
3. 非空页必须包含 time=T 的重叠行，不能出现 time<T。重叠行用新 OHLCV 覆盖旧值，
   新时间戳追加后保持严格升序／唯一。缺重叠点、错误 schema 或非法值不合并，不推进 T。
4. 成功页提交后，用其实际末根作为新的 T。满页且 T 前进时，在同一轮串行继续请求
   下一页；短页或仅含重叠根时结束本轮。不使用 `T+interval`、Date.now 或响应条数猜游标。
5. 每轮每身份最多 max_catchup_pages 页，默认 20；满页达到预算显示正在补齐，下一
   节拍从已接受的实际 T 继续。若满页没有进展，按数据错误结束，禁止无限补页。
6. 某页失败保留已成功接受的数据与实际 T，下个节拍继续请求；不把超时、401、502
   或空增量页当成到达最新。空增量页显示待恢复状态，保留已有图。
7. HTTP 等待按配置超时，可取消；不额外叠加即时网络重试，除了本规范的一次 401
   重新登录。网络恢复后通过相同重叠分页补齐超过 10 根的缺失历史。
8. 品种／周期／身份变化和页面退出时取消相关请求与轮询，使用配置代次阻止旧响应
   写入新状态；不同身份数据永不混合。已无槽引用的状态、timer、图表和同步注册应释放。

### EMA 与图表更新

- 指标仅支持 EMA，类型与参数解析只有一份；未来增加其他指标时另行扩展，不搭建
  未使用的插件框架。period 为 1..100000 的整数；同一配置不允许重复 period。
- EMA 输入为 close，alpha=`2/(period+1)`。前 period-1 根不画线，第 period 根用该
  窗口的 close 简单平均播种，此后按 `EMA=alpha*close+(1-alpha)*previousEMA` 递推。
  period=1 时 EMA 等于 close；历史不足 period 时只显示未完成预热，不伪造线段。
- 保存活跃末根之前的 EMA／预热状态。含首覆盖末根时，从该状态重算末根，再顺序
  计算新根；不能把已计算的同一活跃根反复当作 previousEMA。窗口裁剪不重新播种。
- 新增或改变 period 的 EMA 从当时保留的历史播种；未改变的 period 继续原计算状态。
  移除指标释放其状态，不为已移除的指标维护后台计算。
- 默认 EMA14 为橙 `#FF9800`、EMA50 为绿 `#4CAF50`、EMA100 为蓝 `#2196F3`；
  自定义指标按声明顺序循环使用同一三色表。无指标时不创建 EMA 系列。
- 所有网络游标、去重键与指标计算保留毫秒；只在共享图表数据边界转为 UTC 秒。
  不能为显示本地时区而平移原始时间戳。
- 既有 `series` props 保持结构／静态数据初始化职责。新场景初始化创建稳定命名的
  `candles`、`ema-<period>` 系列，轮询不修改该结构 props。
- 新增可选 `seriesMode`，默认 replace 保持旧静态重建行为；新场景使用 reconcile。
  reconcile 仅协调结构与样式：相同 name／type／pane 保留实例，按需增删指标系列，
  不用 props 的 data 覆盖未变系列；新建系列可以使用其 data。数据更新统一走补丁接口。
  两种模式共用原控制器、系列创建与清理实现，不复制图表引擎或另建实时图表组件。
- 在原 LWChart／ChartController 扩展 `replaceSeriesData` 与 `updateSeriesData`，均
  操作已创建的命名系列：初始化或身份重置使用 setData，重叠尾根与新根使用 update。
  每次替换／更新前验证所有系列名称、类型和时间顺序，不留下半应用的错误批次。
- 展示窗口淘汰旧行或历史更正必须替换时，对既有系列批量 setData，不删除／重建
  series 或 chart；只有结构改变才增删 EMA 系列。以时间锚点恢复用户可视范围。
- 用户跟随最新行情时保持跟随，拖动查看历史后不因轮询 reset／fitContent／强制右移。
  数据更新不触发图表卸载，旧 props 的静态入口继续符合原行为。
- 图例沿用 LegendManager，系列移除／结构替换时清理注册，不保留已销毁 series 引用。
- 十字光标时间联动默认开启，复用共享同步器和既有不晚于目标时间的匹配逻辑；
  对应图中无可匹配历史时清除同步光标。这里只同步时间，不承诺横向价格线或缩放联动。
  鼠标离开时清除其他图光标；程序设置光标不能反馈成无限广播。
- ChartController、共享类型和新手写文件遵守 400 行限制；必要拆分仅围绕既有职责，
  不建立第二份控制器、渲染实现或时间映射算法。

### 页面与参数状态

- 默认 2×2 行优先排列：左上 30m、右上 4h、左下 1d、右下 1w。四图填满 viewport，
  不带旧 Header、文件选择、表格视图或底部回测栏；网格无固定最小尺寸和外层滚动条。
- 每图只保留必要的品种、周期、图例及局部加载／失败／补齐状态。右上角提供半透明
  悬浮控制按钮，菜单默认收起；展开为覆盖层，不缩小或重新挂载图表。
- URL 与菜单共用规范化 DashboardOptions 和校验／序列化规则，不各自实现默认值。
  首次打开及前进／后退时，用 replaceState 补全全部有效参数，保留 fragment，
  不因补全增加历史项。无效 URL 不被默认值静默覆盖，也不取行情。
  菜单有效修改实时预览图表，并 replaceState 同步完整 URL；文本输入合并 250 毫秒，
  选择与指标快捷按钮立即同步。非法编辑保留最后有效配置、URL 和图表。
  应用保留打开前历史项并提交一个 pushState；取消／关闭／Esc 恢复打开前配置及 URL。
  预览改变行情身份可以取数，取消时释放预览请求并恢复原身份。后退时打开中的菜单
  同步到导航后的配置，不能把旧编辑延迟提交回来。
- 同一字段优先级是显式 URL > TOML 默认值。浏览器前进／后退重新解析 URL；新开
  页面使用 URL 与 TOML，不从旧 settings 或旧浏览器密码存储继承新场景状态。
- 参数错误不发请求：首次进入显示可恢复的参数提示；菜单无效输入保留原图和 URL。
  身份改变可显示加载态；只改 EMA 重用历史，只改 refresh_seconds 不重载历史。
- 布局菜单减少槽时保留前 N 个周期；增加槽时从默认周期补齐，允许重复周期。
  修改单槽周期只影响该槽，同步时写回完整 timeframes 列表。

## 公开接口与用户写法

### 配置与入口

根目录 [config.example.toml](../../../config.example.toml) 是完整可复制模板。
backend.username／password 留空供用户填写；secret config.toml 不跟踪，不进入产物。
关键默认值为 backend.base_url=`http://127.0.0.1:5123`、server.host=`127.0.0.1`、
server.port=5174、dashboard.exchange_name=binance、market=future、is_live=true、
symbol=`BTC/USDT:USDT`、layout=`2x2`、timeframes=`[30m,4h,1d,1w]`、
indicators=`[ema,14;ema,50;ema,100]`、refresh_seconds=5、history_bars=1500、
incremental_bars=10、max_catchup_pages=20、legacy.library_target_dir 为约定的新路径。

数量约束：history_bars 为 1..10000，incremental_bars 为 2..1000，
max_catchup_pages 为 1..100，refresh_seconds 为 1..3600，全部为严格整数。
默认周期数量与 layout 的槽数必须相同；indicators 是 canonical 指标字符串数组，
最多 12 项，空数组表示不画指标；market／exchange_name／is_live 与后端枚举一致。

实施后正式入口：

```bash
just                                      # 仅帮助
just legacy                               # 等同 --build，构建并复制旧图表库
just legacy --build --config=config.toml
just crypto                               # 等同 --dev
just crypto --dev --config=config.toml     # http://127.0.0.1:5174/
just crypto --build                       # 仅构建 dist-crypto，不需要真实凭据
just crypto --serve --config=config.toml   # 运行已构建静态页面和本地适配层
just crypto --stop                        # 停止所选配置的 dev／serve，无需有效凭据
just check                                # 全部正式静态检查
just test                                 # 全部本任务与旧场景离线验证
```

每个场景支持 `--help`；crypto 四个动作互斥，未知参数、缺失值或冲突动作退出码 2。
`--serve` 缺少匹配产物时明确失败，不自动构建。运行入口实时输出并保留子进程退出码，
Ctrl+C 清理所有所属子进程。构建／复制失败即停止，不执行后续动作。
package.json 移除 build:lib，将复合 check 编排交给 Just，工具检查分别使用
`check:svelte` 与 `check:ts`；dev／build／preview 保持工具调用，不包含复制目的路径。

### URL 与菜单字段

| 参数 | 写法／限制 | 菜单控件 |
| --- | --- | --- |
| exchange_name | binance 或 kraken | 交易所选择 |
| market | future 或 spot | 市场选择 |
| is_live | 仅 true／false | 行情环境选择 |
| symbol | 非空 CCXT canonical symbol；原样传后端，不猜简称 | 品种输入 |
| layout | 1x1、1x2、2x1、1x3、3x1、2x2；行×列 | 布局选择 |
| timeframes | 按槽顺序逗号分隔的支持周期 | 每槽周期选择 |
| indicators | none 或分号分隔的 ema,<period> | 清空／新增 EMA 与周期输入 |
| refresh_seconds | 1..3600 整数 | 更新间隔输入 |
| history_bars | 1..10000 整数；默认 1500 | 历史 K 线数量输入 |

菜单控制同一组字段，不提供 URL 中不存在的显示配置。增量／分页预算只由 TOML 控制。
重复参数、未知参数、空必填值、空列表项、非法整数、未知指标类型均明确报错；
`is_live=1`、`timeframes=1M`、`indicators=ema14` 不作为兼容写法接受。

仅传 layout 时，从默认 timeframes 取前 N 项；不够则报错。仅传 timeframes 且其数量
改变时，按 1→1x1、2→1x2、3→1x3、4→2x2 选择布局；数量未变保留配置默认布局。
两者都显式传入时必须匹配槽数；不静默截断明确的周期列表。
序列化使用 URLSearchParams 正确编码，首次打开和菜单预览写入完整有效字段，
返回／前进采用同一解析器；应用、取消和历史项规则见页面与参数状态。

```text
http://127.0.0.1:5174/
http://127.0.0.1:5174/?symbol=ETH%2FUSDT%3AUSDT
http://127.0.0.1:5174/?timeframes=15m%2C1h%2C1d%2C1w&indicators=ema%2C5%3Bema%2C14%3Bema%2C50
http://127.0.0.1:5174/?layout=1x2&timeframes=30m%2C4h&indicators=none
http://127.0.0.1:5174/?market=spot&symbol=BTC%2FUSDT&timeframes=1h
http://127.0.0.1:5174/?history_bars=500
```

反例：`?layout=2x2&timeframes=30m,4h` 是槽数不匹配；`?indicators=ema,0` 是无效
period；`?password=secret` 是未知参数。错误提示不回显未知参数的值。

### 后端 HTTP 与共享图表接口

登录请求只在本地服务进程中执行：

```http
POST /auth/token
Content-Type: application/x-www-form-urlencoded

grant_type=password&username=your-user&password=your-password
```

成功响应形状为 `{ "access_token": "...", "token_type": "bearer", "expires_in": 3600 }`。
随后向后端发 GET 并附 `Authorization: Bearer <access_token>`。鉴权材料不写进浏览器 URL。

```text
GET /ccxt/fetch_ohlcv/latest-limit?exchange_name=binance&market=future&is_live=true&symbol=BTC%2FUSDT%3AUSDT&timeframe=30m&variant=default&enable_cache=true&limit=1500
GET /ccxt/fetch_ohlcv/since-limit?exchange_name=binance&market=future&is_live=true&symbol=BTC%2FUSDT%3AUSDT&timeframe=1w&variant=default&enable_cache=true&since=1000000000000&limit=1500
GET /ccxt/fetch_ohlcv/since-limit?exchange_name=binance&market=future&is_live=true&symbol=BTC%2FUSDT%3AUSDT&timeframe=30m&variant=default&enable_cache=true&since=1718000000000&limit=10
```

第三个示例中的 since 是该序列已接受的真实末根，不由示例时间或 interval 生成。
浏览器使用相同查询串和 `/api/ccxt/...` 路径，由本地适配层添加 Bearer。

```json
{"rows":[[1718000000000,100,105,99,104,12.5]],"last_bar_completion_confirmed":false}
```

`GET /api/crypto/runtime` 的 JSON 形状冻结为 `{ defaults: DashboardOptions, data: DataBudget }`。
DashboardOptions 字段就是 URL 表中的九项，timeframes 为字符串数组，indicators 为
`{ type: "ema", period: number }[]`；history_bars 只在 defaults 中，DataBudget 仅有
incremental_bars、max_catchup_pages。此投影不包括后端 URL／凭据或运行服务端口。
本地行情 API 的 limit 同样限制在 1..10000；参数非法时在取数前返回 400。

本地错误 JSON 固定为 `{ "error": { "code": "...", "message": "..." } }`。
参数错误为 400 INVALID_QUERY；后端重复 401／登录失败为 502 BACKEND_AUTH_FAILED；
超时为 504 BACKEND_TIMEOUT；连接失败为 502 BACKEND_UNAVAILABLE。后端已定义的
领域错误保留 HTTP 状态及稳定 code，用受控消息表达；未知正文不原样透传。

共享接口新增 SeriesDataPatch，结构为 `{ name: string, data: CandlestickData<UTCTimestamp>[]
| LineData<UTCTimestamp>[] }`；只支持本任务使用的 candle／line 数据类型，原 SeriesConfig
保持原静态契约。新增 props 为 `seriesMode?: "replace" | "reconcile"`，默认 replace。
reconcile 模式要求非空、唯一的系列 name；只改变结构和样式，静态 data 使用规则见
任务规范。LWChart 的导出方法与 onRegister 都提供下列同名数据接口。本例已创建
candles 和 ema-1 系列，展示 EMA1 与 close 相同、重复尾根被覆盖的真实调用形状：

```ts
import type { UTCTimestamp } from 'lightweight-charts';
const time = 1718000000 as UTCTimestamp;
chartApi.replaceSeriesData([
  { name: 'candles', data: [{ time, open: 100, high: 105, low: 99, close: 104 }] },
  { name: 'ema-1', data: [{ time, value: 104 }] },
]);
chartApi.updateSeriesData([
  { name: 'candles', data: [{ time, open: 100, high: 105, low: 99, close: 103 }] },
  { name: 'ema-1', data: [{ time, value: 103 }] },
]);
```

图表数据使用 UTC 秒。replaceSeriesData 的空 data 清空该系列；updateSeriesData 的
空 data 是无操作。未知／重复系列名称、类型不符、重复／乱序时间或早于已显示末根
的增量批次明确抛错，不自动建系列。
注册 API 时系列结构必须已准备好。改变指标集合更新结构，保留 candle 实例和视口。
旧 onRegister 既有方法及旧 props 用法保持有效，不要求旧调用方改用新数据接口。

## 测试、验证与阶段过渡

### 离线验证契约

实施阶段新增 Bun 逻辑／服务测试及 Playwright 浏览器回归，纳入 `just test`。
mock、fixture、临时配置和本地 HTTP 服务替代真实后端／交易所；默认命令禁止外网
请求、真实登录和真实写路由。浏览器与依赖须在环境准备阶段安装，测试不隐式下载。

| 范围 | 必须证明的行为 |
| --- | --- |
| 配置与入口 | 默认值、私有文件忽略、密码字面值、非法配置启动失败、两个场景职责、帮助无副作用、互斥／未知参数失败 |
| 鉴权与代理 | Password Grant 表单、单次并发登录、过期与旧 token 401 竞争、原 GET 仅重试一次、失败不泄密、不转发写方法或未知查询 |
| 初始历史 | 各周期默认请求 1500；配置／URL／菜单数量上限 10000；更改数量重取并裁剪；短历史为成功、空历史重试；周线合法 since；实时尾根保留 |
| 增量与恢复 | since 等于实际末根且 limit=10；同根覆盖、多根追加、满页继续、超过 10 根断网、预算跨轮续传、缺锚点／非法页不推进游标 |
| 并发与生命周期 | 5 秒节拍、慢请求不重叠、重复周期共享取数、单图失败隔离、切品种丢弃旧响应、退出释放 timer／请求／同步注册 |
| EMA | SMA 播种、period=1、预热不足、同根多次修正不漂移、批量补根、窗口裁剪后与从初始序列连续计算的参考结果一致 |
| 共享图表 | 稳定实例、增量只更新必要点、裁剪 setData 不重建、用户视口保持、指标结构变更保留 candle、过期图例注册清理、同步不递归 |
| URL 与菜单 | 正例／反例、初始补全、实时预览、非法输入不提交、编码往返、布局槽数、单槽更改、none、取消恢复、pushState 与后退同步打开中的菜单 |
| 浏览器默认页面 | 四槽位置正确、图表填满窗口、无旧 Header、菜单初始隐藏、展开不缩图、同步时间及离开清除、局部错误／补齐状态 |
| 旧场景 | 代表性 ZIP／Parquet、回测箭头与 SL／TP、原网格及同步、Notebook mountDashboard 和产物导出行为不变 |
| 加载与留白 | 保持四身份并发、完整历史和逐图显示；耗时头不泄密；上下 3% 边距、EMA 不扩张蜡烛范围；同一价格 formatter 实例复用 |

旧构建复制验证使用临时目标目录，不能把离线测试输出写进用户真实 pyo3-quant 数据。
测试产物检查用独特的虚拟密码标记，证明 runtime JSON、静态文件、库产物、错误正文
和日志均不包含该标记；Vite `/@fs/` 私有配置访问应拒绝，生产静态服务应返回 404。
数据与 EMA 测试必须比较结果和不变量，不只检查请求次数或 mock 自身行为。

正式静态入口 `just check` 覆盖既有与新 Svelte、TypeScript、服务脚本和 Vite 配置，
不得自动格式化或重写源码。验收依次执行 `just check`、`just test`、`just crypto --build`，
并由离线套件验证原库构建与临时目录复制。新增产物目录加入忽略规则。
真实账户与在线行情不属于默认验收；如后续要求在线验收，单独取得范围与入口授权。
用户授权在线排查时，临时探针单独运行，分开测量 HTTP 等待、JSON 解析与页面就绪，
不把请求慢写成前端渲染慢，也不为速度减少约定历史或修改 ccxt-proxy2 的线程锁。

### 阶段过渡与恢复条件

1. 文档与配置阶段：只新增任务文档、根目录配置和必要忽略规则。配置是后续入口的
   输入模板，不给旧程序附加运行行为；旧 package scripts 和库构建仍可用。不运行
   构建、测试、lint 或类型检查，只核对文档、接口证据、配置字段和引用一致性。
2. 入口实施阶段：在同一 task change 中实现 Just、配置加载、两个场景编排与本地适配。
   新入口尚无页面时不对外宣称可用；先使 `just legacy` 接替旧 build:lib，再移除旧脚本。
   不保留并行维护链路，不允许旧库构建暂时不可用。
3. 图表与页面阶段：在同一 change 扩展共享数据 API、同步注册与必要结构更新，再接
   初始／增量数据、EMA、URL 和菜单。旧静态调用全程可用，无临时新旧绘图系统。
4. 验证与规范同步阶段：全部约定离线验证通过，更新计划中的受影响 current spec 与
   `doc/guides/crypto_dashboard.md`；必要时只修正旧使用说明中的构建命令及新路径。
   guide 明确后端用户、白名单及历史可用性要求，不复制第二套设计规范。

数量从 DataBudget 移入 DashboardOptions 后，前端与本地代理须来自同一 revision；
更新需重启看盘服务加载配置和新的 runtime 投影，不维护旧字段兼容链路。

必须通过的静态检查、旧场景回归或数据不变量失败均阻断实施交付；不能在失败后
改 spec 将其推给未来任务。本任务不安排桥接、兼容包装或阶段性测试失败豁免。
新增文件和涉及的原文件按 AGENTS.md 保持行数约束，版本操作只在本地任务范围内，
推送或调整远端／发布线须另行明确授权。
