# lwchart_demo3

Svelte 与 Lightweight Charts 图表项目，提供两个独立场景，共享绘图、网格和光标同步。

```bash
just crypto   # CCXT／TQ 实时多周期看盘，默认 http://127.0.0.1:5174/
just legacy   # 构建 Notebook 图表库，复制到 ~/dev/pyo3-quant/data/lwchart
```

实时看盘从 config.toml 读取后端鉴权配置，格式见 config.example.toml。
默认四图为 30m／4h／日线／周线，显示 EMA14／50／100，初始最新 1000 根，每 5 秒请求最新 5 根。
默认深色和本地显示时区，右上角设置点击应用后生效；URL 同样可指定来源、品种和显示设置。
TQ 默认螺纹主连，直接访问 ?source=tq。图例显示时间、OHLC 和成交量，数据时间始终为 UTC。

[看盘使用指南](doc/guides/crypto_dashboard.md) ·
[当前命令规范](doc/current_specs/commands.md) ·
[旧 ZIP／Notebook 配置文档](docs/README.md)

```bash
just check
just test
just crypto --build
```

测试使用本地模拟后端和已安装的 Chromium，不请求真实交易所。
