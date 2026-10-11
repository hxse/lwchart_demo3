# 指标定义与展示契约

## 所有权与当前范围

src/indicators/ 拥有指标参数、输出角色、原生调用描述、系列身份和默认显示元数据。
共享图表只消费通用系列描述；共享样式类型位于 src/utils/seriesStyles.ts，不依赖
legacy 页面或文件路径模型。legacy 原公开样式类型转出同一个定义，不维护副本。

定义包含十一种候选：sma、ema、dema、tema、rsi、cci、macd、atr、adx、er、bbands。
计算唯一使用 trading-signals 8.3.0，构造与读取由原生适配绑定元数据；SMA、EMA、
DEMA、TEMA、RSI、CCI、MACD、ATR、ER、BBANDS 已通过计算准入。ADX 零波幅的
NaN 会持续污染平滑，暂不开放 market 计算，支持清单及拒绝原因只在 support.ts。
market 的设置／URL／TOML 已开放这十种指标，暂不支持 ADX 时明确拒绝整个提交，
不静默删除、不补零或调用备用算法。默认仍为 EMA14／50／100，标签与配色保持。

## 参数与身份

parseIndicator 是单项参数唯一校验，parseIndicatorList 负责 market 列表解析、
十二实例上限和同配置去重。参数必须完整，类型严格小写，不接受未知字段、
非法数值、缺项或额外项；无指标写作 none 或空数组。

```text
ema,14;ema,50;ema,100
none
```

规范化配置键按 type 与元数据参数顺序形成。market 系列键为
market/<配置键>/<output>；legacy 文件组键为 legacy/<id>/<output>，均在单个
chart 的 registry 内使用。不同 legacy id 可以拥有相同参数，不能套用列表去重。
legacy 的可选 indicator={id,spec,output} 已接入文件加载、主图和底部栏；同组
参数与 Pane 一致、角色唯一且匹配原语，不对导入数值重新计算，允许部分角色。
SeriesConfig.name／SeriesDataPatch.name 是系列键；可选 displayName 用于展示，
未指定时仍显示 name。

## 显示定义

每种定义声明输入字段、原生构造及根可用状态、输出角色／原语、默认主图或
副图、缩放贡献、参考线、格式、主题颜色、图例和 Pane 权重。布林带和 MACD
多角色、ADX 单角色、ER 区间效率比都由定义表达，图表不能按指标名补规则。
默认 EMA14／50／100 使用橙／绿／蓝，均线不扩大蜡烛主图的价格缩放范围。
显示格式只格式化文本，不改变原始数值。均线与布林带位于主图，其余指标在独立
Pane；MACD 两线一柱同组，布林带三轨同组，全部 Pane 共用时间轴。main 权重五，
单个副图权重一，拖动分隔线后数据／主题更新不重置尺寸。

## 计算状态与对齐

IndicatorStream 独立持有原生实例，只调用 add／replace／isStable／getResultOrThrow。
完整初始化新建实例；仅计算起点的一根覆盖使用新实例 add，不恢复历史检查点。
计数随追加增加，显示裁剪不重置原生状态；新增／改参数只初始化对应实例。
MACD 固定三个独立 EMA，根可用时三角色同时显示，不等待内部 signal 独立预热。

结果区分 warmup／value／undefined。CCI 根 NaN 唯一允许为合法 undefined，保留
原始 NaN，不填零、不请求重载，后续有限值可恢复；其他非有限输出明确失败。
行情与结果原子提交，失败保留已提交快照并停止流的自动更新，不反复请求相同数据。

严格对齐以独立原生完整重放作参考，逐时间／角色／状态按 Object.is 比较，
无容差。固定极小期望与确定性模拟序列默认离线；暂不支持指标保留明确诊断断言。

## 配置与显式覆盖

设置使用“技术指标”文本列表，应用／取消与 query 前进后退复用旧入口；hash 自选
独立。market 不增加临时组显隐，标签只是文字；删除配置释放实例及独占 Pane，
重新添加从当前窗口播种。预热及 undefined 保留已配置 Pane，后者绘图为 time-only
缺口，图例／标题显示未定义，不保留对应时刻原有限值。

legacy 文件样式、Pane、show／showInLegend 和原三维索引覆盖优先。独立 hline
可写 referenceFor=同一 chart 的组 id，仅关联同 Pane 组；未知／跨 Pane 关联失败。
未关联参考线在同 Pane 按 value 覆盖默认线，关联线与有注记内联 hLineOpt 只覆盖
对应组同值线。隐藏显式项也抑制默认线，不因隐藏而补回；其它阈值继续共存。
绑定线需组至少一输出可见且自身 show，内联线按所属项 show，未绑定线保留旧规则。
先应用索引覆盖，再建立包含隐藏项的参考清单；自动输出扩展不改变文件项索引。
自动参考线只显示价格轴数值，title 为空，避免在绘图区重复显示同一数值。
当前指标值标签继续显示；legacy 显式 label／showLabel 沿用户配置生效。

均线仅在最终与同 Pane 的可见、有数据蜡烛／Bar 共用价格轴时退出缩放。
显式 priceScaleId 选择独立 left／right／overlay 轴时，由均线自身提供范围；
显式 autoscaleInfoProvider 优先。空串 overlay 每条系列独立，不能按空串判为共轴。
有 indicator 注记的导入列保留 NaN、null 和缺列对应的 time-only 缺口，图例显示
“未定义”，共用断线链路。不从外部缺失值推断预热，不重算；普通无注记列保持原过滤。

显式 histogramOpt.color 最高优先，禁止生成自动点 color；去掉固定颜色后按元数据
主题策略重绘。无注记普通 Histogram 保留四色策略，算法只在共享展示模块。
正常裁剪额外保留一个先前原始输出供首柱比较，不是计算检查点，也不用于公式。
