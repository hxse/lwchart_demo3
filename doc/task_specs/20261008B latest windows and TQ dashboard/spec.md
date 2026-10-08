# 最新窗口与 TQ 看盘

## 任务边界

- 新入口只读显示 CCXT 与 TQ 行情；继续使用 `just crypto` 和 src/crypto，不新增
  交易、账户、订单、映射查询、复权选择或第二套图表。旧 ZIP／Notebook 入口保持。
- 初始与重载请求最新 history_bars，默认 1000；正常轮询固定请求最新 5 根。
  数量上限 10000、默认 5 秒、四周期 30m／4h／1d／1w、EMA 和暗色默认保持。
- 替换前端 since 请求、周线 1e12 特例、增量分页／追赶预算、旧末根专用 EMA 状态。
  删除 DataBudget、incremental_bars、max_catchup_pages 和只承担上述职责的接口／测试。
  不保留兼容别名、旧 runtime.data 或重复的取数链路。
- 新增 source、timezone、TQ 默认品种、时间与成交量图例。菜单取消实时预览、
  debounce 和“应用并更新 URL”双重语义；改为一次性应用。
- 迁移公共／本地私有配置、所有调用方、fixture、相关 current spec 和 guide。
  不重写前置任务文档、不修改后端仓库、不推送远端或调整 main。
- 验收通过即可交付。后端未启用／无权限及周线大数量倒推非法起点按真实错误展示，
  不以减少用户数量、切回 since、伪造数据或关闭限流处理；这些后端限制不在本任务修复。

## 任务规范

### 配置、身份与唯一状态

- DashboardOptions 是 source 判别联合：通用显示字段加 CCXT 或 TQ 的实际身份。
  CCXT 身份含 exchange_name、market、is_live、symbol；TQ 身份只含 symbol。
  来源身份默认值分别来自 [ccxt]／[tq]，通用默认值只来自 [dashboard]。
- 默认 source=ccxt；显式 URL > TOML。同一个 normalizeOptions 校验 URL／菜单／runtime。
  解析 URL 时先确定来源，再取该来源的默认身份；仅 `?source=tq` 必须默认螺纹主连。
- 改来源的菜单草稿使用该来源的 TOML 默认身份，保留通用显示字段。TQ 隐藏 CCXT
  专属控件，不发送、序列化或接受 TQ 的 exchange_name／market／is_live。
- 行情状态按来源、真实身份、周期和保留数量隔离；重复身份共享取数。
  theme、timezone、EMA 和 refresh_seconds 不进入数据身份，不重取未变历史。
- 旧响应、timer、请求及同步注册按原代次／生命周期规则释放。各身份单飞，
  一个周期失败不阻断其它周期。前端并发发起，按返回逐图展示，不增加等待全部的屏障。

### 本地适配与数据真值

- 前端 MarketClient 只有 latest(identity,limit,signal)，不提供 since 或 history/increment
  两条读取协议。CCXT 使用 latest-limit，TQ 使用 fetch_ohlcv，区别仅在路由与参数。
- 本地 GET 白名单只有 runtime、CCXT latest-limit 和 TQ fetch_ohlcv；原本地 since-limit
  路由退出为 404。未知参数、重复参数、写方法、数量超限在调用后端前拒绝。
- 两来源复用原 Password Grant、Bearer、单次并发登录、401 重试和受控错误机制。
  不向浏览器公开后台或天勤凭据，不透传未经筛选的后端错误正文。
- 本地两条行情 API 返回 `{rows}`，共享行是 `[UTC毫秒,open,high,low,close,volume]`。
  CCXT 上游六列与 completion metadata 必须合法，但 metadata 不参与看盘更新协议。
  TQ 精确解析 datetime 的 JSON 整数 token，按整数纳秒转为毫秒；不能先转不安全 Number。
  不能无损转换至毫秒或失去唯一性的时间明确失败，不静默舍入。
- 六列均为有限数；UTC 毫秒为正安全整数、至多 9999999999999，严格递增唯一。
  CCXT 上游仍验证其 13 位毫秒域；TQ 可以有更早历史。OHLC 大小关系和非负 volume
  必须成立；核心 null／坏行不能变为零、无声删除或补造。TQ 其他原始字段不进绘图模型。
