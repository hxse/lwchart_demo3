# 一次手动执行与 lwchart HTTP 契约

## 生命周期与明确停止点

本流程是一次普通异步请求，不是后台策略或持久化任务。浏览器页面级状态持有
正在执行的 Promise 和最近一轮结果，浮层仅负责编辑与展示。关闭浮层取消预览
读取，但不取消已准入执行；页面内同一时间只发起一轮。

服务端按下列顺序执行：

1. 校验方法、同源、JSON、身份和参数；用真实 fetch_market_info、fetch_trading_fee、
   fetch_positions 读取规则、费率及模式证据，复算提交快照并与 expected 比较。
   缺能力、核心资料缺失、过期、无解或计划改变时，在任何交易写操作之前失败。
   未知上下限、名义金额依据和账户模式保留警告，由交易所最终接受或拒绝。
   读取结束、入场发送前再确认报价仍在有效期内，不能因资料查询耗时而使用过期报价。
2. 生成本轮三个客户端订单号，提交一次市价入场。明确拒单终止，保护单均为未提交。
3. 优先使用完整回执确认实际 filled／average／终态。事实不足时进行一轮读取，
   可组合 fetch_order 与本次订单的成交记录；终态明确且实际成交量为零时不挂保护。
4. 只有已确认终态的非零成交才继续。按实际成交量及均价重算保护计划；部分
   成交仍继续保护实际成交部分，不补足入场数量。事实不足则结束为未确认。
5. 以两个独立 Promise 并发调用止损、止盈接口，用 allSettled 收集各自结果。
   一张失败不取消另一张，不再次提交任意一张，也不自动平仓。
6. 并发读取本品种持仓、挂单及必要订单状态，形成最后一轮事实快照后结束。
   查不到、暂不可用或资料矛盾均保留未知，不启动长期轮询。

无论 UI 是否仍打开，全部流程总预算为 60 秒；每个上游 HTTP 请求使用
`min(backend.request_timeout_seconds, 8 秒, 剩余总预算)`，不得没有超时。
预算耗尽时尚未发送的动作记为未提交；已经发送但无可确认回执的动作记为未知。
浏览器给完整执行请求 65 秒读取预算；本地超时不再发送第二份请求。
生产 Bun 对两个交易 POST 设置 65 秒连接闲置超时，覆盖这一轮预算；不改变行情
和静态请求的默认连接设置。离线浏览器须覆盖超过默认十秒的合法执行。
后端 Kraken 费用查询单个网络步骤上限为 10 秒并有有限只读重试；lwchart 的
8 秒请求预算仍适用，提前超时按资料不可用处理，不以旧费率继续开仓。

任何写接口每轮至多调用一次，包括认证失败后的原请求也不自动重发。正式写入
前复用既有 token／登录单飞机制；写请求返回 401 时失效对应 token 并报告，供
用户下次明确操作重新登录。只读查询保留现有有限鉴权／网络读取策略，但不能
借查询恢复触发补单、撤单或平仓。

查单未完成时不把 HTTP 200 当作成交。例如入场为 open 且尚有未成交数量，即使
已有少量成交，也不能确认最终数量已固定：本轮结束为未确认，提示用户核对；
本任务不取消剩余入场量或持续追踪其后续成交。对于已经终结的 IOC 部分成交，
则用实际 filled 继续保护。明确的 rejected／canceled／expired 也要看实际 filled，
不能仅根据状态名称忽略已经发生的成交。

## 数量、方向与保护结果

入场 buy 对应多单，sell 对应空单；保护使用相反方向及 reduceOnly=true。
委托参数中的 amount 不能冒充 filled，市价请求中的参考价不能冒充 average。
成交均价缺失时，仅可用归属于本订单的成交数量与价格加权计算；不能拿整个
账户合并持仓的 entryPrice 代替本次均价。

实际数量、币种与价格计算遵循 [spec_02_calculation.md](spec_02_calculation.md)。
若实际成交导致风险偏差，显示警告但不自动调整数量。若无法生成合法保护计划，
两张保护单保持未提交并说明具体原因，入场成交事实必须保留。
两张保护单已经发送后各自保留接受／拒绝／未知结果，不为形成整齐的“全成功”
结果撤掉已成功的一张。

