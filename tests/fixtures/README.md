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

indicator-reference.ts 直接构造登记 ADX 零波幅补丁的 trading-signals 8.3.0 原生类，独立选择输入字段并
按根 isStable／getResultOrThrow 读取输出，不调用生产工厂或实现指标公式。
固定 seed 模拟数据用于严格全量／增量对齐，不能替代固定期望的可靠性证据。

indicator-reliability.test.ts 使用原 ADX 零波幅问题的同一输入，验证修复后的有效零
与固定恢复值；补丁只处理 DX 全零边界，其他非有限 ADX 仍明确计算失败。
indicator-alignment.test.ts 覆盖周期 2／14 的平盘、波动、反复末根替换和裁剪。
adx-install.test.ts 从生产白名单复制登记补丁和锁文件，在新目录离线冻结安装后
执行正式文件校验并验证原生结果与缺补丁拒绝，不能只依赖工作区手工修改。
indicator-dependency.test.ts 使用临时副本验证文件身份、版本、缺补丁和命令阻断；
反向还原补丁只操作临时文件，不改工作区依赖或共享缓存。CCI 未定义仍保留，不补零。

默认 just test 仅使用本地数据及已安装依赖，不执行 Python 或访问外部行情。
