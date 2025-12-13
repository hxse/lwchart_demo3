# Dashboard Override 配置覆盖使用指南

本文档详细说明如何使用 `DashboardOverride` 机制在不修改 ZIP 文件内部配置的情况下，动态覆盖图表配置。

> **重要说明**: 覆盖配置的处理逻辑在 **JavaScript 前端**实现。Python 后端只需要生成并提供覆盖配置对象，无需实现任何覆盖逻辑。前端会自动将覆盖配置应用到从 ZIP 读取的原始配置上。

---

## 📋 概述

`DashboardOverride` 允许在以下场景中覆盖 `chartConfig.json` 的配置：

1. **Notebook 模式**: 通过 Props 传递覆盖配置
2. **浏览器模式**: 通过 URL 参数传递覆盖配置

> **为什么需要覆盖机制？**
> ZIP 文件是只读的，无法直接修改内部的 `chartConfig.json`。覆盖机制允许在不重新生成 ZIP 的情况下，快速调整显示配置。

---

## 📝 可覆盖的配置项

### DashboardOverride 接口

```typescript
interface DashboardOverride {
    // 布局模板
    template?: string;
    
    // 是否显示底部回测栏
    showBottomRow?: boolean;
    
    // 视图模式
    viewMode?: "chart" | "table";
    
    // 默认选中的内部文件
    selectedInternalFileName?: string;
    
    // 浏览器模式：自动加载的ZIP文件名
    selectedZipFileName?: string;
    
    // 指标显隐控制（三维坐标格式）
    show?: string[];
}
```

---

## 1️⃣ Notebook 模式使用方法

### 概述

在 Jupyter Notebook 中，通过 Python 对象传递覆盖配置。具体的调用方式取决于您的后端实现，以下提供通用示例。

### 基础概念

覆盖配置通常作为**配置对象**传递给图表显示方法，该对象包含 `DashboardOverride` 的字段。

```python
# 通用结构
override_config = {
    "template": "grid-2x2",           # 更改布局
    "viewMode": "chart",              # 视图模式
    "showBottomRow": False,           # 控制底部栏
    "show": [                          # 控制指标显示
        "0,0,0,1",  # Slot 0, Pane 0, Series 0 显示
        "0,0,1,0",  # Slot 0, Pane 0, Series 1 隐藏
    ]
}
```

### 使用方式

根据您的后端实现，可能采用以下方式之一：

#### 方式 A: 直接传递配置对象

```python
# 假设您有一个显示图表的函数
display_chart(
    zip_data=zip_bytes,
    config=override_config
)
```

#### 方式 B: 通过配置容器传递

```python
# 使用配置容器类
display_config = DisplayConfig(
    override=override_config,
    width="100%",
    aspect_ratio="16/9"
)

# 调用显示方法
chart_runner.display_dashboard(config=display_config)
```

#### 方式 C: 链式调用

```python
# 链式调用风格
(BacktestRunner()
    .setup(...)
    .run()
    .format_results_for_export(
        export_index=0,
        chart_config=chart_config
    )
    .display_dashboard(
        config=DisplayConfig(override=override_config)
    ))
```

> **提示**: 具体的调用方式取决于您的后端API设计，请查阅您的后端文档。

---

### show 参数详解

`show` 参数使用**三维坐标**精确定位要控制的指标：

**格式**: `"slotIdx,paneIdx,seriesIdx,show"`

| 位置 | 名称 | 说明 | 示例值 |
|------|------|------|--------|
| 0 | slotIdx | Grid Slot 索引（时间周期） | 0, 1, 2 |
| 1 | paneIdx | Pane 索引（主图/副图） | 0, 1, 2 |
| 2 | seriesIdx | Series 索引（指标序号） | 0, 1, 2 |
| 3 | show | 显示状态 | 1=显示, 0=隐藏 |

#### 示例：理解三维坐标

假设您的配置文件结构如下：

```
Grid Slot 0 (15分钟周期)
  ├─ Pane 0 (主图)
  │   ├─ Series 0: Candle      → 坐标: 0,0,0
  │   ├─ Series 1: Volume       → 坐标: 0,0,1
  │   └─ Series 2: SMA          → 坐标: 0,0,2
  └─ Pane 1 (RSI副图)
      └─ Series 0: RSI Line     → 坐标: 0,1,0

Grid Slot 1 (1小时周期)
  └─ Pane 0 (主图)
      ├─ Series 0: Candle       → 坐标: 1,0,0
      └─ Series 1: EMA          → 坐标: 1,0,1
```

**需求**: 隐藏15m的Volume，显示RSI，隐藏1h的EMA

```python
override_config = {
    "show": [
        "0,0,1,0",  # 隐藏 15m主图的Volume (Slot0-Pane0-Series1)
        "0,1,0,1",  # 显示 15m的RSI副图 (Slot0-Pane1-Series0)
        "1,0,1,0",  # 隐藏 1h主图的EMA (Slot1-Pane0-Series1)
    ]
}
```

