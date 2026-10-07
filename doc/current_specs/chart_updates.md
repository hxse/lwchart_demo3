# 共享图表更新与同步

## 唯一绘图链路

两场景都使用 `src/components/lw-chart/LWChart.svelte` 和同一 ChartController。
SeriesRegistry 管理创建／删除；LegendManager 管理图例；TimeScaleHelper 负责既有
不晚于目标时间的查找。旧 ZIP、箭头、SL／TP、Notebook props 和库导出保持有效。

`seriesMode?: 'replace' | 'reconcile'` 默认 replace，保留旧 props 静态重建行为。
静态 replace 允许同名系列，仍按每项独立创建；清理覆盖全部所属实例。
reconcile 要求非空、唯一的 name；同 name／type／pane 保留实例，协调结构和样式，
不让 props.data 覆盖未变系列。新建系列可用其静态 data。结构改变清理旧图例注册。

## 命名数据接口

LWChart 导出方法和 onRegister API 均提供 replaceSeriesData／updateSeriesData。
注册回调执行前系列已准备好。原 setCrosshair、clearCrosshair、scrollToTime、
resetTimeScale、fitContent 继续可用。

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

SeriesDataPatch 为 `{name,data}`，仅支持 Candle／Line 的 UTC 秒数据。
替换可清空系列；空增量无操作。整批提交前校验所有名称、类型、有限值、OHLC 和
升序唯一时间；增量不能早于现有末根。非法批次明确抛错，不留下半应用结果。
补丁不自动建系列；同时间增量覆盖末根，新时间追加。

新场景初始化及身份切换替换数据；普通尾根更新直接 update。窗口裁剪使用既有
系列 setData，按时间锚点恢复历史视口，保留当前跨度。用户看末尾时保留末尾偏移、
继续跟随；查看历史时不强制右移，不 reset／fitContent，不重建 chart 或 series。
新增 EMA 只增加相应系列，candle 和已存在的 EMA 保持实例。

新看盘的 rightPriceScale.scaleMargins 为 `{top:0.03,bottom:0.03}`，以可见蜡烛的
最高 high／最低 low 缩放。EMA 的 autoscaleInfoProvider 返回 null，线段可在边缘
裁剪，不扩张蜡烛范围。价格显示复用已创建的 Intl.NumberFormat；不在每个刻度重新
构造 formatter。上述显示设置属于新入口，旧 ZIP／Notebook 的边距配置继续有效。

## 多周期光标

ChartSyncManager 位于共享图表 logic 目录；两场景共同使用。
register 返回注销函数，注销只移除同一 API 代次；clear 释放注册和延迟跳转 timer。
缓存事件在 ready 时广播，广播有重入保护，程序光标回调不导致递归。

同步时间按目标图中不晚于源时间的真实 K 线匹配；无匹配历史则清除目标光标。
鼠标离开清除其它图。只联动时间，不承诺价格横线或缩放联动。
Lightweight Charts 的程序清除不发事件，新页面同步清理其光标视图状态。

离线测试同时验证稳定实例、批次校验、视口恢复、图例清理、同步重入，以及真实
浏览器鼠标映射／离开行为；旧 Notebook 样本覆盖标准和自定义系列。
