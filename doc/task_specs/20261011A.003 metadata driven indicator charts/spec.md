# 元数据驱动的双入口显示

## 任务边界

完成 market 与 legacy 共用的指标展示描述及其入口适配。market 开放已准入类型的
设置、TOML 与 query 写法；legacy 支持全部候选的 indicator 注记，继续读取文件数值。
使用共享 LWChart／ChartController／SeriesRegistry／LegendManager，不再造图表。

参数、默认位置、原语、轴、参考线和公开写法继承
[主任务 spec](<../20261011A unified technical indicators/spec.md>)；计算器与行情协议继承
[前置 spec](<../20261011A.002 market indicator calculations/spec.md>)。本阶段不更改公式、
取数或严格对齐规则，不为导入文件添加 TS 指标重算。
原生结果状态和读取继承 [唯一对应表](<../20261011A.001 indicator metadata contracts/spec_01_native_contract.md>)；
本阶段仅开放前置逐项准入通过的 market 类型，失败类型明确拒绝，legacy 元数据
展示不因原生计算暂停而关闭；不首次判断库可靠性。

扩展 Histogram 实时补丁、显示名与稳定 key 分离、参考线与图例的更新／删除、
Pane 分配及元数据格式。同步公开类型、生成声明、有效规范和必要用户说明。
src/indicators/ 承担共享展示职责，实施后同步 doc/current_specs/indicators.md。

删除临时 EMA 可用范围检查、类型收窄、旧结果适配及没有调用方的转发；旧的指标
标签、颜色、参考线和格式分支由元数据统一承接，不保留另一条显示链路。
不扩大到新的画线工具、风险计算、指标插件、自定义公式或布林带区域填充。
本次不增加 market 组显隐入口、持久化字段或隐藏后收起 Pane 的策略。

保持旧配置索引覆盖、独立 hline／vline、成交量、仓位箭头、风险线、Notebook 导出，
以及来源切换、query／hash、自选、按钮栏、主题／时区和精确视窗跟随。
停止线：两个入口读同一元数据；已准入 market 类型和所有 legacy 候选可完整显示；新写法可往返；共享图表与
入口中无指标名称判断或重复默认规则；必需回归与构建通过。

## 任务规范

### 唯一展示描述与系列身份

指标展示职责属于指标模块。它根据定义、参数、主题、原始结果及显式覆盖，生成
通用系列／Pane／参考线／图例描述。chart 模块消费已解析描述，仅按 Line、Histogram
等通用原语及轴、格式、颜色角色工作，不按指标 type、标签或文件列名选择样式。

同组多个输出共享入口组身份和 Pane。market 使用规范化配置键，legacy 使用
当前 chart 内的 id，再分别按主任务格式加 output；相同参数的多个文件组合法，
不能用计算配置键覆盖 legacy id。SeriesConfig.name／SeriesDataPatch.name 保持
系列键职责，新增可选 displayName，图例显示 displayName ?? name。
改显示文字、主题或输入数据不改变 key，也不导致图表整体重建。
价格与比例格式、标签和图例值采用同一描述，不能在图例内部统一硬编码两位小数。
数值格式只作用于显示，不改变传入图表的原始指标值。

主图和副图的默认放置、轴／缩放贡献、参考线与权重以主任务表为准。按配置顺序
分配副图，不把所有指标塞进价格轴；同一 MACD 的两个 Line 和 Histogram 放在一组。
不以预热无点误判配置不存在；预热结束后更新现有系列而非重建图表。
warmup 与合法 undefined 都保留已配置指标的 Pane；undefined 显示“未定义”，
对应时刻使用 time-only 缺口，不连线、不保留该时刻原有有限值。MACD 三角色
按整体读取口径同时开始，不能在图表内另行判断 signal EMA 的预热。

MACD 四色柱策略由元数据确定，展示层使用相邻原始结果生成 color。末根替换和
批量追加必须更新相应柱色；裁剪、全量替换、首点与零值行为确定且一致。
这只是显示颜色处理，不重新计算 MACD 数值；legacy Histogram 现有颜色处理也
归同一策略所有，不在文件提取器与 market 入口中分别维护。

### 图表生命周期与补丁

复用 registry 管理系列、参考线和图例。新增／删除指标组、参数变化、主题与 legacy 显隐
变化正确更新或释放对应对象；参考线不能只在首次创建时生成或累积重复对象。
legacy 显式 show／showInLegend 继续按项生效，不让隐藏数据扩大缩放；默认参考线
只服务至少一个输出可见的组，显式参考线遵守下述归属与合并规则。