- 不按固定 interval 检查相邻时间。期货午休、夜盘、周末、节假日不构成错误。
  时区不参与请求、键值、拼接、EMA 或光标匹配；只在共享绘图边界转为 UTC 秒。

### 最新窗口、拼接与重载

1. 没有已接受窗口时，直接请求最新 history_bars。有效短响应包括空响应都可显示；
   初始为空则下一节拍继续请求完整窗口，不要求精确返回数量。
2. 有窗口时请求最新 5 根。整页先校验，依据实际时间找交集。相同时间的新行胜出，
   新于末根的行追加；更早于保留窗口的行不补回。最终保留最新 history_bars 根。
3. 相同 OHLCV 行不重复提交。不插入已有时间范围内尚不存在的新时间点；无交集、
   空小窗口或无法恢复必要 EMA 状态时，本轮改为一次完整 latest 请求。
4. 重载成功后整体替换历史与 EMA，旧数据不参与拼接；重载失败保留旧画面并提示，
   下一轮继续完整重载，不在一轮里无限重试或拼接部分结果。
5. 响应最新时间早于已接受末根属于过期窗口，保留现有数据并明确提示，下轮重试；
   不回退游标或把旧快照当成最新。身份变化的旧代次响应永不提交。

无交集可以由长时间断网造成，提示使用“窗口断开／重新加载”，不直接指责上游坏数据。
HTTP／格式失败不清空已成功窗口。接口成功的完整空窗口可清空并显示暂无数据。

### EMA、系列与视口

- 常用指标保存内部状态并增量计算；不常用或状态处理复杂的指标允许全量计算。
  每个指标必须明确初始化、预热、历史修正和重载语义；增量算法需有独立基准对照。
  本任务只实现 EMA，不新增其它指标或通用计算框架。
