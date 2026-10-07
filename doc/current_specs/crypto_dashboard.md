# 加密货币实时看盘

## 场景与所有权

`src/crypto/index.html` 是实时看盘的独立入口，由 `vite.config.crypto.ts` 构建。
新页面复用 `LWChart`、共享图表控制器、`ChartSyncManager` 与 `GridTemplate`。
URL、控制菜单、行情状态和本地鉴权服务与旧 ZIP／Notebook 场景隔离。

本场景只读取 CCXT 加密货币行情，指标仅为 EMA。
运行配置来自根目录私有 TOML，完整字段见 [config.example.toml](../../config.example.toml)。
宿主 Bun 是唯一服务运行环境；不使用容器。

## 默认页面与显示配置

默认 Binance future、is_live=true、`BTC/USDT:USDT`；2×2 行优先排列
`30m,4h,1d,1w`，图表填满视口。EMA14／50／100 依次为橙／绿／蓝，色值
为 `#FF9800`、`#4CAF50`、`#2196F3`。更新间隔默认 5 秒。
每周期默认请求并保留最多 1500 根，数量在配置、URL 和菜单统一限制为 1..10000。
默认 theme=dark，设置可切换深色／浅色。画布、菜单、标题、状态、坐标轴、光标和
共享图例使用同一主题；首次配置加载前使用暗色背景。
只改主题更新现有图表颜色，保留系列、数据订阅和视口，不重取行情。

右上角设置按钮默认收起；菜单覆盖图表，不改变图表尺寸。
首次打开与前进／后退用 replaceState 补全完整有效 URL，保留 fragment，不增加历史项。
菜单有效修改实时预览图表并同步完整 URL；文本输入合并 250 毫秒，选择与快捷按钮
立即同步。应用保留打开前历史项并 pushState 一次；取消／关闭／Esc 恢复打开前配置
及 URL。改变预览身份可以取数，取消释放预览请求并恢复原身份。
前进／后退同时重置打开中的菜单及待提交文本，使用同一解析器；显式 URL 覆盖 TOML。

| URL／菜单字段 | 契约 |
| --- | --- |
| exchange_name | binance、kraken |
| market | future、spot |
| is_live | URL 仅 true／false；内部为 boolean |
| symbol | 非空 canonical symbol，原样传后端；至多 128 字符，无控制字符 |
| layout | 1x1、1x2、2x1、1x3、3x1、2x2，行×列 |
| timeframes | 按槽顺序逗号分隔；允许重复周期 |
| indicators | none 或 `ema,5;ema,14;ema,50`；周期 1..100000，至多 12 项且不重复 |
| refresh_seconds | 1..3600 严格整数 |
| history_bars | 1..10000 严格整数；每图初始请求与滚动保留上限 |
| theme | dark 或 light；TOML 默认 dark，菜单显示深色／浅色 |

周期为 `1m,3m,5m,15m,30m,1h,2h,4h,6h,8h,12h,1d,3d,1w`。
仅传 layout 时取默认周期的前 N 项，不够则报错；仅传 timeframes 且数量变化时，
1／2／3／4 项推断为 1x1／1x2／1x3／2x2。两者显式给出时必须匹配。
菜单改变布局保留前 N 项，新增槽从默认周期补齐。
未知／重复参数、非法类型、空项及含糊指标写法均报错，不回显未知值。
首次参数错误不取行情、不覆盖无效 URL；菜单错误保留最后有效图表和 URL。
theme 为必填配置字段，大小写变体、auto 或空值均非法；完整 URL 包含全部十个字段。

## 本地 API 与鉴权

浏览器只访问同源 GET：

```text
/api/crypto/runtime
/api/ccxt/fetch_ohlcv/latest-limit
/api/ccxt/fetch_ohlcv/since-limit
```