扩展 SeriesDataPatch 的 Histogram 数据与 color，以及 Line／Histogram 的 time-only
缺口，保留批次预校验和失败不部分提交
的契约。时间只在各入口既有绘图边界转换一次；legacy 已是秒的数据不能再除千。
不删除 shared chart 的 historicalUpdate 独立能力，不让指标预热点成为时间轴锚点。
新 K 线依然以蜡烛为主要时间基准，保持部分遮挡判定和精确一根宽度的视窗移动。

调整 Pane 尺寸复用既有分隔线与图表 resize 能力，不能创建彼此独立、时间轴不同步
的另一套图表。数据变化不重置用户手动布局；主题、时区与 legacy 纯显隐不触发行情请求
或重播指标。删除实例及参数变化的计算起点遵守前置契约。
Pane 分割线普通／悬浮颜色由入口主题配置提供，通过 SDK layout.panes 与现有
applyOptions 更新；无需按指标类型定义颜色，主题切换保留手动高度与拖拽能力。
协调期间暂保留空 Pane，依据 SDK 实际位置移动未变系列及其画线段，再清理目标
范围外的空 Pane；前置参数修改、类型替换和重排不能把两个指标合并到一个副图。

### market 配置与设置

设置使用通用“技术指标”名称，编辑草稿、应用／取消、类型与参数校验复用唯一
解析模块。最多十二实例与重复配置规则适用于全部类型，不保留按周期判重逻辑。
默认仍为 EMA14／50／100，已有 none、URL 长度检查、书签、前进后退语义保持。

启用完整类型后删除前置阶段的 EMA 子集门卫；合法配置不能被临时分支拒绝。
数据／公共参数分区、自选 hash 和来源内部配置保持既有边界，不新增指标 hash。
market 不新增组显隐；标签为展示文字，没有点击切换、单图／全页显隐状态或
显隐 URL 参数。设置里的增删及 none 仍改变计算配置，复合输出属于一个实例。
删除配置释放计算实例、输出、参考线及独占副图，重新添加按前置规则重新播种；
新增／已有指标处于预热或未定义时仍保留副图，不把无点当成删除。

### legacy 适配与覆盖

SeriesItemConfig 的可选 indicator 使用主任务冻结的 id／spec／output 契约。
配置加载阶段校验角色、原语、组内参数／Pane 一致和角色唯一，报错定位到
slot／pane／series 项；不能等绘图之后才失败，也不能猜列名自动分配指标。

有注记的项绑定导入数值与角色，取得共享元数据默认显示；只选择部分角色合法。
已有文件配置中的 Pane、样式、show、showInLegend 及索引覆盖优先，不能被默认值
覆盖。外部导入指标的播种约定不强制改为库；本项目不对这些已有数值重新计算。
均线是否退出缩放按合并后的 priceScaleId 与实际可见、有数据的蜡烛／Bar 判断。
只在同一非空轴 id 时退出；独立 left／right／overlay 轴保持自身范围，显式回调优先。
有注记的单值列保留 NaN／null／缺列的 time-only 缺口及“未定义”文本，共用断线与
图例链路；没有外部预热状态时不自行推断。无注记列保持原过滤行为。

无注记的普通系列继续按原 type 和数据列提取；显式 hline／vline 等独立职责保留。
旧 Histogram 柱色和参考线样式处理迁入共享展示职责，不在 GridItemBuilder、
SeriesDataExtractor 或共享图表保留 RSI／MACD 等专用判断。
共享通用样式类型不得依赖 SeriesItemConfig、文件名或 legacy 页面模型。

### 显式参考线与默认线合并

共享展示职责按如下顺序合并：解析并校验原始位置 → 应用旧索引 show／showInLegend
覆盖 → 建立完整参考线清单（包括 show=false）→ 关联和抑制默认线 → 生成可见描述。
不能先过滤隐藏项，也不能因元数据输出扩展改变文件项的原三维索引。
自动参考线保持 axisLabelVisible=true、title 为空，只显示价格轴数值；当前指标值
标签保留。legacy 显式 label／showLabel 的用户语义不变，不套用默认标题清理。

独立 type=hline 项可选 referenceFor，值为同一 chart 的指标组 id；目标存在且
必须同 Pane，否则在配置加载报错。绑定后按组实际轴承载；其 value 可覆盖默认
阈值或增加自定义阈值。元数据不读取 label 猜 RSI，也不根据数据列名猜组。

合并规则如下，value 严格按配置数值匹配：

