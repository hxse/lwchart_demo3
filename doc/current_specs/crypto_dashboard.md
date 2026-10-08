# 多周期行情看盘

## 场景与所有权

`src/crypto/index.html` 是只读看盘入口，仍由 `just crypto` 运行。
CCXT 加密货币和 TQ 期货共同复用 LWChart、ChartController、ChartSyncManager 和 GridTemplate。
网络参数与原始响应分别适配，之后共用行情窗口、EMA、图表和设置，不维护两套绘图系统。
旧 ZIP／Notebook 入口保持独立；本入口不提供交易、订单、账户或主连映射查询。

宿主 Bun 为唯一服务运行环境，运行配置来自根目录私有 config.toml。
完整公共模板见 [config.example.toml](../../config.example.toml)，鉴权材料不进入浏览器。

## 默认页面与设置

默认 source=ccxt、Binance future 实盘、BTC/USDT:USDT；2×2 行优先排列
30m／4h／1d／1w。四图填满 viewport，菜单为右上角覆盖层，默认收起。
EMA14／50／100 依次为橙 #FF9800、绿 #4CAF50、蓝 #2196F3。
默认暗色、5 秒节拍、最多 1000 根历史；history_bars 为 1..10000。
TQ 默认身份为 KQ.m@SHFE.rb；切到 TQ 隐藏 CCXT 交易所、市场、行情环境。

菜单只编辑草稿。主题、来源、周期、数量、指标和时区全部点击“应用”后才生效，
一次提交配置与完整 URL。编辑不触发行情身份变更，已生效配置的后台轮询继续。
取消／关闭／Esc 丢弃草稿；应用有变化时只 pushState 一次，无变化不新增历史项。
前进／后退重新解析 URL 并重置打开中的草稿；首次与导航用 replaceState 补全有效参数，
保留 fragment。非法 URL 不自动修复或取行情，可通过菜单应用有效配置恢复。

## 配置与参数

[dashboard] 唯一维护通用默认显示设置；[ccxt]／[tq] 唯一维护各来源默认身份。
URL 同字段覆盖 TOML。先确定 source，再加载对应默认品种；仅写 ?source=tq 使用螺纹主连。
菜单切来源也使用该来源的默认身份，保留已编辑的通用显示字段。

| URL／菜单字段 | 契约 |
| --- | --- |
| source | ccxt／tq，默认 ccxt |
| symbol | 非空完整品种名，至多 128 字符，无控制字符；按来源原样传后端 |
| exchange_name | 仅 CCXT，binance／kraken |
| market | 仅 CCXT，future／spot |
| is_live | 仅 CCXT，URL 为 true／false，内部 boolean |
| layout | 1x1、1x2、2x1、1x3、3x1、2x2，行×列 |
| timeframes | 按槽顺序逗号分隔，允许重复周期 |
| indicators | none 或 ema,5;ema,14;ema,50；period 为 1..100000，至多 12 项且不重复 |
| refresh_seconds | 1..3600 严格整数 |
| history_bars | 1..10000 严格整数，初始请求和保留上限 |
| theme | dark／light，默认 dark |
| timezone | local、UTC 或 Intl 接受的 IANA 时区，默认 local |

完整 CCXT URL 有十二字段，TQ 有九字段，不保留 inactive 来源参数。
未知／重复／空参数、非法类型和无效时区明确报错，不回显未知值。
TQ 不能携带 market、exchange_name 或 is_live；不伪装成 CCXT 交易所。

周期列表为 1m、3m、5m、15m、30m、1h、2h、4h、6h、8h、12h、1d、3d、1w。
仅传 layout 时取默认周期前 N 项；默认不足则报错。仅传 timeframes 且数量变化时，
1／2／3／4 项推断 1x1／1x2／1x3／2x2。显式两者必须匹配。
菜单改变布局保留前 N 项，新增槽从默认周期补齐。

旧 dashboard 的身份字段移入 [ccxt]；incremental_bars、max_catchup_pages 与 runtime.data
退出，不保留启动兼容。配置、API 和页面须同版本；配置更新后重启服务。

## 本地 API 与鉴权

浏览器只访问同源 GET：

```text
/api/crypto/runtime
/api/ccxt/fetch_ohlcv/latest-limit
/api/tq/fetch_ohlcv
```

runtime 是 `{defaults: DashboardOptions,sources: {ccxt: CcxtDefaults,tq: TqDefaults}}`。
ccxt 只有 exchange_name／market／is_live／symbol，tq 只有 symbol；defaults 是选中来源
身份与通用配置的投影。没有后端地址、凭据、server 或 legacy 字段。

CCXT query 接受 exchange_name、market、is_live、symbol、timeframe、limit，及可选
variant=default／enable_cache=true。TQ 接受 symbol、duration_seconds、data_length，
及可选 enable_cache=true；本入口固定无复权。数量均为 1..10000。
TQ 周期按秒传递，30m／4h／1d／1w 为 1800／14400／86400／604800，其余按单位转换。
原本地 since-limit 返回 404；since、TQ limit、CCXT data_length、重复参数或写方法
在调用后端前拒绝。只转发以上同名后端 GET，不提供通配或写代理。

两来源共用 Password Grant 和服务端内存 Bearer。并发共用登录，按 expires_in 过期；
401 只失效同代 token，原 GET 重新登录重试一次，迟到旧 401 不注销新 token。
用户名和密码非空且原样使用，不使用 refresh token，不在浏览器存储凭据／Cookie。
TQ 后台账户由后端管理，本项目 [tq] 只配置默认品种。

