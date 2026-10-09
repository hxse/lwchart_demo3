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
升序唯一时间。增量可修正已经存在的旧时间点，使用 SDK historicalUpdate；不能插入
未知的历史时间。非法批次明确抛错，不留下半应用结果；补丁不自动创建系列。
同时间覆盖，新于末根的时间追加；不变数据由行情状态提前跳过提交。

新场景初始化及身份切换替换数据；普通尾根更新直接 update。窗口裁剪使用既有
系列 setData，按时间锚点恢复历史视口。主蜡烛系列只调整水平偏移，保留当前
barSpacing；纯折线系列继续使用既有逻辑范围恢复。不 reset／fitContent，不重建
chart 或 series。
新增 EMA 只增加相应系列，candle 和已存在的 EMA 保持实例。
完整重载丢失历史视口时间锚点时，以原跨度显示新窗口末尾，不拼旧数据。

主蜡烛系列在整批提交前，以最新蜡烛实际右边缘是否超过绘图区判断跟随。
完整显示及恰好贴边均跟随；任意右侧部分裁切或整根隐藏均视为历史。
左侧历史不可见不影响判定，不依赖右侧有无留白或整数逻辑范围。
几何适配集中在 CandleVisibility，以 timeToCoordinate、当前 barSpacing 和主画布
bitmap／CSS 比例对应 lightweight-charts 5.2.1 的蜡烛实体与影线外轮廓；使用实际
像素对齐，不给裁切放宽容差。未形成画布时不强制跟随，空数据保留初始化行为。

跟随时保留用户当前末尾偏移；在绘图区尺寸与缩放不变时，新增 N 根使旧时间点
左移 N × 当前 barSpacing，新末根中心占据原末根中心位置。只改价格、成交量或
修正历史不产生水平位移。保持原 barSpacing，不按实体宽度或取整 CSS 像素移动，
不启动平滑动画。窗口裁剪按末尾或时间锚点恢复，即使总数量不变也遵守上述规则。
历史锚点仍存在时，该时间点的屏幕位置保持不变。
SDK 滚动请求在下一帧应用；同帧连续批次继承待绘制偏移，SDK 应用请求或用户
拖动／缩放后以实际视窗为准，避免未绘制状态造成累计补偿误差。

浏览器离线测试以真实 SDK 绘制矩形独立核对几何，覆盖完整贴边、一个 bitmap
像素及约 1/3 裁切、完全隐藏、恢复跟随、单根／批量追加、连续裁剪与小数间距。
水平坐标误差上限为 1e-8 CSS 像素，bitmap 离散对齐须对应 SDK 绘制规则。

## 图表外观更新

LWChart 导出方法与 onRegister API 提供 `applyOptions(options: DeepPartial<ChartOptions>)`，
直接转发既有 ChartController／Lightweight Charts 的选项更新，不重建图表或系列。
初始化 chartOptions props 保持原职责；动态切换颜色显式调用 applyOptions。

```ts
chartApi.applyOptions({ layout: { textColor: '#d1d4dc' } });
```

crypto 主题更新只携带背景、文字、网格、坐标轴边框和光标颜色，不携带初始化缩放、
边距或 rightOffset；主题切换不替换数据、不 fitContent／reset，不改变用户当前视口。
LegendManager 读取继承的 --chart-legend-bg／value／label／border／shadow CSS 变量，
未提供变量的旧场景继续使用原浅色图例；两场景没有独立图例引擎。

新看盘配置 localization.timeFormatter 和 timeScale.tickMarkFormatter，统一图例、
光标和刻度文字的显示时区；UTC 数据不平移。LegendManager 复用同一时间函数，
读 candle.customValues.volume 显示 V。旧场景未指定时间函数时保持原默认图例。
时间函数只随时区改变创建，有界缓存同根字符串，不因鼠标移动构造 Intl。

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
设置同一根也可能不发事件。LWChart 导出与 onRegister 新增 getCrosshairTime()，
返回控制器实际匹配的 UTC 秒或 undefined；新页面据此更新状态，不复制时间匹配算法。

离线测试同时验证稳定实例、批次校验、视口恢复、图例清理、同步重入，以及真实
浏览器鼠标映射／离开行为；旧 Notebook 样本覆盖标准和自定义系列。