核实必须匹配本轮订单 ID，必要时匹配该腿 clientOrderId，同时核对 symbol、方向、
数量、触发价和可确认的只减仓属性。持仓和其他挂单仅作补充展示，不单独证明
本次动作成功。保护单不在 open orders 中时，需要区分已经成交、撤销、拒绝与未知。
已触发或成交的保护单显示对应事实，不再标成“保护已挂”。

剩余挂单由用户管理，本任务不承诺保护单互斥。若最终快照发现一张已成交而另一张
仍挂着，显示剩余订单 ID 和需要手动检查的提示，不自动撤单。
原有同品种仓位可能与本次成交合并或抵销；仅展示本次订单与当前持仓各自事实，
不自动隔离、并单或扩大保护数量。交易所因持仓冲突拒绝保护时按真实错误报告。

## 关联、状态和用户再次查询

浏览器在用户最终确认下单时生成 UUID v4 的 request_id。同一轮的三个 clientOrderId
固定为 `lw + 去掉连字符的 request_id + e/s/t`，分别表示入场／止损／止盈，长度
35 个 ASCII 字符。它们用于关联；不宣称跨进程去重或原子幂等，也不以同 ID 自动重发。

结果区分别呈现三腿的 write_state 与 confirmation：

| write_state | 含义 |
| --- | --- |
| not_sent | 本轮没有调用该写接口 |
| rejected | 得到明确拒绝且没有相反成交证据 |
| accepted | 得到该腿的有效受理／成交回执；不等于已成交或仍挂着 |
| unknown | 写请求可能已生效，但回执或事实不足 |

confirmation 为 `unconfirmed、unfilled、partially_filled、filled、open、canceled、
closed、rejected、expired` 之一；entry 的 unfilled 仅用于已确认终结且零成交。保护单成交／已关闭
的具体事实与请求受理分开保存；write_state=not_sent 默认 confirmation=unconfirmed。
资料冲突时以未确认及问题说明呈现，不能悄悄把未知映射为 rejected。

明确的 INSUFFICIENT_FUNDS、ORDER_REJECTED、NOT_SUPPORTED 等拒绝保留稳定
错误码；POST 后的断线、超时、HTTP 5xx、无有效回执或无法解析响应均按未知
处理，除非后端提供可靠的“尚未提交”证据。读取错误不删除已有成功回执。

结果区提供“查询结果”，只读取本轮已知订单／客户端订单号、持仓和挂单。
即使后来发现入场成交，该操作也不能隐含挂保护；显示“保护未提交，请手动处理”。
没有服务端持久化结果表，浏览器刷新或服务重启后的上下文恢复不在范围内。
结果未知时提示先核对，按钮不自动重试；下一次明确点击下单是新请求而非续做旧请求。

## HTTP 共同行为

以下是 lwchart 的接口，外部后端的实际接口见
[spec_01_backend.md](spec_01_backend.md)。开发 Vite 与生产 Bun 共用同一个路由
及处理函数；Vite 适配必须保留 JSON body、Content-Type、Origin 和原始 Host，
不能继续用只读中间件的 req.resume() 丢弃请求体。

交易 POST 仅接受 application/json、同源 Origin，正文上限 8 KiB。按实际访问的
Host／端口验证同源，适用于回环发布与 SSH 转发；不把容器内部监听地址当作浏览器
Origin，也不无条件信任 X-Forwarded-*。缺失或不匹配 Origin 返回 403，类型错误
返回 415，正文过大返回 413，均发生在任何上游调用之前。

所有路径使用白名单和自己的方法；GET 不产生交易副作用，不提供任意 CCXT 写
代理。POST /manual-order/check 虽为 JSON POST，语义严格只读。禁止客户端传入
URL、token、reduceOnly=false、Provider extras 或另一套保护价格处理参数。

