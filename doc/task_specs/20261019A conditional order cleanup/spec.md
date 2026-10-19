# 空仓条件单清理

## 任务边界

在现有 Binance／Kraken 永续手动下单范围内，交付两项查询偏好、统一查询／清理
流程、确认框持仓展示及离线验证。交易范围、风险算法、手续费和原有三腿执行不变。
保留 `GET /api/ccxt/fetch_positions` 只读入口，增加受限的清理 POST。
替换面板组件私有的持仓状态，将其纳入页面级执行协调；复用持仓归一与共用展示组件。
同步受影响 current spec、guide；不修改旧任务历史和 ccxt-proxy2。

完成主链、失败／跳过语义、页面生命周期隔离及正式检查即可交付。不增加持仓轮询、
限价入场、撤全部订单、自动重试、自动平仓、跨页／跨客户端锁或浏览器缓存。
未知事实不得判为空仓或可撤单；已准入流程不能与本页入场重叠，这两项阻断交付。

## 任务规范

### 控制与生命周期

参考区提供“空仓时清理只减仓条件单”和“下单前自动查询”，独立且默认开启。
手动按钮随清理选项显示“查询并清理”或“查询持仓”。偏好放入本页 OrderMemory，
关闭、切品种、切布局保留，另一个页面独立；不写 URL 或任何浏览器存储。
偏好变化不触发请求、不标记风险参数待确认，也不随参数重置而改变。

点击做多／做空立即打开确认框；自动查询开启时发起一次当前已确认交易身份的查询，
结果在确认框显示。自动关闭则不查询也不展示持仓。清理关闭时仅 GET；清理开启时
使用清理 POST。手动和自动共用一个单飞入口，已有同身份、同模式查询进行中时复用。
确认框不等结果才打开；纯 GET 的等待／失败不阻止最终确认。清理全过程进行中禁止
本页提交新入场、查询交易结果或发起另一轮清理。流程结束后仍按原来的最新参考校验
确认下单，错误／跳过只是提示，不自动重试或自动入场。最终确认不再查询一次。

未确认参数时禁用查询及开仓；打开面板、ticker、强制刷新和改勾选均不触发此流程。
账户模式证据读取和执行后核对仍按原链路运行，不能与本功能的展示查询混同。

动作冻结 exchange_name、market、is_live、完整 symbol，使用下单身份而非图表身份。
纯 GET 在关闭面板或切身份时取消并清空；关闭确认框本身不必取消面板共用的查询。
清理 POST 准入后不受关闭／切品种影响，页面保留最近一轮清理状态及原身份，直到
用户发起下一轮查询。旧结果不得伪装成新身份结果。页面操作协调也跨面板重开有效。
清理可能在取消交易确认前已生效，界面必须明示“取消下单不会恢复已撤条件单”。

### 清理资格与执行顺序

1. `fetch_positions` 请求携带完整身份，通过 `symbols` 筛选；使用既有严格数量归一。
   只有成功空列表或全部已知 contracts 为零才是空仓。多空逐条检查，不净额抵销；
   非零、未知或失败均不撤单。展示非零／未知记录的方向、数量、均价及查询时间。
2. 确认空仓后调用 `fetch_open_orders`，传 symbol，不传 since／limit；不得使用
   现有执行核对中缓存且 limit=1000 的列表。仅目标 symbol 参与判断，缺少身份的
   非法记录使本轮失败。列表中任何非明确 reduceOnly=true 的未终结订单都可能开仓，
   跳过全部清理；状态未知也跳过。已知终态记录不作为候选。
3. 候选必须 status=open、reduceOnly=true，且 triggerPrice 为正或 type 明确表示条件单。
   支持 Binance 的 stop、stop_market、stop_loss、stop_loss_limit、take_profit、
   take_profit_market、take_profit_limit、trailing_stop_market 及 Kraken stp、
   trailing_stop；大小写归一。无触发价的普通 limit／market 和未知类型均保留。
   不要求 lwchart 客户端编号。重复订单 ID 使本轮失败，不能重复撤单。
4. 无候选则结束。存在候选时撤单前再读取一次持仓，变化或未知立即跳过。
5. 每个候选只提交一次 `cancel_order`，显式传原身份、id 和 symbol；并发上限为 2。
   不传后端禁止的 stop 字段，不调用 cancel_all_orders，不自动重试。复用 OrderSession
   总预算 60 秒、单请求最多 8 秒及后端配置上限；超时后的尚未发出项记为 not_sent。