本地错误为 `{error:{code,message}}`：400 INVALID_QUERY、405 METHOD_NOT_ALLOWED、
404 NOT_FOUND、502 BACKEND_AUTH_FAILED／BACKEND_UNAVAILABLE／BACKEND_INVALID_RESPONSE、
504 BACKEND_TIMEOUT、499 REQUEST_CANCELLED。已知后端领域错误保留状态及稳定 code，
包括 TQ 的受控提示；未知错误正文不原样透传。
Server-Timing 以毫秒提供 upstream（鉴权、后端等待和解析）及 local（校验／序列化），
不暴露凭据；开发／生产共用实现。私有配置、备份与 Git／JJ 元数据不可通过静态服务读取。

## 数据与最新窗口

两条行情 API 都返回 `{rows}`；行是 `[UTC毫秒,open,high,low,close,volume]`。
CCXT 在适配层验证原始六列与完成状态，不把 completion metadata 纳入前端更新协议。
TQ 精确解析纳秒整数 token，再无损转毫秒；核心 null／非法值或无法无损转换的时间失败，
不将缺失价格变为零，不删除坏行或补造数据。其它 TQ 原始字段不进入绘图模型。

时间为正安全整数且不超过 9999999999999，严格递增唯一；CCXT 上游另要求 13 位域。
价格／成交量必须有限，OHLC 大小关系及非负成交量必须成立。TQ 可有更早历史。
不按固定 interval 检查相邻时间，期货午休、周末和节假日正常。

一个状态对应 source、真实身份、周期及 history_bars；重复槽共享取数，失败逐图隔离。
没有窗口时请求最新 history_bars，默认 1000，所有周期包含周线均用相同数量协议。
短历史成功显示；完整空窗口显示暂无数据，下轮仍请求完整窗口。

有窗口时固定请求最新 5 根，先验证再找时间交集。相同时间新值覆盖，新于末根的行追加，
窗口外更早行不补回，最后裁到保留上限。相同 OHLCV 行不重复提交。
无交集、空小窗口、需要插入未知旧时间或缺少必要 EMA 检查点时，本轮只重载一次
完整最新窗口；成功整体替换，不拼旧历史。失败保留旧画面，下轮继续完整重载。
过期窗口的最新时间早于现有末根则明确报错并保留数据，下轮重试，不把旧快照当成最新。
HTTP／格式失败不清空同身份已成功窗口。

同身份请求单飞，切身份或退出取消请求和 timer，并丢弃旧代次响应。
只改 EMA、主题、时区、布局或节拍不重取未变身份历史；改数量释放旧状态按新值重载。
后端如何取快照／分页由后端负责；前端无 since 推算、分页或隐形减少数量。
周线很大数量可能被后端拒绝，正常提示；TQ 后端最多两路窗口，不保证四图同时返回。

## 指标计算与独立对照

常用指标优先保存内部状态并增量计算；不常用或状态处理复杂的指标允许每轮全量计算。
每个指标须明确初始化、预热、历史修正范围和重载语义；增量实现必须有独立基准
对照测试。两种计算方式均遵循所选指标定义，不以有限预热近似替代所需历史状态。
当前只支持 EMA，此规则不增加其它指标或通用指标框架。

EMA 对齐 [pandas-ta-classic 指定源码](https://github.com/xgboosted/pandas-ta-classic/blob/ba647e0d87bba422deb68e61715d3fc9f68dd399/pandas_ta_classic/overlap/ema.py)
的 talib=false、sma=true、adjust=false、offset=0 分支，输入为已校验的有限 close。
前 period-1 根无值且不绘制，第 period 根取前 period 根 close 的算术平均；
此后 EMA=alpha×close+(1-alpha)×前值，alpha=2/(period+1)，period=1 等于 close。
例如 period=3、close 为 10／20／30／50 时，第三、第四根的 EMA 为 20／35。

保存最近五根各自计算前的状态：初始化期间保留 count／sum，之后保留 EMA 前值。
多根修正从最早 close 变化处恢复后向后递推；重复覆盖不漂移。
只改 volume／OHLC 且 close 不变不重算 EMA。裁剪移除展示点但维持连续状态；
新 period 从保留历史播种，无指标不维护计算；完整重载丢弃旧计算状态，重新播种。

对照必须使用相同输入和初始化历史。滚动测试保留包含已裁剪旧根的完整模拟历史，
从头计算后截取相同显示窗口；完整重载后，以新历史重建参考起点。
固定小样本覆盖预热、period=1、多根修正、追加、重复覆盖、连续裁剪和重载；
EMA14／50／100 均需有足够输入产生有效结果。按 UTC 时间逐点比较增量、全量和
独立标准结果，允许误差为 1e-12 + 1e-12 × abs(参考值)。
参考输入和结果见 [ema-reference.json](../../tests/fixtures/ema-reference.json)，记录
源码提交、依赖版本和参数。生成说明见 [参考数据说明](../../tests/fixtures/README.md)。
默认离线测试只读取固定结果，不执行 Python、不联网；独立期望不能由被测实现自身生成。

## 显示时间

图例显示匹配 K 线的开盘时间、OHLC、V 和 EMA，沿用 LegendManager。
local 在浏览器创建格式器时解析本地时区；显式时区支持对应日期的夏令时变化。
图例、时间轴刻度和光标标签共用格式器，只改变文字，不平移数据或改变 K 线分桶。
UTC 毫秒用于存储、拼接和指标，绘图边界转 UTC 秒，光标匹配同样保持 UTC。
格式器只随时区改变创建，时间字符串有界复用，时区切换不取数或重播种。

共享更新、视口及光标契约见 [chart_updates.md](chart_updates.md)，入口与验证见
[commands.md](commands.md)。