lwchart 交易输入与计算结果中的金额、数量、价格、比例用有限十进制字符串；
market_info 透出的既有 number 字段保留后端类型，不参与精确计算。period、history_bars、
UTC 毫秒及 is_live 分别为严格整数／布尔值，不能把 true 当作数值。未知字段、
未知模式、非 market 入场、重复 query 参数或身份不一致均拒绝。
响应 Cache-Control=no-store；只返回必要归一字段和脱敏错误，不透传私有 info。

### 读取入口

```http
GET /api/ccxt/fetch_market_info?exchange_name=binance&market=future&is_live=false&symbol=BTC%2FUSDT%3AUSDT
GET /api/ccxt/fetch_ticker?exchange_name=binance&market=future&is_live=false&symbol=BTC%2FUSDT%3AUSDT
GET /api/ccxt/fetch_positions?exchange_name=binance&market=future&is_live=false&symbol=BTC%2FUSDT%3AUSDT
```

三个入口仅接受上例四个必填 query 字段。交易面板 market-info 是 lwchart 聚合接口，
内部调用三个已有后端路由，不要求 ccxt-proxy2 的同名接口返回手续费或模式。
响应固定为以下字段，不再定义与真实 schema 平行的 TradeMarketInfo：

| 字段 | 形状及来源 |
| --- | --- |
| market_info | MarketInfoResponse 的正式字段；保留 RuleValue 四态、数组规则与精确字符串 |
| trading_fee | TradingFeeResponse 的正式字段，含 source、updated_at；与 market_info.symbol 和请求身份核对 |
| position_evidence | 匹配记录仅保留 `{symbol, hedged}`；空列表为 []，查询失败为 null |
| warnings | 模式读取失败等 `{code,message}` 警告，未知规则的提示由共享准入计算补充 |
| observed_at | 本地服务完成本次聚合读取时的 UTC 毫秒，不覆盖 trading_fee.updated_at |

市场／费率读取失败时返回脱敏 `{error:{code,message}}`，保留明确错误码，不用
另一身份重查。独立持仓读取失败返回 position_evidence=null 及警告；未知约束／
模式不改写原始字段，按共享准入规则提示。价格／数量网格缺失仍列为阻断。
不向浏览器透出私有持仓详情或原始 info。模式判定只按后端扩展的证据规则。

ticker 返回下列形状，bid／ask／last 从上游 number 归一为可往返十进制字符串，
缺失值及 timestamp 缺失时显式 null；不增加上游没有提供的 markPrice：

```json
{
  "ticker": {"symbol": "BTC/USDT:USDT", "last": "10000", "bid": null, "ask": null, "timestamp": 1792230000000},
  "observed_at": 1792230001000
}
```

### 手动持仓读取

面板按钮触发的 fetch_positions 只调用后端同名读取；上游将单个 symbol 转成 symbols
列表参数，不读取挂单、余额或费率，也不发送写操作。与执行后核对复用同一归一
入口，返回身份、查询完成时间和当前品种记录，精简形状如下：

```json
{
  "identity": {"exchange_name":"binance","market":"future","is_live":false,"symbol":"BTC/USDT:USDT"},
  "checked_at": 1792230001000,
  "positions": [{"side":"long","contracts":"0.12","entry_price":"59000"}]
}
```

side 为 long／short／null；contracts 为非负十进制字符串或 null，entry_price 为
正十进制字符串或 null。零数量保留为 "0"，缺失数量保留 null；其它品种排除，
非法数值或读取失败走既有脱敏错误包络，不伪造空列表。接口为 GET、no-store，
沿用请求取消信号与不超过 8 秒的读取预算；浏览器仅点击“查询持仓”后单飞读取，
十秒超时，不自动重试。关闭面板或切换完整身份取消并清空快照；重开后不自动读取。
查询结果只显示在面板参考区，确认框不显示或等待持仓；它不作为最终交易准入保证，
也不进入下单正文，不替代既有模式证据读取及执行后核对。

### 执行请求

POST `/api/ccxt/manual-order` 的唯一请求形状如下。示例使用冻结时钟
1792230002000 及计算扩展的纯算法样本。此例冻结 lwchart 请求写法，不证明
当前后端能通过全部准入；实际面板必须使用本次 GET 得到的时间和资料。

