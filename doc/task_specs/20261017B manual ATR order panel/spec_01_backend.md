# 后端实际路由与对接边界

## 契约来源与身份

本文件按 ccxt-proxy2 已发布的 [OpenAPI](http://127.0.0.1:5123/openapi.json)
与 [Swagger UI](http://127.0.0.1:5123/docs) 定义后端消费契约。相关 schema 为
MarketInfoResponse、TradingFeeResponse、TickerResponse、MarketOrderRequest、
StopMarketOrderRequest、TakeProfitMarketOrderRequest、OrderStructure、
PositionStructure 和 TradeStructure。行为边界同时对应后端仓库的
`doc/current_specs/ccxt_market_info.md`、`doc/current_specs/ccxt_client.md` 与路由实现。
lwchart 自己的 API 只在执行扩展定义，不能混同为 ccxt-proxy2 路由。

后端使用 Bearer 鉴权。单品种读取必填 `exchange_name、market、is_live、symbol`；
`is_live` 显式为 true／false，请求不传 mode，响应中的 mode 则为 live／sandbox。
GET 参数拒绝额外字段；交易 POST 的身份放 JSON 正文，不混入 query。
账户、白名单和凭据由后端配置管理，lwchart 只访问所配置的后端地址，不接受
浏览器提交任意 URL、token 或 Provider extras。

## 已有路由与使用范围

| 后端入口 | 实际响应及本任务用途 |
| --- | --- |
| GET `/ccxt/fetch_market_info` | 直接返回 MarketInfoResponse；市场身份、单位与静态规则，不含手续费或账户模式 |
| GET `/ccxt/fetch_trading_fee` | 直接返回 TradingFeeResponse；当前合约账户 maker／taker 费率 |
| GET `/ccxt/fetch_ticker` | `{ticker: TickerInfo}`；单品种报价，无报价缓存 |
| GET `/ccxt/fetch_ohlcv/latest-limit` | `{rows, last_bar_completion_confirmed}`；复用现有 K 线消费和 ATR |
| POST `/ccxt/create_market_order` | `{order: OrderStructure}`；单笔市价入场 |
| POST `/ccxt/create_stop_market_order` | 同上；triggerPrice 止损市价触发单，reduceOnly 默认 true |
| POST `/ccxt/create_take_profit_market_order` | 同上；triggerPrice 止盈市价触发单，reduceOnly 默认 true |
| GET `/ccxt/fetch_order` | `{order}`；id 必填，symbol 可选，本任务总是带 symbol |
| GET `/ccxt/fetch_my_trades` | `{trades: TradeStructure[]}`；本次订单的成交证据 |
| GET `/ccxt/fetch_positions` | `{positions: PositionStructure[]}`；模式证据、手动持仓查询及执行后持仓展示 |
| GET `/ccxt/fetch_open_orders` | `{orders: OrderStructure[]}`；当前挂单 |
| GET `/ccxt/fetch_closed_orders` | `{orders: OrderStructure[]}`；历史关闭／撤销订单 |

持仓查询用重复的 `symbols` query 字段传列表，不传 symbol 或逗号拼接字符串。
订单列表与成交列表可传 symbol、since、limit；since 为 13 位 UTC 毫秒，limit 为
1..100000。本任务一轮有限查询，不用遍历全部账户历史来保证找回订单。

后端已有 fetch_balance、create_limit_order、cancel_order 等路由，本任务不调用
它们做资金预检、限价入场或自动补偿。后端没有原子入场加双保护路由；三个已有
写接口由 lwchart 顺序编排。ATR 不需要后端增加接口。

## 市场资料与精确规则

### MarketInfoResponse

以下字段均为 schema 必填；允许 null 的字段仍须保留，不能把 null 解释为 false／0。

| 实际字段 | 对接要求 |
| --- | --- |
| symbol、base、quote、settle | symbol 为 canonical 身份；币种可为 null。本模式要求明确 base，且 settle=quote |
| swap、linear、inverse、active | 均为 boolean 或 null；本模式要求 true、true、false、true |
| amount_unit | contracts／base；本模式只用 contracts，可以是小数张 |
| contract_size_decimal | 精确乘数字符串或 null；本模式要求有限正值 |
| contract_size_currency | 乘数单位币种或 null；本模式要求等于 base |
| price_rules | PriceGrid，包含 step_size／minimum／maximum／grid_origin |
| quantity_rules | QuantityRule 数组，包含来源、订单类型、只减仓适用性及数量网格／上下界 |
| notional_rules | NotionalRule 数组，包含来源、订单类型、只减仓适用性、金额上下界、币种和参考价 |
| contract_size、precision_amount、min_amount、leverage | 兼容旧消费者的 number／null 字段；精确计算不用这些字段 |

fetch_market_info 读取 SDK 已加载市场快照，不触发市场刷新或手续费查询。
它仍可能为 leverage 查询持仓；该读取失败会令整个接口失败。lwchart 不使用
leverage 作保证金预检，也不能因为不用 leverage 而把整个失败响应当成功。

后端不存在 `position_mode、supported_order_types、rules_complete、price_rule、
amount_rules、fees` 字段。模式证据见下文；订单能力来自实际路由与市场范围，
不能根据 quantity_rules.order_types 断言当前账户必然支持对应写操作。

### 四态标量与逐腿匹配

所有精确规则标量使用 RuleValue，字段名和状态如下：

| status | value | 含义 |
| --- | --- | --- |
| known | 有限十进制字符串 | 明确数值；0 只代表真实零值 |
| unknown | null | 来源未确认；不能当作无限、豁免或零 |
| not_applicable | null | 该约束不适用或已关闭 |
| unbounded | null | 明确无该上界或下界 |

price_rules 和每条数量规则的网格都是 `origin + k × step`，origin 读取
grid_origin，不能固定为 0。known 步长须为正，起点及界限非负，已知 min≤max，
价格及数量始终为正。unbounded 只用于上下界；not_applicable 不参与对应约束。失去本模式所需
固定价格／数量网格时提示无法计算，不能自行制造小数精度。

每条 quantity_rules 有 source、order_types、applies_to_reduce_only 及四个标量。
每条 notional_rules 有前三项及 minimum、maximum、currency、price_reference。
入场按 market、非只减仓匹配；保护按 stop_market／take_profit_market、只减仓匹配：

1. order_types 不匹配的规则不参与该腿。
2. 普通入场检查全部匹配规则，applies_to_reduce_only 不影响它。
3. 保护单中 true 表示适用，false 表示豁免，null 表示适用性未确认。
4. 所有已知适用规则取交集。价格／数量步长和有效起点缺失时禁止计算；未知
   上下限只提示，不伪造为无界。保护规则适用性 null 时保留警告，并保守满足
   该条已知数量网格／上下限，不把未知适用性解释成豁免。

Binance 的 LOT_SIZE 与 MARKET_LOT_SIZE 独立返回，后者 order_types 仅含 market。
保护单只检查返回资料中明确匹配的提交规则，不凭名称把入场市价限制套到保护单，
也不宣称这些规则保证触发后完全成交。Kraken 使用 SDK 精度和限额，缺失仍是 unknown。

名义金额须使用规则自己的 currency 和 price_reference；本模式只处理 quote。
`order_price` 是委托价格，`mark_price` 是标记价，`unknown` 不能推测。
Binance 普通市价最低金额用标记价，不用参考入场 E、last 或保护触发价替代。
本任务没有把未收盘 mark K 线 close 或持仓可选 markPrice 当作即时标记价的契约。
适用金额门槛存在而缺正确参考价时，显示未完成名义金额预检的警告，由交易所
最终接受或拒绝；不使用近似价伪装通过。明确豁免的规则不要求该参考价。

### 实际响应形状示例

以下为实际 schema 的 Kraken 规则形状，数值只用于解释字段，不代表账户查询结果。
其中 unknown 是明确的不可确认状态；本任务保留这些未知限制并显示警告。

```http
GET /ccxt/fetch_market_info?exchange_name=kraken&market=future&is_live=true&symbol=BTC%2FUSD%3AUSD
Authorization: Bearer <server-token>
```

```json
{
  "symbol": "BTC/USD:USD", "base": "BTC", "quote": "USD", "settle": "USD",
  "swap": true, "linear": true, "inverse": false, "active": true,
  "amount_unit": "contracts", "contract_size_currency": "BTC", "contract_size_decimal": "1",
  "contract_size": 1, "precision_amount": 0.001, "min_amount": null, "leverage": null,
  "price_rules": {
    "step_size": {"status": "known", "value": "0.1"},
    "minimum": {"status": "unknown", "value": null},
    "maximum": {"status": "unknown", "value": null},
    "grid_origin": {"status": "known", "value": "0"}
  },
  "quantity_rules": [{
    "source": "ccxt", "order_types": ["limit", "market", "stop_market", "take_profit_market"],
    "applies_to_reduce_only": null,
    "step_size": {"status": "known", "value": "0.001"},
    "minimum": {"status": "unknown", "value": null},
    "maximum": {"status": "unknown", "value": null},
    "grid_origin": {"status": "known", "value": "0"}
  }],
  "notional_rules": [{
    "source": "ccxt", "order_types": ["limit", "market", "stop_market", "take_profit_market"],
    "applies_to_reduce_only": null, "currency": "USD", "price_reference": "unknown",
    "minimum": {"status": "unknown", "value": null},
    "maximum": {"status": "unknown", "value": null}
  }]
}
```

## 账户费率与环境限制

费用独立读取 GET `/ccxt/fetch_trading_fee`，不能从 fetch_market_info 或市场公共
maker／taker 推导。四个必填 query 字段与市场资料相同，直接返回以下形状：

```http
GET /ccxt/fetch_trading_fee?exchange_name=binance&market=future&is_live=false&symbol=BTC%2FUSDT%3AUSDT
Authorization: Bearer <server-token>
```

```json
{
  "exchange_name": "binance", "market": "future", "mode": "sandbox", "symbol": "BTC/USDT:USDT",
  "maker": "0.0002", "taker": "0.0004", "rate_unit": "fraction",
  "source": "binance_commission_rate", "updated_at": 1792234800000
}
```

示例数值不代表实际费率。maker／taker 均为十进制比例字符串，0.0004=0.04%；
零表示零费用，负值表示返佣。不得再次除以 100 或把负值直接判为坏数据。
rate_unit 为 fraction（schema 默认值）；身份必须与请求一致，updated_at 是后端
可信时钟产生的读取时间，不能用 lwchart 的 observed_at 覆盖。

| 账户范围 | 实际支持及依赖 |
| --- | --- |
| Binance future live／sandbox | 当前账户 commissionRate；source=binance_commission_rate |
| Kraken future live | 当前账户 TradeVolume；source=kraken_trade_volume；需后端配置 kraken.fee_lookup |
| Kraken future sandbox | 422 NOT_SUPPORTED，无已核实的费率来源；本模式禁用交易 |
| 两家的 spot | 422 NOT_SUPPORTED；首版不做现货 |

Kraken 后端需要属于当前 live 交易账户、具备 Funds Query 权限的独立 Spot key；
不是 Futures key，也不启用现货交易。缺配置为 503 FEE_CREDENTIALS_NOT_CONFIGURED。
凭据只放后端 `[kraken.fee_lookup]`，不进入 lwchart 配置或浏览器。

费率接口没有 currency、percentage 或实际扣费金额。lwchart 对 settle=quote 的
线性合约用 `quote 名义金额 × 比例` 估算报价币费用，明确标为估计；不能声称
后端保证实际扣费币种。实际 fee.cost／fee.currency 的使用见回执段落。
读取失败、身份不符或数值非法时禁用含费计算，不使用默认档位、另一环境或零费率。

## 账户模式、ticker 与时间

后端没有独立查询／切换持仓模式的路由，也没有 market_info.position_mode。
已有 GET `/ccxt/fetch_positions?...&symbols=BTC%2FUSDT%3AUSDT` 中
PositionStructure.hedged 可为 true／false／null。匹配记录全部明确 false 时有单向
证据；存在 true 时按已知双向模式禁用。null／空列表／读取失败保留模式未知的
警告，允许用户提交单向模式写法。Binance 三腿固定传 positionSide=BOTH，使
不兼容的账户模式由交易所拒绝，不猜 LONG／SHORT 或自动修改账户。
模式读取不比较账户余额、保证金或剩余可开数量，也不发起模式切换。
手动持仓查询还读取同一响应的 side、contracts、entryPrice：前者为可空 long／short，
后两者为可空 number；只归一当前 symbol 的记录，不透出私有 info。缺少数量须保留
未知，不能因找到记录就猜数量，也不能以空值认定空仓；不查询或切换账户配置。

ticker 的 symbol 必须匹配；last／bid／ask 是 number 或 null／缺失，timestamp
是可空毫秒时间。原始 info 和任意 extras 不透传浏览器。Binance 缺盘口不额外
补查询；方向选择和有效 last 回退由计算扩展规定。

TickerInfo 没有必备的 markPrice 字段；不能根据 additionalProperties=true 推断
它存在。PositionStructure 的可空 markPrice 也不保证空仓时存在及行情时效。
lwchart 收到有效 ticker 后增加 observed_at（本地服务 UTC 毫秒），Provider
timestamp 单独保留，不冒充盘口观测时间。新鲜回包不等于最新一笔成交刚发生。

## 单笔写接口与精度边界

三个写接口均返回 `{order: OrderStructure}`，网络失败不自动重试。下面是符合
实际请求字段的写法，价格和数量仅用于说明形状，不能不经当前规则校验直接发送。
市价单 POST `/ccxt/create_market_order`：

```json
{
  "exchange_name": "binance", "market": "future", "is_live": false,
  "symbol": "BTC/USDT:USDT", "side": "buy", "amount": "0.0045",
  "clientOrderId": "lw11111111111141118111111111111111e"
}
```

止损单 POST `/ccxt/create_stop_market_order`：

```json
{
  "exchange_name": "binance", "market": "future", "is_live": false,
  "symbol": "BTC/USDT:USDT", "side": "sell", "amount": "0.0045",
  "triggerPrice": "9800", "reduceOnly": true, "workingType": "CONTRACT_PRICE",
  "clientOrderId": "lw11111111111141118111111111111111s"
}
```

止盈单 POST `/ccxt/create_take_profit_market_order`：

```json
{
  "exchange_name": "binance", "market": "future", "is_live": false,
  "symbol": "BTC/USDT:USDT", "side": "sell", "amount": "0.0045",
  "triggerPrice": "10200", "reduceOnly": true, "workingType": "CONTRACT_PRICE",
  "clientOrderId": "lw11111111111141118111111111111111t"
}
```

Kraken 使用 `triggerSignal="last"`，不发 workingType；这些是后端允许的 Provider
扩展参数，由 lwchart 适配层固定生成。后端将正式 triggerPrice 分别转换为
stopLossPrice／takeProfitPrice；不接受嵌套 stopLoss／takeProfit 括号订单写法。
保护显式传 reduceOnly=true，不依赖默认值；做空改为 sell 入场、buy 保护。
Binance 在上例三个 body 中另固定加入 positionSide="BOTH"；Kraken 不发送此字段。
Kraken Derivatives 的 cliOrdId 是最多 100 字符的全局唯一字符串，本任务的 35 字符
关联号符合该格式；不能套用现货 cl_ord_id 的限制。见[官方下单参数](https://docs.kraken.com/api-reference/order-management/send-order)。

amount／triggerPrice 在 OpenAPI 中是正 number；实际请求模型也接受可解析的
数字字符串，但随后转成 Python float。精确规则字符串不等于交易写接口端到端
任意精度。本任务发送十进制字符串，并在发送前确认有限 number 往返仍等于计划
数值、网格不变；不满足则禁止该计划。触发价格后端只校验、不自动移格；数量
仍经过 SDK 格式化，不能用未对齐数量依赖截断，结果按真实 filled／amount 核对。

## 回执、只读核实与错误

OrderStructure 必填 id、symbol、status，其中 status 可为 null，id／symbol 为 string；
side、amount、filled、remaining、average、triggerPrice、reduceOnly、clientOrderId
等可空。没有有效回执的写请求不因响应模型校验失败就变成“订单没提交”。
HTTP 200 也不代表成交；状态转换及每腿结果只在执行扩展定义。

TradeStructure 的 order 可空；只有明确关联本次订单、品种及方向的成交能参与
数量／均价核实。按 trade.id 去重，已知 filled 时成交总数量须吻合才可补出均价，
避免把有限列表的部分成交当作全量。不能仅凭一页成交列表确认最终 filled；
持仓 entryPrice 不是本次成交均价。
fee 是可空对象，不保证 cost／currency 齐全；只在有限费用和明确 quote 币种、
完整对应本次成交时替换开仓估计，不重复叠加 order.fee 与逐笔 trade.fee。
非 quote 扣费或不完整费用继续估计并标记，不在 lwchart 另查汇率猜换算。

Binance 的普通／条件单查询差异由后端处理；fetch_open_orders／fetch_closed_orders
合并两类订单。fetch_order 只接受 Provider id，没有按 clientOrderId 查询的 query。
无 id 时一轮 open／closed 列表可按该腿 clientOrderId 匹配；查不到仍未知。
Kraken 查询窗口及回执字段有局限，成交记录可补均价，但不保证总能恢复所有事实。
不存在的订单、未出现在 open 列表、无法关联的成交都不授权重发或自动补保护。

后端业务错误的实际包络是 `{detail:{code,message,...}}`；基本参数校验可能为
FastAPI 的 detail 数组，401 也不能强行解析成相同业务对象。lwchart 适配为自身
错误包络，只保留必要 code／脱敏说明，不透传签名、凭据或私有 info。

| HTTP／code | 本任务处理 |
| --- | --- |
| 422 NOT_SUPPORTED／INVALID_PROVIDER_REQUEST／ORDER_REJECTED | 明确能力、参数或订单拒绝；不发保护、不重试 |
| 409 INSUFFICIENT_FUNDS／PROVIDER_OPERATION_REJECTED | 展示资金或操作拒绝，不在之前增加余额检查 |
| 422 INVALID_ORDER_PRICE／INVALID_PRICE_PRECISION／PRICE_OUT_OF_RANGE | 价格校验拒绝，保留可用的安全说明 |
| 503 PRICE_RULES_UNAVAILABLE | 后端价格预检失败、尚未提交；不能误标成已经成交 |
| 502 OPERATION_STATUS_UNKNOWN | 写入结果未知，只读核实，不重新提交 |
| 404 ORDER_NOT_FOUND | 此次查询无该订单证据，不代表从未成交 |
| 502 PROVIDER_AUTH_FAILED／INVALID_PROVIDER_DATA | 私有读取失败时阻止入场；写后无法证明未提交时保留未知 |
| 503 SERVICE_NOT_ENABLED／SERVICE_NOT_READY／FEE_CREDENTIALS_NOT_CONFIGURED／PUBLIC_TIME_NOT_READY／PUBLIC_TIME_EXPIRED | 身份、费率配置或可信时钟不可用；不切环境、不猜费率 |

## 未知事实与准入边界

单笔行情、账户费率、市价入场、两张保护单和结果读取均已有路由。以下事实只做
提示，由交易所最终接受或拒绝，不保证完整预检或下单成功：

- Binance 当前 notional_rules 的普通市价门槛依赖 mark_price，maximum 为 unknown；
  条件单规则还会返回 source=unavailable、适用性 null 和未知限额。只减仓对普通
  MIN_NOTIONAL 的豁免不能扩展成条件单全部规则已获豁免。
- Kraken 数量规则的只减仓适用性为 null，名义金额参考价为 unknown，未公开上下界
  继续 unknown；不能靠“这是手动下单”自动把它们改成无约束。
- 模式只能读取可空的 hedged 证据，空仓或缺字段时不能承诺确认单向模式。
- Kraken sandbox 没有可用账户费率；live 缺 fee_lookup 配置时也不能做含费预览。
  费用属于核心资料，此项仍然阻断，不能用实盘或默认费率兜底。

必须取得有效报价、ATR、市场身份、乘数、价格／数量步长与账户费率，并满足
已知数量／价格限制和两项风险容差。上述未知上下限、名义金额依据和模式证据
不伪造为确定值，以警告随预览及执行结果返回。已确认双向模式、非支持市场、
非法规则或核心资料读取失败仍禁止提交。模式读取失败不影响已成功的市场／费率
资料，但 fetch_market_info 自身失败仍意味着缺少核心资料，不能吞掉。
