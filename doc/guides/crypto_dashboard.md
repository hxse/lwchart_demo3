# 实时多周期看盘

## 启动

使用宿主 Bun 和 Just。首次安装项目依赖：

```bash
bun install --frozen-lockfile
```

没有私有配置时，将根目录 config.example.toml 复制为 config.toml，再填写
backend.username／password。账号对应 ccxt-proxy2 的 `[users.<username>]`，
是后端登录账号；默认后端为 `http://127.0.0.1:5123`。
已有 config.toml 的 `[dashboard]` 需包含 `theme = "dark"`；配置修改后重启看盘服务。

```bash
just crypto
```

打开 `http://127.0.0.1:5174/`。默认显示左上 30m、右上 4h、左下日线、右下周线，
EMA14／50／100 为橙／绿／蓝，每 5 秒更新。鼠标光标跨周期联动；拖动查看历史
不会被更新拉回末尾。首次打开会自动补全完整 URL 参数。
默认深色，右上角设置里的“主题”可切换“深色”“浅色”，切换保留当前缩放和位置。
右上角齿轮展开设置，有效修改会自动同步 URL 并预览图表；文字输入合并 250 毫秒，
避免每个按键都请求历史。应用提交，取消／关闭／Esc 恢复打开前的配置和 URL。
浏览器前进／后退也会同步打开中的设置菜单。

如果提示 5174 被占用，先停止本项目现有看盘进程，再启动：

```bash
just crypto --stop
just crypto
```

自定义配置使用 `just crypto --stop --config=配置路径`。该命令只停止本仓库对应配置
的看盘 dev／serve 进程，没有运行实例时可重复执行。

后端须启用所选交易所、市场和环境，并允许账号读取行情。默认身份为 Binance
future 实盘行情，品种 `BTC/USDT:USDT`。未启用或未就绪会在对应图内提示，
调整设置前先核对后端用户权限、身份白名单和服务状态。

## 用 URL 直接打开

```text
http://127.0.0.1:5174/?symbol=ETH%2FUSDT%3AUSDT
http://127.0.0.1:5174/?timeframes=15m,1h,1d,1w&indicators=ema,5;ema,14;ema,50
http://127.0.0.1:5174/?layout=1x2&timeframes=30m,4h&indicators=none
http://127.0.0.1:5174/?market=spot&symbol=BTC%2FUSDT&timeframes=1h
http://127.0.0.1:5174/?history_bars=500
http://127.0.0.1:5174/?theme=light
```

layout 为行×列，支持 1x1、1x2、2x1、1x3、3x1、2x2；周期列表按槽顺序填写。
仅写周期列表会按数量选择布局；显式写布局时数量必须一致。
指标写 `ema,周期`，多个用分号连接；`none` 不画指标，`ema14` 不接受。
URL 与菜单还可设置 exchange_name、market、is_live、refresh_seconds、history_bars。
主题参数 theme 仅支持 dark／light；配置中的同名字段决定没有 URL 覆盖时的默认主题。
完整规则见 [看盘规范](../current_specs/crypto_dashboard.md)。

## 历史与断网

每周期默认最多请求并保留 1500 根，设置里的“历史 K 线数量”与 URL 的 history_bars
可以修改，范围为 1..10000。改变数量会按新值重新取历史，取消恢复之前的数量。
较新交易对和周线可能没有这么长的历史，显示实际
返回数量。EMA 历史不足时显示预热，达到对应根数后才画线。
断网时保留已有图；恢复后从实际末根时间戳重叠请求 10 根，必要时连续补页。
显示“正在补齐”期间下一轮会继续，未将错误或空响应当成最新行情。

四个身份的初始请求同时发出，每图返回后立即展示。首次历史的等待取决于
后端／交易所；浏览器开发者工具的 Network 响应头 Server-Timing 可区分 upstream
与 local 时间。upstream 包含鉴权、后端读取和正文解析；local 是代理校验与序列化。
修改本地服务代码后重启 `just crypto` 才能加载新的代理逻辑。

新看盘价格轴上下边距均为 3%，按当前可见 K 线的 high／low 缩放，EMA 不扩大范围。

## 构建与旧场景

```bash
just crypto --build
just crypto --serve
just legacy
```

前两条生成并运行独立看盘产物；构建不需要有效后端凭据，运行需要。
旧入口仍构建 Notebook 图表库，并复制到 `~/dev/pyo3-quant/data/lwchart`。
旧浏览器演示仍可使用原 `bun run dev`；两个场景的入口和状态独立。

## 验证

```bash
just check
just test
```

测试只用本地模拟后端。事先安装 Chromium，或用 PLAYWRIGHT_CHROMIUM_EXECUTABLE
指定现有浏览器；测试命令不自动下载。截图输出到 test-results。
当前看盘入口提供行情与 EMA，订单、账户挂单及持仓展示由后续任务承接。
