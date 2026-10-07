# lwchart_demo3

Svelte 与 Lightweight Charts 图表项目，提供两个独立场景，共享绘图、网格和光标同步。

```bash
just crypto   # 实时多周期加密货币看盘，默认 http://127.0.0.1:5174/
just legacy   # 构建 Notebook 图表库，复制到 ~/dev/pyo3-quant/data/lwchart
```

实时看盘从 config.toml 读取后端鉴权配置，格式见 config.example.toml。
默认四图为 30m／4h／日线／周线，显示 EMA14／50／100，每 5 秒增量更新。

[看盘使用指南](doc/guides/crypto_dashboard.md) ·
[当前命令规范](doc/current_specs/commands.md) ·
[旧 ZIP／Notebook 配置文档](docs/README.md)

```bash
just check
just test
just crypto --build
```

测试使用本地模拟后端和已安装的 Chromium，不请求真实交易所。