---

### 完整示例：实际场景

#### 场景1：简化图表显示（演示用）

**目标**: 只显示基础K线和成交量，隐藏所有技术指标

```python
# 配置：只显示核心数据
override_config = {
    "template": "single",        # 使用单图布局
    "viewMode": "chart",         # 图表模式
    "showBottomRow": False,      # 不显示底部回测结果
    "show": [
        # 只显示第一个时间周期的前两个指标
        "0,0,0,1",  # Candle - 显示
        "0,0,1,1",  # Volume - 显示
        # 其他指标隐藏
        "0,0,2,0",  # 技术指标1 - 隐藏
        "0,0,3,0",  # 技术指标2 - 隐藏
        "0,0,4,0",  # 技术指标3 - 隐藏
    ]
}

# 使用配置
display_chart(zip_data=your_zip_data, config=override_config)
```

#### 场景2：对比不同时间周期

**目标**: 同时显示3个时间周期（15m, 1h, 4h），每个只显示主图

```python
override_config = {
    "template": "vertical-1x1x1",  # 垂直3图布局
    "show": [
        # 15m周期：只显示主图
        "0,0,0,1",  # Candle 显示
        "0,0,1,1",  # Volume 显示
        # 隐藏15m的副图
        "0,1,0,0",  
        "0,2,0,0",
        
        # 1h周期：只显示主图
        "1,0,0,1",  # Candle 显示
        "1,0,1,1",  # Volume 显示
        # 隐藏1h的副图
        "1,1,0,0",
        
        # 4h周期：只显示主图
        "2,0,0,1",  # Candle 显示
        "2,0,1,1",  # Volume 显示
    ]
}
```

#### 场景3：突出特定指标

**目标**: 只显示RSI指标（隐藏主图，只看副图）

```python
override_config = {
    "template": "vertical-1x2",
    "show": [
        # 隐藏主图的所有内容
        "0,0,0,0",  # Candle 隐藏
        "0,0,1,0",  # Volume 隐藏
        "0,0,2,0",  # 其他指标隐藏
        
        # 只显示RSI副图
        "0,1,0,1",  # RSI 显示
    ]
}
```

---

## 2️⃣ 浏览器模式使用方法

### URL 参数格式

在浏览器中访问图表时，通过 URL 参数传递覆盖配置。

```
http://localhost:5173/chart-dashboard?参数名=参数值&参数名=参数值
```

### 支持的URL参数

| 参数名 | 类型 | 说明 | 示例 |
|--------|------|------|------|
| `template` | string | 布局模板 | `template=grid-2x2` |
| `viewMode` | string | 视图模式 | `viewMode=chart` |
| `showBottomRow` | boolean | 显示底部回测栏 | `showBottomRow=0` 或 `showBottomRow=true` |
| `selectedInternalFileName` | string | 选中的内部文件 | `selectedInternalFileName=data.csv` |
| `selectedZipFileName` | string | 自动加载的ZIP文件 | `selectedZipFileName=result.zip` |
| `show` | string | 指标显示控制 | `show=0,0,0,1` |

### 基础用法

#### 1. 更改布局模板

```
http://localhost:5173/chart-dashboard?template=grid-2x2
```

#### 2. 切换到表格模式

```
http://localhost:5173/chart-dashboard?viewMode=table
```

#### 3. 隐藏底部回测栏

```
http://localhost:5173/chart-dashboard?showBottomRow=0
```

或者

```
http://localhost:5173/chart-dashboard?showBottomRow=false
```

#### 4. 自动加载ZIP文件

```
http://localhost:5173/chart-dashboard?selectedZipFileName=backtest_2024.zip
```

#### 5. 控制指标显示（单个）

```
http://localhost:5173/chart-dashboard?show=0,0,1,0
```

隐藏 Slot 0, Pane 0, Series 1

### show 参数详解

`show` 参数格式：`slotIdx,paneIdx,seriesIdx,show`

- **支持多次出现**: 可以多次使用 `&show=...` 控制多个指标
- **完整格式**: 必须提供4个参数
- **show 值**: `1` = 显示, `0` = 隐藏

#### 示例1：隐藏多个指标

```
http://localhost:5173/chart-dashboard?show=0,0,1,0&show=0,0,2,0&show=0,0,3,0
```

- 隐藏 Slot 0, Pane 0, Series 1
- 隐藏 Slot 0, Pane 0, Series 2
- 隐藏 Slot 0, Pane 0, Series 3

#### 示例2：只显示主图和RSI

```
http://localhost:5173/chart-dashboard
  ?show=0,0,0,1    # 15m Candle 显示
  &show=0,0,1,1    # 15m Volume 显示
  &show=0,0,2,0    # Bollinger Upper 隐藏
  &show=0,0,3,0    # Bollinger Middle 隐藏
  &show=0,0,4,0    # Bollinger Lower 隐藏
  &show=0,1,0,1    # RSI 显示
```

