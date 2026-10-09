# 多周期行情看盘

## 场景与所有权

`src/crypto/index.html` 由 `just market` 运行，支持 CCXT 加密货币与 TQ 期货。
两来源复用既有行情窗口、EMA、LWChart、ChartController、ChartSyncManager 和 GridTemplate。
内部目录、dist-crypto 产物和 /api/crypto/runtime 路径保留；旧 ZIP／Notebook 入口独立。
本入口不提供交易、订单、账户或主连映射查询。

宿主 Bun 为唯一服务环境，启动配置来自私有 config.toml；公共模板见
[config.example.toml](../../config.example.toml)。鉴权材料不进入浏览器。
一个页面一份设置和一个可为空的混合自选，多个组合由浏览器书签管理。
页面操作不回写 TOML，不使用 localStorage、sessionStorage、IndexedDB。

## 完整设置与来源 Tab

页面设置唯一维护 source、ccxt、tq 和公共参数；实际行情配置只由当前来源投影。
两来源的内部参数始终保存、校验并写入 query。source 决定请求哪一来源，
非活动来源的参数不传到行情 API。TOML dashboard／ccxt／tq 提供对应缺省值。
品种属于各来源内部参数；切来源保留双方身份和全部公共设置，包括 history_bars。

默认 CCXT、Binance future 实盘、BTC/USDT:USDT；TQ 默认 KQ.m@SHFE.rb。
默认四图填满按钮栏以外的空间，2×2 行优先：30m／4h／1d／1w；EMA14／50／100
依次为橙 #FF9800、绿 #4CAF50、蓝 #2196F3。默认 dark、5 秒、1000 根、local 时区。

设置面板为贴近按钮的浮层，默认收起。CCXT／TQ Tab 显示各自品种及内部参数，来源区域与下方公共参数各用主题色细边框包围。
Tab 只改变草稿的 source，来回切换不丢弃双方编辑。应用整体提交设置和完整 query；
取消／关闭／Esc 丢弃草稿，编辑期间已生效行情继续轮询。有变化只 pushState 一次，
无变化不新增历史。前进／后退重新解析设置并重置打开中的设置草稿。
首次与导航补全有效 query，保留 hash；非法 query 不自动修复或取行情，可由设置恢复。

## 占位按钮栏

按钮栏为实际占位 div，42px 厚，默认 right。公共 dock_position 决定 top／bottom／left／right；
左右竖排，上下横排。设置、自选及全部平铺按钮均为 32×30px，设置／自选固定在栏首，
平铺内容在剩余栏空间内按方向滚动。图表只占剩余区域，按钮不覆盖图表价格轴。
缺省 TOML 字段仍使用 right，私有配置无需为本字段强制迁移。

位置遵守菜单草稿与应用规则，写入完整 query，可由书签和前进／后退恢复。换边及窗口
变化只重排空间，不重取历史、不重建画布，hash、来源身份和其它显示参数保持。
设置与自选浮层朝图表一侧锚定主按钮，限制在 viewport；独立编辑弹窗继续居中。
自选悬浮控制保持浮层，上／左／右侧时在按钮下方，下侧时在按钮上方，保持范围为主按钮
和控制的联合矩形外扩 12px，不把整个占位栏作为触发区域。

## query 参数

| 字段 | 契约 |
| --- | --- |
| source | ccxt／tq，选择活动来源 |
| ccxt.exchange_name | binance／kraken |
| ccxt.market | future／spot |
| ccxt.is_live | URL 为 true／false，内部 boolean |
| ccxt.symbol、tq.symbol | 各自完整品种，非空、至多 128 字符、无控制字符 |
| layout | 1x1、1x2、2x1、1x3、3x1、2x2，行×列 |
| timeframes | 按槽顺序逗号分隔，允许重复周期 |
| indicators | none 或 ema,5;ema,14;ema,50；周期 1..100000，至多 12 项且不重复 |
| refresh_seconds | 1..3600 严格整数 |
| history_bars | 1..10000 严格整数，两来源共用 |
| theme | dark／light |
| timezone | local、UTC 或 Intl 接受的 IANA 时区 |
| dock_position | top／bottom／left／right，默认 right；公共页面参数 |

完整 query 始终为 14 字段，不丢弃非活动来源。未知／重复／空字段及非法类型明确失败，
不回显未知值。旧裸写 symbol、exchange_name、market、is_live 已退出，旧书签须更新。

周期为 1m、3m、5m、15m、30m、1h、2h、4h、6h、8h、12h、1d、3d、1w。
仅写 layout 取默认周期前 N 项，不足报错；仅写 timeframes 且数量变化时，1／2／3／4
项推断 1x1／1x2／1x3／2x2。显式两者必须匹配。菜单减少槽保留前 N 项，增加从默认补齐。

## 独立自选与 fragment

一个有序列表混合 binance、kraken、tq，不进入普通设置或 TOML；允许重复条目，
允许当前品种不在列表。fragment 为空表示无自选，内容完全由前端处理，不发送到服务端。

