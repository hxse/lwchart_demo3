# 离线样本

`data.ts` 中的行情为确定性虚拟数据，不含账户或真实凭据。

`alltypes_plain.parquet` 来自 Apache 官方的
[parquet-testing](https://github.com/apache/parquet-testing/blob/master/data/alltypes_plain.parquet)，
用于验证原 ZIP／Parquet 读取链路。上游采用
[Apache License 2.0](https://github.com/apache/parquet-testing/blob/master/LICENSE)。
样本固定纳入仓库；运行测试不下载文件。

## 指标固定期望与原生重放

indicator-golden.json 保存十一候选指标的固定极小样本。版本、定义来源和人工核对
口径在文件中声明；期望是静态常量，不由被测适配或运行中的库自动生成。

indicator-reference.ts 直接构造 trading-signals 8.3.0 原生类，独立选择输入字段并
按根 isStable／getResultOrThrow 读取输出，不调用生产工厂或实现指标公式。
固定 seed 模拟数据用于严格全量／增量对齐，不能替代固定期望的可靠性证据。

indicator-reliability.test.ts 保留 ADX 零波幅污染的最小复现；该诊断断言真实 NaN
和后续不恢复，属于通过的反向测试，不是被跳过的失败。ADX 暂不支持 market
计算，legacy 可继续显示外部预计算值。CCI 合法 NaN 保留为未定义，不补零。

默认 just test 仅使用本地数据及已安装依赖，不执行 Python 或访问外部行情。
