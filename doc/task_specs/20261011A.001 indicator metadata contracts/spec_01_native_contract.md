# 原生构造、读取与入口身份

本文件是元数据任务的正式扩展，与 [spec.md](spec.md) 一起必读。
最终业务边界与版本准入政策见 [主任务 spec](<../20261011A unified technical indicators/spec.md>)。
这里只冻结计算与结果对应关系，不实现公式或增加可注册的计算框架。

## 发行基线与参数记号

对应表核对 trading-signals 8.3.0 的实际 npm 发行包，发行元数据 gitHead 为
a6893630d0565483bb6b12f7a55f2dee0cfd378e。此 hash 定位第三方源码，非本项目任务版本。
来源：[发行元数据](https://registry.npmjs.org/trading-signals/8.3.0)、
[发行包](https://registry.npmjs.org/trading-signals/-/trading-signals-8.3.0.tgz)。
8.3.0 是首个候选，正式计算迁移以前须在计算阶段逐项给出准入结论；只开放
通过的 market 计算，不通过项保留原因与最小复现，legacy 展示独立保留。

下表的 p、f、s、g、d 分别表示规范化 period、fast、slow、signal、deviation。
构造均使用 trading-signals 的公开导出；WSMA 显式指定，不依赖默认平滑器变化。
close 输入是 OHLCV 的 row[4]；HLC 是
`{high: row[2], low: row[3], close: row[4]}`。open／volume 不参与这十一种指标。
输入准备只选字段，不预先计算典型价、真实波幅或方向移动。

## 唯一构造与结果对应表

每次 add／replace 后先看根指标 isStable。false 为 warmup；true 时调用根指标
getResultOrThrow()，按下表读取原始角色。更新方法的即时返回值不作为另一读取入口，
getResult() 的捕获异常行为不用于吞掉计算错误，也不读取私有子指标状态。

| type | 原生构造 | 输入 | 结果角色 | 基线首次可用输入数量 |
| --- | --- | --- | --- | --- |
| sma | new SMA(p) | close | value = 根结果 | p |
| ema | new EMA(p) | close | value = 根结果 | p |
| dema | new DEMA(p) | close | value = 根结果 | p |
| tema | new TEMA(p) | close | value = 根结果 | 3 × (p − 1) + 1 |
| rsi | new RSI(p, WSMA) | close | value = 根结果 | p + 1 |
| cci | new CCI(p) | HLC | value = 根结果 | p |
| macd | new MACD(new EMA(f), new EMA(s), new EMA(g)) | close | macd、signal、histogram = 同名字段 | s |
| atr | new ATR(p, WSMA) | HLC | value = 根结果 | p |
| adx | new ADX(p, WSMA) | HLC | value = 根结果 | 2 × p − 1 |
| er | new ER(p) | HLC | value = 根结果 | p |
| bbands | new BollingerBands(p, d) | close | lower、middle、upper = 同名字段 | p |

表中的数量用于准入和预热边界测试，不替代运行时 isStable 判定。
EMA 在预热中可能已返回递推值，但本项目要等根 isStable 才绘制。DEMA 不额外
增加一轮 SMA 播种，也不按另一库的双周期预热改写其首点。

MACD 固定三个不同的原生 EMA 实例，f 为 short、s 为 long、g 为 signal。
不改用 DEMA，也不复用用户另配的 EMA 实例。MACD 根结果可用时三角色同时可用，
即使内部 signal EMA 尚未满足自己的周期数量，仍使用根结果中的 signal。
不以子指标 isStable 延后 signal／histogram，不额外乘二或由应用计算差值。
来源：[MACD 固定源码](https://github.com/bennycode/trading-signals/blob/a6893630d0565483bb6b12f7a55f2dee0cfd378e/packages/trading-signals/src/momentum/MACD/MACD.ts)。

RSI／CCI 的阈值参数和 ER 的 trending 使用库默认值；不读取交易信号，显示参考线
以主任务元数据为准。ER 是该版以区间最高 high／最低 low 归一化的区间效率比，
显示名称注明“ER（区间效率）”，不当成按价格路径长度归一化的另一种 ER。
ADX 只读取根 ADX 数值，不把公开 pdi／mdi 顺带加入角色。

## 合法未定义与计算错误

主任务规定 warmup／value／undefined 三种业务状态，本表的唯一 undefined 白名单
是 CCI 根结果为 NaN：基线常量典型价窗口的均值偏差为零，原生结果是 0/0。
主任务已校验合法有限 OHLCV；这种结果保留原始 NaN 和对应时间，展示为缺口及
“未定义”，不补 0、不报行情损坏、不发起完整请求，随后有限结果自然恢复。
来源：[CCI 固定源码](https://github.com/bennycode/trading-signals/blob/a6893630d0565483bb6b12f7a55f2dee0cfd378e/packages/trading-signals/src/momentum/CCI/CCI.ts)。

其余指标不允许 NaN，全部角色不允许 Infinity／-Infinity；缺字段、非数值和
isStable=true 却读取失败均是计算错误。不能增加泛化“跳过非有限值”规则。
准入须证明白名单没有吞掉状态错误，CCI 在常量窗口后的变化能恢复有限值。

ADX 底层 DX 还存在零真实波幅时可能把 NaN 传入平滑的边界；不能把持续污染
状态定义成合法缺口。全零波幅及随后出现正常波幅必须取得有来源的有限期望、
证明可恢复，不能仅证明应用和库都返回 NaN 就判可靠。候选不能满足时按主任务
政策暂不开放该指标并保留离线最小复现，继续其他指标与公共链路；不能本地修改 DX 算法。

## 首根覆盖的原生生命周期

只接收一根输入的实例若该输入变化，销毁该实例，以同一构造创建新实例并 add
修正后的唯一输入；全部指标采用这条通用生命周期，不额外请求行情。
根本条件是自本实例计算起点以来的输入数量等于一，不是展示容量或预热数量。
修正后紧接多根新增时先完成此初始化，再按时间顺序 add 后续输入。

输入数量两根及以上的末根覆盖必须使用原生 replace，反复覆盖也不能重播历史。
保留输入数量和唯一首根属于生命周期管理，不导出／恢复指标检查点、不复制公式。
此例外对应基线 DX 把被替换首根当作前根的问题，严格对齐不能因此放宽。
来源：[DX 固定源码](https://github.com/bennycode/trading-signals/blob/a6893630d0565483bb6b12f7a55f2dee0cfd378e/packages/trading-signals/src/trend/DX/DX.ts)。

## 入口身份与独立参考

规范化配置键只描述 type 与参数，不天然等于所有入口的组身份。
market 配置列表按配置键去重，创建计算实例；输出键为 market/<配置键>/<output>。
legacy 只展示导入列，按当前 chart 的 id 聚合；输出键为 legacy/<id>/<output>。
两个不同 id 使用相同 MACD 参数和 histogram 合法；同 id 的角色重复或 spec／Pane
不同失败。普通文件系列保持独立映射，不受 market 十二实例上限限制。

例如两个 legacy 组 macd-a／macd-b 的 histogram 键分别为
legacy/macd-a/histogram 和 legacy/macd-b/histogram，不因文件名或显示标签变化碰撞。
SeriesConfig.name／SeriesDataPatch.name 保持系列键职责，displayName 只用于展示。

独立参考测试照本表直接构造原生类，并使用相同根 API 与角色口径；不能调用
被测生产工厂、字段转换或状态归一化来生成期望。参考从原始 OHLCV 独立选输入，
比较原始数值、可用状态及角色，预热和 CCI NaN 也须覆盖。
fixture 若经 JSON 传输，NaN 和负零用显式标记恢复后比较，不能变成 null／0。
未来官方版本只有保持此表构造、输入、读取与预热契约并通过全部准入才可选用；
契约变化须先修订正式设计，不能在执行适配或参考测试中各自择一口径。