`#binance,BTC/USDT:USDT;tq,KQ.m@SHFE.rb` 可直接使用，来源忽略大小写。
字段分别编码，先按分号和逗号拆分再解码；保存使用小写来源及 URL 编码的 symbol。
允许末尾分号；中间空项、缺字段、未知来源、坏编码和非法 symbol 在自选区明确提示，
不阻断有效 query 看盘。可通过编辑弹窗替换或清空非法列表。

独立小按钮默认收起；无列表且未平铺时点击新建，有列表或开启平铺时展开／折叠。
鼠标进入小按钮后在下方显示上一项／下一项；按钮及控制的联合矩形外扩 12px 内保持，
离开立即隐藏，进入附近区域本身不触发。键盘聚焦小按钮可显示，焦点离开控制区隐藏；
鼠标离开范围时残留焦点不会维持显示。
面板从自选按钮向图表一侧展开，150×320px，小屏限制到可用空间；标题固定，列表内部纵向滚动，
长名称省略并提供完整 title，明暗主题沿用页面配色。标题带导航、编辑、平铺、锁定和折叠按钮；锁图标使用跟随主题的 currentColor 单色线条。
展开及选中项／列表改变时自动将当前项尽量置于列表中间，首尾停在顶部／底部；仅滚动列表，无匹配项不强制滚动。

选中匹配当前来源、交易所和品种的第一条。上下导航按列表顺序首尾循环；当前不在
列表时，上一个选最后项，下一个选第一项。空列表不能导航；默认未锁定，点击候选成功后或点击面板／自选按钮外部自动折叠；提交被拒绝时保留面板。
锁定后选择候选及点击外部保持展开，可手动折叠。锁定不写入 URL 或持久化，刷新恢复未锁定。
未锁定时打开独立编辑弹窗收起列表；锁定时保留。
选择条目只通过统一配置应用入口修改 source 与目标交易所／品种，其他设置和 hash 保留。
未选品种不取数。CCXT 点击保留市场和环境；TQ 点击保留 CCXT 的完整内部参数。

编辑使用独立宽弹窗，支持增、改、删、拖拽和上下按钮排序。保存只发布 hash，不重新
序列化 query、不更新设置、不刷新或重配行情。删除当前条目不切品种；保存保留平铺模式。
空列表且 flat=false 时移除 hash，flat=true 时保留模式参数。
取消／关闭／Esc 丢弃草稿。保存变化只新增一条历史，无变化不新增。
仅 hash 导航不重置设置草稿；hash 改变关闭旧自选草稿，前后退同步两部分。

编码后的完整 URL（协议、主机、路径、query、hash）最多 8192 字符。所有提交在
更新状态前检查；超限弹窗提示长度、上限及缩短建议，原状态、URL 和草稿保留。
打开手写超长地址也提示，不截断，仍允许编辑缩短。这是应用保守上限。

## 平铺自选与 hash 布尔值

hash 可含一次 flat=true 或 flat=false，位置不限，缺省 false。保存时仅在 true 下输出
flat=true，位于候选之前；false 省略。非法值及重复字段在自选区域报错，正常 query 仍可看盘。
例如 `#flat=true;binance,BTC/USDT:USDT;kraken,ETH/USD;tq,KQ.m@SHFE.rb`。

自选面板的平铺按钮只更新 hash，不改变 query、设置草稿、图表或行情请求。
开启后原自选按钮保留图标及打开悬浮面板能力，实际按钮栏内依次显示上箭头、下箭头、编辑与
每个候选；普通悬浮箭头不重复显示。平铺内容使用剩余按钮栏空间，只有
内容超出时按栏方向显示主题色细滚动条；选择后平铺栏保持显示，并沿用当前项高亮／内部居中。

Binance／Kraken 名称取第一个 / 前部分，例如 BTC；TQ 取最后一个 . 后部分，例如 rb。
分隔不存在、片段为空或其它来源时使用完整 symbol。长名称省略，title 和可访问名称
保留完整来源与品种。缩写只影响显示，实际品种和条目身份不改变。

编辑自选保留 flat；前进／后退与书签恢复列表和模式，锁定仍仅属于当前页面。
平铺开启且列表为空时保留箭头与编辑入口，可通过原按钮打开面板关闭模式或新建候选。
模式更新同样先检查完整 URL 长度，拒绝超限时原模式及 URL 保留。

## 本地 API 与鉴权

浏览器只访问同源 GET：

```text
/api/crypto/runtime
/api/ccxt/fetch_ohlcv/latest-limit
/api/tq/fetch_ohlcv
```

runtime 是 `{defaults: DashboardSettings}`，defaults 同时含 source、ccxt、tq 与公共参数。
ccxt 为 exchange_name／market／is_live／symbol，tq 为 symbol。没有旧 sources 字段，
没有后端地址、凭据、server 或 legacy 字段。

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