```http
POST /api/ccxt/manual-order
Origin: http://127.0.0.1:5174
Content-Type: application/json
```

```json
{
  "request_id": "11111111-1111-4111-8111-111111111111",
  "exchange_name": "binance", "market": "future", "is_live": false,
  "symbol": "BTC/USDT:USDT", "mode": "fixed-risk-atr", "side": "buy", "order_type": "market",
  "parameters": {
    "timeframe": "30m", "atr_period": 14, "risk_amount": "1", "atr_multiplier": "2",
    "risk_tolerance": "0.05", "atr_tolerance": "0.05", "take_profit_multiplier": "1"
  },
  "atr_snapshot": {"value": "100", "bar_time": 1792229400000, "history_bars": 1000},
  "quote_snapshot": {
    "ticker": {"symbol": "BTC/USDT:USDT", "last": "10000", "bid": null, "ask": null, "timestamp": 1792230000000},
    "observed_at": 1792230001000
  },
  "expected": {"amount": "0.0045", "stop_price": "9800", "take_profit_price": "10200", "estimated_risk": "0.9891"}
}
```

parameters 的默认值和范围由主 spec 定义；history_bars 须在 atr_period..10000，
bar_time 为已有合法 UTC 毫秒。服务端不重算 ATR，使用其快照执行同一纯计算。
expected 用于发现规则／费率变化或客户端计划不一致，不是绕过计算的原生参数。
更新后的规则产生不同 expected 时返回 409 TRADE_PLAN_CHANGED，不悄悄改数量
再开仓；价格快照失效时返回 TRADE_DATA_UNAVAILABLE，用户刷新预览后重新选择。
即使 expected 数值没变，核心资料缺失、明确双向模式或费用读取失败也不能写入。
未知上下限／模式按既定警告策略处理，expected 不允许绕过精度及容差校验。

### 执行响应

任何交易写请求之前的失败沿用 `{error:{code,message}}`：参数非法为 400
INVALID_TRADE_REQUEST，能力不支持为 422 NOT_SUPPORTED，核心规则
缺失／报价失效／ATR 不可用为 503 TRADE_DATA_UNAVAILABLE，无可行组合为 422
NO_FEASIBLE_ORDER，计划变化为 409 TRADE_PLAN_CHANGED。实际资料读取错误保留
后端明确 code，例如 FEE_CREDENTIALS_NOT_CONFIGURED、PUBLIC_TIME_EXPIRED；
上游包络无法识别时才用 TRADE_DATA_UNAVAILABLE。上述失败均保证没有交易写操作。

一旦发出入场写请求，能够正常返回时统一 HTTP 200 携带完整执行结果，即使
拒单、保护失败或未知也如此；HTTP 200 不等于三腿成功。结果字段固定为：

- request_id、identity：本轮关联号和完整 exchange_name／market／is_live／symbol。
- submitted_plan：实际用于保护的 amount／contract_size／risk_currency／entry_price／
  stop_price／take_profit_price／estimated_risk，以及 opening_fee／opening_fee_source／
  estimated_stop_fee／estimated_take_profit_fee／estimated_take_profit_net。费用和数值
  都是十进制字符串；其中 contract_size 来自后端 contract_size_decimal，不能读取
  同名的后端旧 number 字段。opening_fee_source 为 estimated 或 reported；不能生成计划时
  整个字段为 null。触发价格和风险不代表最终成交及损益。
- legs：entry、stop_loss、take_profit 三个 LegResult，全部存在。
- verification：checked_at、positions 和 issues；读取失败时 positions=null，成功
  确认空仓才是 []。position 只包含 side、contracts、entry_price，不包含其他私有信息。
- warnings：`{code,message}` 数组，用于部分成交、含费风险偏差和残留保护单等。

LegResult 必含 `write_state、confirmation、client_order_id、order_id、filled、average、
error`；未知订单 ID、成交量、均价和不存在的错误分别为 null，不以零伪装未知。
error 仅含脱敏 code／message。保护价格和数量与 submitted_plan 核实不一致时，
confirmation 保持 unconfirmed 并说明差异，不把“有订单 ID”直接当保护正确。