6. 撤单后重新请求 open orders 验证，不复用撤单前列表。每项独立记录受理状态
   accepted／rejected／unknown／not_sent，和核对结果 canceled／absent／open／unknown。
   明确取消回执且最新列表无该项才确认 canceled；稀疏 200 回执只确认 accepted，
   不在列表只表示 absent（已不在挂单列表，最终状态未确认）。仍在列表表示 open，
   查询失败表示 unknown；保留具体失败，部分成功不能被总体成功掩盖。

读、写错误用既有安全错误映射，不透出私有 info、凭据或任意上游正文。写后错误
仍返回已有逐项事实。网络断开导致浏览器没有收到清理结果时提示可能已经生效，
不得宣称未撤单，不自动重新提交；本页按单调时钟锁定至请求开始后的 65 秒执行窗口结束，
避免响应提前丢失时与服务端剩余撤单重叠。

### 服务准入

新增入口只接受同源 JSON POST，正文不超过 8 KiB，不接受查询参数、额外字段、
订单 ID 或通配品种。身份必须完整并通过现有交易范围校验。校验失败在访问后端前
返回既有结构化 4xx；准入后使用不继承浏览器取消的独立执行预算。
开发和生产服务共享路由，生产连接给出与其他交易 POST 相同的 65 秒响应窗口。

## 公开接口与用户写法

默认操作：“做多 · 市价下单”→立即显示确认框和查询中状态→确认空仓后检查挂单，
必要时清理→显示结果→用户点“确认做多”才入场。若有未成交开仓挂单，显示
“存在开仓挂单，已跳过清理”，不撤任何订单。关闭清理后只查看仓位；关闭自动查询后
只在用户点击查询按钮时操作，确认框不显示仓位。

请求示例（由本地页面同源发送）：

```http
POST /api/ccxt/manual-order/cleanup
Origin: http://127.0.0.1:5174
Content-Type: application/json

{"exchange_name":"binance","market":"future","is_live":false,"symbol":"BTC/USDT:USDT"}
```

响应固定包含 identity、checked_at、snapshot、outcome、message、orders、issues。
snapshot 为已有 `{identity, checked_at, positions}` 或 null。outcome 为 skipped
（资格不满足）、empty（无需清理）、completed（逐项尝试及核对完成）、failed（无法完成
查询／规划）。completed 不保证每项成功，须看 orders 和 issues。

```json
{
  "identity":{"exchange_name":"binance","market":"future","is_live":false,"symbol":"BTC/USDT:USDT"},
  "checked_at":1792411200000,
  "snapshot":{"identity":{"exchange_name":"binance","market":"future","is_live":false,"symbol":"BTC/USDT:USDT"},"checked_at":1792411199000,"positions":[]},
  "outcome":"completed","message":"清理及核对已结束，请查看逐项结果",
  "orders":[{"id":"2146760","write_state":"accepted","confirmation":"absent","error":null}],
  "issues":[]
}
```

例如增加 `ids` 字段返回 400 INVALID_TRADE_REQUEST；GET 清理路径返回 405；缺少
同源 Origin 返回 403；不支持的交易范围按原规则拒绝。以上均不访问后端。
后端映射固定为 `/ccxt/fetch_positions`、`/ccxt/fetch_open_orders`、
`/ccxt/cancel_order`，不依赖假设路由或自建通用代理。

## 测试、验证与阶段过渡

使用 `just check` 和 `just test` 正式入口；后者包含离线浏览器及看盘／旧入口构建。
静态检查和全套离线测试必须通过。不添加在线账户测试或真实撤单操作。

离线服务测试覆盖两个交易所、全部已知零／空列表、未知或非法数量、多空并存、
持仓变化、开仓挂单与未知属性跳过、普通减仓限价保留、条件类型与触发价识别、身份
隔离、重复 ID、逐笔有限并发、稀疏回执、部分失败、读后核对和不重试；核对精确的
请求字段和未发出的写入。覆盖准入拒绝、取消浏览器请求后继续完成和安全错误输出。

状态与浏览器测试覆盖两项默认值、四种组合、手动／自动单飞、弹窗立即打开、纯读
不阻塞和清理阻塞、失败释放锁、关闭／重开／切身份后保留原身份结果、复选框页面
记忆及参数锁定。保留原交易确认、最新参考、行情刷新及图表回归；开发／生产路由
均验证。迁移原“永不自动展示查询”的测试至关闭选项场景，不保留平行旧实现。
无临时桥接或允许失败阶段。