runtime 为 `{ defaults: DashboardOptions, data: DataBudget }`，不含 backend、server、
legacy 或凭据。history_bars 只在 defaults 中；data 仅包含增量数量与每轮补齐页数。
theme 同样只在 defaults 中；前端与本地服务必须使用匹配的新投影，升级后重启服务。
行情查询只接受 exchange_name、market、is_live、symbol、timeframe、
limit 和可选 variant=default、enable_cache=true；since-limit 另需 since。
适配层转发同名 `/ccxt/...` 路由，不提供通配或写代理。
行情查询的 limit 为 1..10000，超限在请求后端前返回 400。
API 的 Server-Timing 头以毫秒公开 upstream（鉴权、后端读取及正文解析）和 local
（本地校验与序列化）耗时，不公开后端地址或鉴权材料，适用于开发与生产。

本地服务启动时统一加载并校验 TOML。后端 HTTP／HTTPS 地址不能含用户信息、
query 或 fragment；用户名、密码必须非空，原样使用；超时为 1..300 秒。
前端仅回环监听。私有文件、备份及 Git／JJ 元数据不能通过开发或生产静态服务读取。

鉴权仅在服务端 POST `/auth/token`，表单包含 grant_type=password、username、password。
响应必须有非空 access_token、token_type=bearer、正整数 expires_in。
token 存内存；并发共享登录，按 expires_in 过期。401 只失效同代 token，原 GET
重新登录重试一次；旧 token 的迟到 401 不注销新 token。不使用 refresh token。
不向浏览器转发登录响应、Cookie 或原始错误正文，不在浏览器存储凭据。

错误形状为 `{error:{code,message}}`：400 INVALID_QUERY、405 METHOD_NOT_ALLOWED、
502 BACKEND_AUTH_FAILED／BACKEND_UNAVAILABLE／BACKEND_INVALID_RESPONSE、
504 BACKEND_TIMEOUT；取消为 499 REQUEST_CANCELLED。后端已定义的行情领域错误
保留状态和稳定 code，以受控中文消息展示，不透传未知正文。

## 行情与增量

一个状态对应交易所、市场、环境、品种、周期，variant 固定 default，后端缓存启用。
重复身份共用数据和轮询，但保留独立图表。某图失败不清空其它图。

普通周期初始 latest-limit，limit 为当前 history_bars，默认 1500；周线使用 since-limit，
since=1000000000000、相同 limit，避免大量周线倒推产生非法起点。
成功返回的有效短历史原样显示并进入 ready，不补造、不要求精确条数；空历史下轮再初始化。
响应为 `{rows,last_bar_completion_confirmed}`，rows 是升序唯一的六列
`[UTC毫秒,open,high,low,close,volume]`。整页验证时间范围、有限值、OHLC、非负成交量、
数量及 metadata：非空对应 boolean，空对应 null。false 的活跃尾根保留展示。

每轮 since 等于已接受的实际末根毫秒时间戳，limit 默认 10。非空页必须含首重叠；
覆盖末根并追加新根。满页推进时串行续页；短页结束本轮。每轮最多 20 页，达到预算
下轮从实际末根继续；空增量、缺锚点、坏页或网络错误保留已有数据并显示错误。
不通过 interval、本机时间或响应数量生成游标，不叠加网络即时重试。

同身份请求单飞。改变身份和退出取消请求／timer，已释放状态拒绝迟到响应。
每身份最多保留 history_bars 根；只改 EMA、布局、主题或节拍不重取未变身份的历史。
数量改变时取消旧请求、释放旧状态，按新数量重取和保留；同身份、同数量重复槽共享。
历史数量由 URL／菜单覆盖 TOML 默认值；增量数量 2..1000，每轮页数 1..100，仅由 TOML 配置。

EMA 用 close，前 period-1 根预热，第 period 根用 SMA 播种，再以 alpha=2/(period+1)
递推。覆盖尾根时从尾根之前的状态重算，滚动裁剪不重新播种；新增周期从保留窗口
播种，未变周期保留计算状态。预热未完成时不伪造线段。
仅在图表数据边界将毫秒除以 1000，不平移时区。

图表更新和同步契约见 [chart_updates.md](chart_updates.md)，正式命令和离线验证见
[commands.md](commands.md)。
