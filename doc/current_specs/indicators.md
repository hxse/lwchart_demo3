# 指标定义与展示契约

## 所有权与当前范围

src/indicators/ 拥有指标参数、输出角色、原生调用描述、系列身份和默认显示元数据。
共享图表只消费通用系列描述；共享样式类型位于 src/utils/seriesStyles.ts，不依赖
legacy 页面或文件路径模型。legacy 原公开样式类型转出同一个定义，不维护副本。

定义包含十一种候选：sma、ema、dema、tema、rsi、cci、macd、atr、adx、er、bbands。
当前公开 market 暂时仅允许 EMA，仍使用既有 EMA 计算；其他候选只有定义，不
代表已通过原生计算准入。标签与 EMA 配色已读取共享元数据，默认视觉不变。

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
legacy 文件注记尚未接入导入链路，当前仅有共享身份与注记校验工具。
SeriesConfig.name／SeriesDataPatch.name 是系列键；可选 displayName 用于展示，
未指定时仍显示 name。

## 显示定义

每种定义声明输入字段、原生构造及根可用状态、输出角色／原语、默认主图或
副图、缩放贡献、参考线、格式、主题颜色、图例和 Pane 权重。布林带和 MACD
多角色、ADX 单角色、ER 区间效率比都由定义表达，图表不能按指标名补规则。
默认 EMA14／50／100 使用橙／绿／蓝，均线不扩大蜡烛主图的价格缩放范围。
显示格式只格式化文本，不改变原始数值。原生计算与完整显示接入不属于当前阶段。
