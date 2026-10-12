# 技术指标使用

## market 设置与书签

设置的“技术指标”使用分号分隔的紧凑列表，点击应用后才修改图表和 query。
取消／Esc 不提交，前进后退同步配置；none 表示无指标，最多十二个不同配置。
默认仍是 EMA14／50／100。示例：

```text
ema,14;rsi,14;macd,12,26,9;adx,14;bbands,20,2
```

```toml
[dashboard]
indicators = ["ema,14", "rsi,14", "macd,12,26,9", "adx,14", "bbands,20,2"]
```

```text
http://127.0.0.1:5174/?indicators=ema%2C14%3Brsi%2C14%3Badx%2C14
```

目前可计算 sma、ema、dema、tema、rsi、cci、macd、atr、adx、er、bbands。
ADX 写作 `adx,14`，周期至少为 2；使用独立副图与 25 参考线。平盘预热后显示 0，
出现波动后正常更新。ADX 使用随依赖安装的零波幅补丁，不需要手动修改库。
非法参数拒绝整个提交，保留原配置和地址，不会默默删掉该项。

开发启动、检查和构建会核对安装库版本与补丁后 DX.js 的完整文件指纹。
出现“ADX 依赖校验失败”时可先运行 `bun install --frozen-lockfile` 恢复，随后运行
`just check`；有意调整依赖或补丁时，须重新审核和通过指标测试后手动更新预期指纹。

均线和布林带叠加主图，其余使用独立副图；MACD 两线一柱共用一个副图。
拖动分隔线调整高度。配置删除会释放实例与独占副图，重新添加从当前窗口
初始化；指标标签是文字，不提供临时隐藏按钮。

预热不足时保留副图但不伪造数值。CCI 平盘可能未定义，图表显示缺口，不补零；
后续有限结果正常恢复。异常计算会保留旧画面并暂停该图，移除问题指标或刷新。
EMA 使用库原生播种，与旧 SMA 播种不同；绘图缩放或取数异常不能改变计算数值。

## legacy 文件注记

legacy 继续使用文件里的指标值，不重新计算。图表配置的某项 series 可以添加
indicator；同一 chart 的 id 识别文件组，spec 描述参数，output 指定输出角色。
下面是一项 MACD 柱配置，可以放在 chart 的相应 Pane 数组内：

```json
{
  "type": "histogram", "fileName": "indicators.csv", "dataName": "macd_hist",
  "show": true, "showInLegend": true,
  "indicator": {
    "id": "macd-main",
    "spec": {"type": "macd", "fast": 12, "slow": 26, "signal": 9},
    "output": "histogram"
  }
}
```

同组的两条线使用 type=line、output=macd／signal 和各自文件列，保持相同 id、
spec 和 Pane。只展示一个角色也合法；不同 id 可以使用相同参数。
包括 ADX 在内的全部指标注记均可展示外部已有数值。
不加注记的旧文件配置继续有效。

显式样式、Pane、show／showInLegend 和旧索引覆盖优先。固定柱色可增加
`"histogramOpt":{"color":"#888888"}`，它覆盖自动四色，不保留旧逐点自动色。

可用独立 hline 关联到具体组：

```json
{
  "type": "hline", "show": false, "referenceFor": "rsi-main",
  "hLineOpt": {"value": 50, "color": "#888888", "label": "中线"}
}
```

目标组必须存在且在同 Pane。这个配置隐藏并抑制 rsi-main 的默认 50 线；
未关联显式 hline 按同 Pane、同数值覆盖默认线，隐藏项也不让默认线补回来。
其它阈值继续共存。完整规则见 [指标规范](../current_specs/indicators.md)。

均线使用 `"lineOpt":{"priceScaleId":"left"}` 独立价格轴时会按自身数值缩放。
有指标注记的导入列中 NaN／null／缺失值会断线并显示“未定义”，不会跨缺口连接。

## Notebook 声明

`just legacy --build` 构建、复制 JavaScript 与声明。保留原默认组件、mountDashboard
及 ChartDashboardLib 全局名；ES／UMD 文件旁有同名 .d.ts，共用 types/ 下的生成声明。
消费者需要 Svelte 和 lightweight-charts 的类型依赖。

```ts
import Dashboard, { mountDashboard } from './chart-dashboard.es.js';
import type { IndicatorAnnotation, SeriesDataPatch } from './chart-dashboard.es.js';
import type { UTCTimestamp } from 'lightweight-charts';
const annotation: IndicatorAnnotation = {
  id: 'rsi-main', spec: { type: 'rsi', period: 14 }, output: 'value',
};
const patch: SeriesDataPatch = {
  name: 'line', data: [{ time: 1718000000 as UTCTimestamp, customValues: { displayValue: '未定义' } }],
};
mountDashboard(document.getElementById('chart')!, { zipData: new Blob() });
```

UMD 的 TypeScript 脚本可引用 `chart-dashboard.umd.d.ts` 后使用
`ChartDashboardLib.mountDashboard`。公开类型包含 DashboardProps／DashboardOverride、
ChartConfigJSON／SeriesItemConfig、IndicatorSpec／IndicatorAnnotation／IndicatorOutput、
ChartApi／ChartConfig／SeriesConfig／SeriesDataPatch／SeriesMode。
ChartApi 是共享组件回调的类型，不是 mountDashboard 的返回值；没有新增运行时挂载入口。
