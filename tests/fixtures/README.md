# 离线样本

`data.ts` 中的行情为确定性虚拟数据，不含账户或真实凭据。

`alltypes_plain.parquet` 来自 Apache 官方的
[parquet-testing](https://github.com/apache/parquet-testing/blob/master/data/alltypes_plain.parquet)，
用于验证原 ZIP／Parquet 读取链路。上游采用
[Apache License 2.0](https://github.com/apache/parquet-testing/blob/master/LICENSE)。
样本固定纳入仓库；运行测试不下载文件。

## EMA 独立基准

ema-reference.json 是生成的纯数据文件，不受手写文件行数上限约束。
其期望值由 [pandas-ta-classic 固定提交](https://github.com/xgboosted/pandas-ta-classic/blob/ba647e0d87bba422deb68e61715d3fc9f68dd399/pandas_ta_classic/overlap/ema.py)
的 EMA 生成，参数为 talib=false、sma=true、adjust=false、offset=0。
源码提交、生成依赖版本、参数和浮点容差同时保存在 JSON 的 reference 中。

每个输入对为 `[模拟 K 线序号,close]`，测试将序号转换为固定 UTC 时间。
expected 按 period 保存 `[序号,EMA值]`；预热期间无值的点不保存。
小样本覆盖初始化前修正、跨越预热门槛、多根修正、追加、重复覆盖、裁剪及重载。
另一个样本包含 104 根初始数据，使 EMA14／50／100 均有有效值。

生成器保留同起点完整历史，仅截取最终展示窗口的参考结果；reload 重置参考历史。
测试分别比较增量实现、全量实现和固定基准，容差为
`1e-12 + 1e-12 × abs(参考值)`，时间列表和点数必须完全一致。

## 显式再生

仅需要更新参考输入或核对来源时手工执行。需要 uv、已有 Python 3.13 和网络，
临时工具依赖放在 /tmp，不加入本项目 package.json、锁文件或服务运行环境：

```bash
UV_CACHE_DIR=/tmp/lwchart-ema-reference-cache uv run --no-project --no-python-downloads --python 3.13 \
  --with 'pandas-ta-classic @ git+https://github.com/xgboosted/pandas-ta-classic.git@ba647e0d87bba422deb68e61715d3fc9f68dd399' \
  --with 'pandas==3.0.6' --with 'numpy==2.5.3' \
  tests/fixtures/generate_ema_reference.py
```

生成器验证已安装来源的 Git 提交并改写同目录 ema-reference.json。
再生后审阅输入和结果差异，并运行正式离线验证。
默认 `just test` 只读取 JSON，不执行生成器，不需要 Python 或网络。