| 显式来源 | 作用范围 | 默认线处理 | 显式线可见条件 |
| --- | --- | --- | --- |
| referenceFor 指定组的独立 hline | 该组＋value | 抑制该组同值默认线 | 组至少一输出可见，且 hline.show=true |
| 有 indicator 注记项的内联 hLineOpt | 该组＋value | 抑制该组同值默认线 | 所属文件项 show=true |
| 未关联独立 hline，或普通项的内联 hLineOpt | 同 Pane＋value | 抑制同 Pane 各组同值默认线 | 沿旧配置与索引覆盖，自身可见时绘制 |

抑制不依赖显式线是否可见；show=false 同样抑制，防止隐藏后默认线重新出现。
不匹配的默认阈值保留；不匹配的显式线继续存在。显式重复线保持原文件配置，
去重只防止额外生成默认线，不擅自删用户配置。未关联线保留旧承载系列／轴；
需要精准指定组与轴时使用 referenceFor，不能因主题变化丢失关联。

例如某 RSI 组默认 30／50／70，已有这三个独立 hline 时不再生成重复默认线；
索引覆盖把 50 设为隐藏时，50 仍被抑制，其他两条按显式样式显示。
只有显式 50 时默认 30／70 保留；设置 referenceFor 仅影响指定文件组。

### 柱色与样式覆盖

完成索引覆盖后，普通样式按“元数据默认 → 文件显式选项”合并，只覆盖确实提供
的字段，不能让未提供字段的 undefined 消掉默认样式。
Histogram 颜色优先级为：显式 histogramOpt.color → 元数据逐点策略 → 通用默认颜色。
显式固定 color 存在时，提取器与展示层不生成自动逐点 color，清除先前自动颜色；
全量数据与实时补丁使用同一规则，不能只 applyOptions 留下旧的点颜色。

没有显式 color 时，注记角色采用元数据策略；普通无注记 Histogram 延续既有四色
策略，但策略代码只存在于共享展示职责。移除固定颜色后按当前主题重新生成颜色，
不重新计算指标数值。普通 LWChart 直接传入的显式点颜色保留通用图表职责。

## 公开接口与用户写法

完整参数契约只有主任务一份，下列写法在本阶段正式可用：

```toml
[dashboard]
indicators = ["sma,20", "ema,14", "rsi,14", "macd,12,26,9", "bbands,20,2"]
```

```text
/?indicators=ema%2C14%3Brsi%2C14%3Bmacd%2C12%2C26%2C9
```

示例表示 EMA 主图、RSI 副图以及一个含两线一柱的 MACD 副图；不是按输出角色
新增多个设置项。全部十一类型的紧凑格式与边界见主任务，不增加同义 type。

legacy 副图中一项的真实 JSON 写法：

```json
{
  "type": "histogram",
  "fileName": "indicators.csv",
  "dataName": "macd_hist",
  "show": true,
  "showInLegend": true,
  "indicator": {
    "id": "macd-main",
    "spec": {"type": "macd", "fast": 12, "slow": 26, "signal": 9},
    "output": "histogram"
  }
}
```

同组其余项使用 type=line、output=macd／signal 及各自文件列，置于同一 Pane。
id 和 spec 的规则、角色缺项允许范围以主任务为准；不指定 indicator 仍是合法
普通文件系列。错误示例是 Histogram 绑定 output=signal，须在配置加载明确拒绝。
两个不同 id 的同参数 MACD 文件组合法，同 id 重复 output 不合法；market 仍拒绝
列表中的同配置重复。legacy 不受 market 的十二实例上限限制。

明确关联参考线的真实写法，例如通过索引覆盖隐藏 RSI 中线后仍抑制默认中线：

```json
{
  "type": "hline", "show": false, "referenceFor": "rsi-main",
  "hLineOpt": {"value": 50, "color": "#888888", "label": "中线"}
}
```

referenceFor 只允许独立 hline；不存在的组、跨 Pane 关联或在其他 type 上使用
均明确报错。固定柱色写法为 `"histogramOpt":{"color":"#888888"}`，它覆盖自动四色。
原 LWChart／Notebook 入口保持；补齐 referenceFor、displayName、Histogram 和
time-only 缺口补丁的声明。

Notebook 声明随正式 `just legacy --build` 的 ES／UMD 产物生成、复制；不维护手写接口副本。
默认组件与 mountDashboard 保持同一运行时入口，类型使用真实 DashboardProps。
声明入口为 chart-dashboard.d.ts、chart-dashboard.es.d.ts、chart-dashboard.umd.d.ts，
共享 types/ 下由 TypeScript 7 从 src/lib-entry.ts 及依赖生成的声明。
公开类型范围为 DashboardProps／DashboardOverride、ChartConfigJSON／SeriesItemConfig、
IndicatorSpec／IndicatorAnnotation／IndicatorOutput、ChartApi／ChartConfig／SeriesConfig／
SeriesDataPatch／SeriesMode。ChartApi 仅表达共享组件回调，不改变 mountDashboard 返回对象。
UMD 声明提供 ChartDashboardLib namespace；类型消费需要 Svelte 与 lightweight-charts 类型依赖。

