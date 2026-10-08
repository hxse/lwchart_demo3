# 实时多周期看盘

## 启动

使用宿主 Bun 和 Just，先安装锁定的依赖：

```bash
bun install --frozen-lockfile
```

没有配置时复制 config.example.toml 为 config.toml，填写 backend.username／password。
这是 ccxt-proxy2 后端登录账号，默认后端 http://127.0.0.1:5123。

新版配置中 [dashboard] 维护显示设置，[ccxt] 和 [tq] 维护各来源默认品种。
TQ 默认 KQ.m@SHFE.rb；[tq] 不填写天勤账号，仍用 backend 的鉴权。
旧配置需将 dashboard 的交易所／市场／环境／品种移到 [ccxt]，增加 source、timezone
和 [tq]，删除 incremental_bars／max_catchup_pages；按最新模板核对，保留原凭据。

配置修改后重启：

```bash
just crypto --stop
just crypto
```

打开 http://127.0.0.1:5174/。默认 Binance BTC/USDT:USDT、深色四图：
左上 30m、右上 4h、左下日线、右下周线；EMA14／50／100 为橙／绿／蓝。
每 5 秒更新，鼠标时间跨周期联动；看历史时不会被更新拉回末尾。

右上角齿轮展开设置。修改先留在草稿，**点击“应用”才更新图表与地址**；
取消、关闭或 Esc 丢弃修改。原行情在编辑期间继续更新。
浏览器前进／后退会同步图表和打开中的设置，首次打开自动补全完整参数。

5174 被占用时用上述 stop 停止本项目对应实例；自定义配置用
`just crypto --stop --config=配置路径`，不会按端口停止其它程序。

## 数据源与 URL

在设置的“数据源”选 CCXT 或 TQ。TQ 默认螺纹主连，可填写其它完整品种名，
例如 SHFE.rb2701；选择 TQ 后不显示 CCXT 的交易所、市场和环境选项。
后端需启用对应服务，并授予当前账号行情权限。

```text
http://127.0.0.1:5174/?symbol=ETH%2FUSDT%3AUSDT
http://127.0.0.1:5174/?source=tq
http://127.0.0.1:5174/?source=tq&symbol=KQ.m%40SHFE.rb&timeframes=30m,4h,1d,1w
http://127.0.0.1:5174/?layout=1x2&timeframes=30m,4h&indicators=none
http://127.0.0.1:5174/?history_bars=500&theme=light&timezone=Asia%2FShanghai
```

layout 为行×列，支持 1x1、1x2、2x1、1x3、3x1、2x2。仅写周期列表按数量推断布局；
显式写布局时数量必须一致。指标用 ema,周期，多个用分号连接；none 表示不画指标。
TQ URL 不写 exchange_name、market、is_live，它们仅适用于 CCXT。
完整参数规则见 [看盘规范](../current_specs/crypto_dashboard.md)。

## 时间与更新

左上角图例显示鼠标对应 K 线的开盘时间、OHLC、成交量 V 和 EMA。
显示时区默认 local，跟随浏览器；也可填 UTC、Asia/Shanghai、America/New_York 等。
图例、横轴和光标时间使用同一时区。原始数据始终是 UTC 时间戳，显示时区不会
改变行情、指标计算或光标匹配；切换时区不重新取行情。

初始每周期请求最新 1000 根，历史数量可在设置或 URL 修改，范围 1..10000。
历史不足显示实际返回数量，EMA 不足预热不伪造线段。
每轮请求最新 5 根，有重叠时间就覆盖并追加；接不上则重新请求完整最新窗口。
完整重载成功后丢弃旧历史；网络错误先保留旧画面，下轮继续，不在一轮里反复请求。
期货午休、周末、节假日不靠固定周期长度判成数据缺失。

保留数量是滚动上限，超过后裁掉最早的 K 线。EMA 用 SMA 初始化，裁剪时保留
累计计算状态；完整重载或新增 EMA 周期时从所加载的历史重新初始化。

前端同时发起不同周期的请求，每图返回后立即显示。后端／交易所等待可能不同，
TQ 后端也有两路窗口限制，因此并发不等于同时显示。
较大的周线数量可能被后端拒绝，前端如实显示错误，不偷偷减少数量或换起点路由。
Network 响应头 Server-Timing 的 upstream 和 local 可以区分后端等待与本地处理耗时。

图表上下边距为 3%，按可见蜡烛的 high／low 缩放，EMA 不扩大范围。

## 构建、旧入口与验证

```bash
just crypto --build
just crypto --serve
just legacy
just check
just test
```

新看盘构建不需要真实凭据，运行需要。旧入口继续构建 Notebook 库，并复制到
~/dev/pyo3-quant/data/lwchart；原浏览器演示仍用 bun run dev。

测试使用本地模拟 CCXT／TQ 和已安装 Chromium，不请求真实交易所、不下单。
可用 PLAYWRIGHT_CHROMIUM_EXECUTABLE 指定现有浏览器，测试不自动下载。
截图输出到 test-results。
