# 离线样本

`data.ts` 中的行情为确定性虚拟数据，不含账户或真实凭据。

`alltypes_plain.parquet` 来自 Apache 官方的
[parquet-testing](https://github.com/apache/parquet-testing/blob/master/data/alltypes_plain.parquet)，
用于验证原 ZIP／Parquet 读取链路。上游采用
[Apache License 2.0](https://github.com/apache/parquet-testing/blob/master/LICENSE)。
样本固定纳入仓库；运行测试不下载文件。