以下是执行层离线样本的完整形状：入场成功、止损已挂、止盈明确拒绝；并非
当前真实账户执行记录，也不能用于绕过前述实际规则缺口：

```json
{
  "request_id": "11111111-1111-4111-8111-111111111111",
  "identity": {"exchange_name": "binance", "market": "future", "is_live": false, "symbol": "BTC/USDT:USDT"},
  "submitted_plan": {
    "amount": "0.0045", "contract_size": "1", "risk_currency": "USDT",
    "entry_price": "10000", "stop_price": "9800", "take_profit_price": "10200", "estimated_risk": "0.9891",
    "opening_fee": "0.045", "opening_fee_source": "estimated", "estimated_stop_fee": "0.0441",
    "estimated_take_profit_fee": "0.0459", "estimated_take_profit_net": "0.8091"
  },
  "legs": {
    "entry": {
      "write_state": "accepted", "confirmation": "filled", "client_order_id": "lw11111111111141118111111111111111e",
      "order_id": "entry-1", "filled": "0.0045", "average": "10000", "error": null
    },
    "stop_loss": {
      "write_state": "accepted", "confirmation": "open", "client_order_id": "lw11111111111141118111111111111111s",
      "order_id": "stop-1", "filled": "0", "average": null, "error": null
    },
    "take_profit": {
      "write_state": "rejected", "confirmation": "unconfirmed", "client_order_id": "lw11111111111141118111111111111111t",
      "order_id": null, "filled": null, "average": null, "error": {"code": "ORDER_REJECTED", "message": "止盈单被交易所拒绝"}
    }
  },
  "verification": {"checked_at": 1792230003000, "positions": [{"side": "long", "contracts": "0.0045", "entry_price": "10000"}], "issues": []},
  "warnings": []
}
```

界面必须据此分别显示“入场已成交／止损已挂／止盈失败”，不能显示整笔交易失败
并引导重新入场；用户继续处理不会触发任何自动补偿。

### 用户显式只读核实

POST `/api/ccxt/manual-order/check` 同样带 Origin／Content-Type，请求如下：

```json
{
  "request_id": "11111111-1111-4111-8111-111111111111",
  "exchange_name": "binance", "market": "future", "is_live": false, "symbol": "BTC/USDT:USDT",
  "orders": {"entry": "entry-1", "stop_loss": "stop-1", "take_profit": null}
}
```

orders 必须包含三键，值为已知 ID 或 null；客户端 ID 仍由 request_id 确定。执行
一轮有界读取，预算同为最多 60 秒／每请求最多 8 秒，不发送任何交易 POST。
返回 `{request_id, identity, observations, verification}`；observations 含三腿的
`confirmation、order_id、client_order_id、filled、average、error`，不包含 write_state。
前端合并读取事实并保留原始写回执；没有订单 ID 且无法匹配时仍为 unconfirmed。
原执行错误不被空查询结果擦除，新增读取错误进入 verification.issues。后续查询
只确认订单当前事实，不重算 ATR 或原保护计划；首次执行按 submitted_plan 逐项
核对，后续展示的价格／风险标为提交时计划，不宣称手动修改后仍与原计划一致。
只读检查不能创建 submitted_plan 或继续旧流程。重复点击查询仍只查询。

## 验证边界

主 spec 的正式离线入口须覆盖以上真实请求形状；用固定时钟及明确交易所回包
测试成功和反向失败。特别验证：本地校验失败时写调用数为零，每腿写调用数
至多一，两个保护请求独立收集，读取失败不丢写入事实，check 永远没有写请求。
同时验证聚合三次读取的身份一致性、费率来源与符号、模式证据不足、schema 中
允许的 null、未知金额参考价、后端 detail 包络及校验数组的错误适配。真实规则
样本保留 unknown，验证警告后的成功与交易所拒单，不加工成已通过全部预检。
还须覆盖关闭面板／HTTP 断开／服务退出的边界，区分“一轮仍会尝试完成”与
“重启后保证恢复”；后者明确不属于本任务。
