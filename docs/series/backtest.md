# 回测专用系列参考 (v3.1)

> [!IMPORTANT]
> 以下系列由系统检测到 `backtest_result` 数据后 **自动注入**，无需在 `chartConfig.json` 中手动定义。

## 1. PositionArrow (仓位标记)

由 `backtest_result.parquet` 自动生成。

### 核心数据源字段
- `first_entry_side`: **至关重要**。1=多, -1=空。解决了单 Bar 内多次交易的判断问题。
- `entry_long_price` / `exit_long_price` 等。

### 智能文字定位规则
文字位置会根据信号价格相对于该 K 线 **High/Low 范围** 动态调整：
- 价格 < Low: 下方。
- 价格 > High: 上方。
- 价格在 [Low, High] 之间: 离谁近放哪边。

## 2. SlTpLine (止损止盈连线)

### 改进说明
- **状态无关性**: 基于 `first_entry_side` 判断，不再依赖前后 K 线状态。
- **单 Bar 交易支持**: 完美支持单根 K 线内的进场和离场连线。

---

[返回首页](../README.md)