真实 ES 类型写法如下，路径相对于复制后的库目录：

```ts
import { mountDashboard } from './chart-dashboard.es.js';
import type { IndicatorAnnotation } from './chart-dashboard.es.js';
const indicator: IndicatorAnnotation = {
  id: 'rsi-main', spec: { type: 'rsi', period: 14 }, output: 'value',
};
mountDashboard(document.getElementById('chart')!, { zipData: new Blob() });
```

## 测试、验证与阶段过渡

实施必须通过正式 `just check`、`just test` 和
`just market --build`；使用离线 fixture，legacy 构建／复制只使用正式测试的
临时 Notebook 目标，不能改写用户真实导出目录，不新增在线验证。

共享展示与生命周期测试证明：

- 全部十一指标由元数据生成正确原语、组内角色、主图／副图、轴和参考线；更改
  定义中的显示描述即可改变结果，图表和入口无需新增某指标名称分支。
- 同类不同参数、多输出、预热、零值与配置顺序不会串组；显示名称变化不改变 key。
- legacy 两组相同参数／角色不会互相覆盖，market 重复配置仍失败；MACD 统一首点，
  CCI 有限末根变为 undefined 后不留下旧值，Pane 保留且后续可恢复。
- 价格缩放区分均线与布林带，副图不用价格轴；图例与坐标轴格式一致。
- MACD 全量与尾段柱色一致；替换、追加、删除、主题、显隐和参考线生命周期无残留。
- 分割线普通／悬浮颜色在两种主题初始加载、设置切换和历史导航时更新；真实拖拽
  调整后的 Pane 高度保持，图表实例不重建且不重新请求行情。
- 显式 RSI 30／50／70 不重复生成默认线，隐藏 50 也不重新出现；部分覆盖、组绑定、
  未绑定 Pane 覆盖、其他阈值共存及主题变化遵守合并表，非法关联在加载阶段失败。
- 自动参考值仅在价格轴显示，实际 canvas 绘图区没有重复标题；明暗主题及切换后
  均成立，legacy 显式标题继续显示，当前指标值标签保留。
- 显式 Histogram 固定颜色确实消除逐点自动色，全量／补丁相同；移除固定颜色
  后恢复元数据策略，普通无注记系列不被迫添加注记。
- Histogram 非法补丁在整批应用前失败；通用历史更新和蜡烛精确视窗回归通过。
- 用真实 SDK 验证初始尾部及中间缺口的恢复、重复缺口和后续有限点不丢失；
  同批蜡烛与单值更新完整提交，未知历史批次完整拒绝。真实 canvas 不跨 CCI undefined
  画线，鼠标及同步图例显示预热／未定义，恢复和删除后无孤立分段。

真实入口与浏览器测试证明：

- 完整合法 DSL、TOML、URL 与设置往返；非法参数、重复配置和未知角色按正确阶段
  报错，应用／取消与前进后退保持；默认 EMA 视觉和已有主题继续成立。
- market 显示全部已准入指标，RSI 等独立 Pane 和 MACD 多输出可更新及删除；
  标签没有组显隐操作，删除／重新添加重置该实例起点，预热／未定义保留 Pane。
  全量重载不遗留旧系列，主题／时区操作不请求行情或重新计算。
- legacy 注记复用同一元数据，显式样式／Pane／索引覆盖优先；部分角色合法，
  组内冲突明确报错。无注记配置、底部栏、箭头／风险线和 Notebook 回归通过。
- ES／UMD 及 market 构建使用正式链路，生成声明表达新增字段与补丁，不遗留页面
  模型向共享图表的反向依赖。
- 从临时复制目标消费 ES／UMD 声明，真实配置、注记、显示名、参考线与缺口／Histogram
  补丁合法；错误角色、缺参数、错误字段及补丁数值必须由生成类型拒绝。
- 真实设置入口修改前置指标参数、替换类型、增删及重排后独立 Pane 与输出角色保持；
  真实 Notebook UMD 的独立价格轴均线仍在画布内，CCI 导入缺口不连线且图例显示状态。

实现时同步新指标有效规范及必要入口说明，只描述已经可用的链路；不批量改旧
task 文档。退出全部临时 EMA 子集限制与数据桥接，每个入口均完整可用。
严格计算对齐在前置已是必需条件，本阶段不改变数值；后续集成验证补齐跨入口
验收、库可靠性证据和最终遗留检查，不承接本阶段故意留下的失败。