### 组合使用

同时使用多个参数：

```
http://localhost:5173/chart-dashboard
  ?selectedZipFileName=result.zip
  &template=vertical-1x3
  &viewMode=chart
  &selectedInternalFileName=data_dict/source_ohlcv_15m.parquet
  &show=0,0,2,0
  &show=0,0,3,0
  &show=0,0,4,0
```

这个URL将：
1. 自动加载 `result.zip`
2. 使用 `vertical-1x3` 布局
3. 显示图表模式
4. 默认选中 `source_ohlcv_15m.parquet`
5. 隐藏3个布林带指标

---

## 🎯 实用场景

### 场景1：快速对比不同布局

**Notebook**:
```python
# 2x2网格布局
ChartDashboard(zip_data, config={"template": "grid-2x2"})

# 垂直3图布局
ChartDashboard(zip_data, config={"template": "vertical-1x1x1"})
```

**浏览器**:
```
# 2x2网格
?template=grid-2x2

# 垂直3图
?template=vertical-1x1x1
```

### 场景2：演示时隐藏辅助指标

只显示主要指标（Candle + Volume），隐藏所有辅助线：

**Notebook**:
```python
display_config = {
    "show": [
        "0,0,0,1",  # Candle 显示
        "0,0,1,1",  # Volume 显示
        "0,0,2,0",  # 其他指标隐藏
        "0,0,3,0",
        "0,0,4,0",
    ]
}
```

**浏览器**:
```
?show=0,0,0,1&show=0,0,1,1&show=0,0,2,0&show=0,0,3,0&show=0,0,4,0
```

### 场景3：分别查看不同时间周期

**只显示15m时间周期**:

```python
# 隐藏1h和4h的所有指标
"show": [
    "1,0,0,0",  # 1h Candle 隐藏
    "1,0,1,0",  # 1h Volume 隐藏
    "2,0,0,0",  # 4h Candle 隐藏
    "2,0,1,0",  # 4h Volume 隐藏
]
```

---

## 📚 布局模板选项

| 模板名 | 说明 | Grid Slots |
|--------|------|------------|
| `single` | 单图 | 1 |
| `vertical-1x1` | 垂直2图 | 2 |
| `horizontal-1x1` | 水平2图 | 2 |
| `vertical-1x2` | 垂直1大2小 | 3 |
| `horizontal-1x2` | 水平1大2小 | 3 |
| `grid-2x2` | 2x2网格 | 4 |
| `vertical-1x1x1` | 垂直3图 | 3 |
| `horizontal-1x1x1` | 水平3图 | 3 |

---

## ⚠️ 注意事项

### 1. 索引从0开始

所有索引（slotIdx, paneIdx, seriesIdx）都从 `0` 开始计数。

### 2. 索引越界不报错

如果指定的坐标不存在（如 `9,9,9,1`），系统会静默忽略，不会报错。

### 3. show 参数不覆盖配置文件

`show` 参数只是**临时覆盖**，不会修改 ZIP 内的原始配置文件。刷新页面或重新加载后，如果没有 URL 参数，将恢复原始配置。

### 4. Notebook 模式的持久性

在 Notebook 中，覆盖配置只在当前单元格执行时生效。如果重新运行单元格但不传递 `config` 参数，将使用 ZIP 内的默认配置。

### 5. URL 长度限制

浏览器URL有长度限制（通常2000-8000字符）。如果需要控制大量指标，建议：
- 在 Notebook 中使用 Props 方式
- 或在后端重新生成配置文件

---

## 🔧 调试技巧

### 查看当前配置

打开浏览器开发者工具（F12），在 Console 中查看当前应用的配置：

```javascript
// 查看完整配置（在浏览器Console中）
console.log(JSON.stringify(config, null, 2));
```

### 验证坐标是否正确

如果某个 `show` 参数没有生效，检查：

1. **坐标是否存在**: 确认配置文件中确实有该 Slot/Pane/Series
2. **格式是否正确**: 必须是4个数字，逗号分隔
3. **索引是否正确**: 索引从0开始，不是从1开始

### 快速生成show参数

**Python脚本**（帮助生成show参数）:

```python
def generate_show_params(config):
    """生成所有可能的show参数坐标"""
    coords = []
    for slot_idx, slot in enumerate(config['chart']):
        for pane_idx, pane in enumerate(slot):
            for series_idx, series in enumerate(pane):
                show_val = 1 if series.get('show', True) else 0
                coords.append(f"{slot_idx},{pane_idx},{series_idx},{show_val}")
    return coords

# 使用
show_params = generate_show_params(config)
print("&show=".join([""] + show_params))
```

---

## 📖 相关文档

- [配置文件结构说明](./chart_config_structure.md) - 了解三维数组配置架构
- [图表系列选项参考](./chart_series_options.md) - 查看各图表类型的选项字段
