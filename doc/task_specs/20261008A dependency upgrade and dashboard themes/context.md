# 依赖升级与看盘主题

## 使用场景与设计初衷

用户用 `just crypto` 查看加密货币多周期实时行情，希望默认暗色并能在设置中切换。
现有共享图表和新页面采用白色背景；Lightweight Charts 已发布 5.2.1，旧 Vite 别名
与 Svelte 插件组合还会提示实验支持。升级必须先保持旧 Notebook／ZIP 场景可用。

## 方案对比

本仓库由 Bun 管理 package.json 与 bun.lock，没有 Python 项目依赖。uv 不能管理
这些库；使用已有 Bun 的依赖升级功能，不增加另一套包管理链。

TypeScript 7 的编译器与旧 JS API 分离。Svelte 官方要求同时安装 7 的原生编译器
与 6 的 API；采用 Microsoft 的正式 typescript6 兼容包别名，svelte-check 使用
`--tsgo`，普通 tsc 也使用 7，不建立检查失败后降级的回退链路。

Lightweight Charts 用 layout、grid、crosshair 和坐标轴颜色实现主题，可通过
`applyOptions` 更新现有图表。页面菜单和 DOM 图例另用 CSS 变量配色。
重新创建图表会丢失用户当前查看的位置；复用控制器的颜色更新接口可以保持数据、
系列与视口，也能使旧场景继续使用原浅色样式。

## 取舍结论

先升级全部直接依赖到实施时的最新稳定版本，正式 Vite 替代旧别名，完成兼容验证。
随后在新场景建立一份深浅配色表，通过共享接口更新现有图表并驱动页面 CSS 变量。
主题是与其他设置一致的 URL／TOML 字段；不增加独立存储、主题框架或第二套图表。