- EMA 对齐 [pandas-ta-classic 指定版本](https://github.com/xgboosted/pandas-ta-classic/blob/ba647e0d87bba422deb68e61715d3fc9f68dd399/pandas_ta_classic/overlap/ema.py)
  的 talib=false、sma=true、adjust=false、offset=0 分支，输入是已校验的有限 close。
  前 period-1 根无值，第 period 根用 SMA 播种，之后 alpha=2/(period+1) 递推。
  新增 period 从保留历史播种维持既有语义。
  保存最近五根之前的计算状态；多根修正从最早发生 close 变化处恢复并向后递推。
  同根多次修改不重复累计；OHLC／volume 变化但 close 不变时不重算 EMA。
- 未变 EMA 保持连续计算状态，滚动裁剪不重新播种；完整重载整体重新播种。
  无 EMA 时不维护隐形后台指标。
- 增量与全量对照使用同一初始化历史。测试保留包含已裁剪旧根的完整模拟历史，
  从头计算后截取相同窗口；重载时以新历史重新建立基准，不延续旧播种状态。
  参考结果由指定版本独立生成，不能仅用 EmaSeries 自己生成期望。
  按 UTC 时间逐点比较；允许误差为 1e-12 + 1e-12 × abs(参考值)。
- 复用现有 named data API。updateSeriesData 允许修正已存在的旧点，内部对旧点使用
  SDK historicalUpdate；未知的历史时间仍拒绝。追加按正常 update，空补丁为无操作。
  批次仍先整批校验，不能半应用。
- 初始、完整重载及窗口裁剪可对现有系列 setData，但不删除 chart／series。
  看历史时以实际时间锚点保持视口；重载已失去该锚点时以原跨度显示新窗口末尾。
  跟随末尾保持偏移；普通修正和时区／主题变化不 fitContent／reset。
- candle 的 customValues.volume 保存成交量供同一 LegendManager 使用；不增加成交量
  系列或新图例系统。原涨跌色、EMA 色表、3% 价格边距、时间联动继续有效。

### 时间显示与设置应用

- 新场景图例显示真实匹配 K 线的开盘时间和 V；格式如
  `2026-10-08 09:30:00 · Asia/Shanghai`。同步目标展示本图匹配的时间，不照抄源图时间。
- timezone=local 在浏览器解析本地 IANA 时区；显式 UTC／IANA 时区经 Intl 校验。
  图例、横轴刻度和十字线标签共用格式器；不移动时间轴数据或改变 K 线分桶。
- 使用已安装 SDK 的 timeFormatter／tickMarkFormatter 和原 LegendManager。
  格式器只在时区改变时创建，同时间字符串复用；不在每次光标事件创建 Intl 实例。
  时区改变不取数、重播种或重建图表。旧场景未指定 formatter 时保留原默认图例。
- 菜单只有草稿。所有字段包括主题、来源、指标和数量都在点击“应用”后生效；
  编辑不改图表／URL，不因编辑取消或启动请求，已有配置的后台轮询继续。
- 应用先整份校验，成功后一次更新配置及完整 URL；有差异时只 pushState 一次。
  取消／关闭／Esc 只丢弃草稿。前进／后退重新解析并重置打开的草稿。
  首次及导航补全仍 replaceState，保留 fragment；非法 URL 不默默修复或发行情请求。

## 公开接口与用户写法

### 配置与 runtime

根 config.example.toml 为完整模板。公共默认配置的相关片段为：

```toml
[dashboard]
source = "ccxt"
timezone = "local"
theme = "dark"
layout = "2x2"
timeframes = ["30m", "4h", "1d", "1w"]
indicators = ["ema,14", "ema,50", "ema,100"]
refresh_seconds = 5
history_bars = 1000

[ccxt]
exchange_name = "binance"
market = "future"
is_live = true
symbol = "BTC/USDT:USDT"

[tq]
symbol = "KQ.m@SHFE.rb"
```

backend、server、legacy 配置及既有 CLI 不变。原 dashboard 的来源身份字段移到 ccxt；
incremental_bars／max_catchup_pages 删除。缺新字段或保留旧字段明确报错，不做启动兼容。
本地配置只迁移这些字段，保持原凭据、监听、复制目标及权限；用户更新后重启服务。

runtime JSON 为 `{defaults: DashboardOptions,sources: {ccxt: CcxtDefaults,tq: TqDefaults}}`。
sources 的对象正是上述两个身份表；defaults 是 dashboard 与所选身份的规范化投影。
不含 backend、server、legacy 或凭据，也不再提供 data。

### URL 与菜单

| 字段 | 契约 |
| --- | --- |
| source | ccxt／tq |
| timezone | local、UTC 或有效 IANA 时区，默认 local |
| symbol | 当前来源的完整品种名，默认取该来源 TOML 身份 |
| exchange_name／market／is_live | 仅 CCXT；枚举沿用当前规范 |
| layout／timeframes／indicators／refresh_seconds／history_bars／theme | 沿用当前限制和编码；hist 1..10000、EMA 至多 12 项 |

完整 CCXT URL 为十二字段，TQ 为九字段；inactive 来源字段不序列化。
布局推断及指标语法保持；重复、未知、缺必填值或无效时区在取数前明确报错。

```text
http://127.0.0.1:5174/
http://127.0.0.1:5174/?source=tq
http://127.0.0.1:5174/?source=tq&symbol=KQ.m%40SHFE.rb&timeframes=30m%2C4h%2C1d%2C1w&timezone=Asia%2FShanghai
http://127.0.0.1:5174/?source=ccxt&symbol=ETH%2FUSDT%3AUSDT&timezone=UTC
```

`?source=tq&market=future` 是未知的来源字段；`?timezone=Invalid/Zone` 是无效时区。
菜单提供数据源、品种、适用的 CCXT 身份及通用设置，提交按钮仅标“应用”。

### 行情 GET

```text
GET /api/ccxt/fetch_ohlcv/latest-limit?exchange_name=binance&market=future&is_live=true&symbol=BTC%2FUSDT%3AUSDT&timeframe=30m&variant=default&enable_cache=true&limit=1000
GET /api/ccxt/fetch_ohlcv/latest-limit?exchange_name=binance&market=future&is_live=true&symbol=BTC%2FUSDT%3AUSDT&timeframe=1w&variant=default&enable_cache=true&limit=5
GET /api/tq/fetch_ohlcv?symbol=KQ.m%40SHFE.rb&duration_seconds=1800&data_length=1000&enable_cache=true
GET /api/tq/fetch_ohlcv?symbol=KQ.m%40SHFE.rb&duration_seconds=1800&data_length=5&enable_cache=true
```

本地适配以同路径去掉 /api 转发；身份字段和数量校验后才调用后端。
TQ 周期按真实单位映射：30m=1800、4h=14400、1d=86400、1w=604800 秒，
其余支持分钟／小时周期同理。TQ 不接受 since、limit、环境或 adj_type；本入口固定无复权。
CCXT 不接受 since 或 data_length，variant 固定 default，enable_cache 固定 true。

```json
{"rows":[[1718000000000,100,105,99,104,12.5]]}
```

错误形状、Server-Timing、私密文件访问拒绝及 401 重试上限继续保持；补充受控 TQ 错误。
原 /api/ccxt/fetch_ohlcv/since-limit 返回 404，不保留无调用方的本地路由。
共享 ChartApi 既有签名保持，旧点修正必须是已存在时间；首次／重载仍 replaceSeriesData。
新增 getCrosshairTime(): number | undefined，返回控制器实际匹配的 UTC 秒，未匹配或已清除
为 undefined；LWChart 导出和 onRegister 均提供。设置同一光标不依赖 SDK 重复发事件。

## 测试、验证与阶段过渡

实施按同一 change 联动迁移模型、配置、网络、数据状态和离线 fixture，再接菜单与图例，
不建立长期新旧双轨。编辑中的未完成片段不作为可运行交付；正式检查前调用方及测试
必须全部迁移。旧静态图表能力全程保持，不批准正式测试失败豁免。

| 范围 | 必须证明 |
| --- | --- |
| 配置／URL | 默认 CCXT、仅 source=tq 的 rb 默认、两个来源的严格字段、时区错误、数量边界、完整编码往返、旧字段退出 |
| 路由／鉴权 | 四周期默认只请求最新数量 1000／5；显式数量仍有效；TQ 秒数与纳秒精确转换；白名单、未知字段／写方法拒绝、单次并发登录、错误不泄密 |
| 窗口 | 多根覆盖及追加、重复响应无重复点、N 小于 5、短／空历史、无交集重载成功／失败、过期窗口、单飞／取消／迟到响应 |
| EMA | 固定小样本及 EMA14／50／100 的有效值与独立基准逐点一致；增量与同起点全量计算等价；多根修正、追加、重复覆盖、裁剪、重载、预热不足、period=1、volume 不重算及无指标 |
| 图表 | 历史修正使用同一系列、未知历史点拒绝且批次原子、裁剪和重载视口、无重建、仍能跨周期同步时间 |
| TQ | 完整／短 records、整数精度、nullable／坏行失败、午休／周末跳跃、来源切换和身份隔离 |
| 设置 | 所有编辑均只影响草稿，应用一次提交，取消／Esc／关闭不改配置，前进后退重置草稿，无实时预览残留 |
| 显示时间 | 图例时间与 V、目标真实匹配时间、本地／UTC／IANA／DST，切时区 UTC 数据和请求数量不变，格式器复用 |
| 旧入口／私密性 | ZIP／Parquet、Notebook ES／UMD 与交易标记、旧默认图例、配置忽略和文件权限、开发与生产拒绝访问凭据 |

正式命令为 `just check`、`just test`、`just crypto --build`；离线浏览器套件构建并验证
旧演示和库复制到临时目录。检查 warning／deprecation、测试汇总和真实画布截图。
不修改用户真实 pyo3-quant 产物，不默认下载浏览器、不把在线账户加入离线测试。
EMA 参考输入与结果固定保存在 tests/fixtures，记录源码提交、依赖版本和生成参数。
Python 只用于显式再生参考数据，默认 just test 不执行生成器、不依赖 Python 或网络。
性能验证用离线数据证明 unchanged 小窗口无数据提交、EMA 只重算受影响后缀、
时区／菜单编辑不重取历史、formatter 同根复用，不用脆弱耗时阈值替代正确性。

在线后端延迟和功能权限不属于默认验收。本任务接受后端的周线大数量错误和 TQ
两路准入限制，不能把前端并发写成保证同时返回。配置、API 与页面须同版本并重启；
本次启动的测试／预览进程完成后清理，不能遗留占用用户运行端口的服务。
