# 路由模块

这个文件夹包含了应用的路由相关代码，使用 Universal Router 和 Svelte 5 实现。

## 文件结构

- `index.ts` - 路由配置和 Universal Router 实例
- `utils.ts` - 路由工具函数，包括导航和路由加载逻辑
- `README.md` - 本文件，说明路由模块的使用方法

## 使用方法

### 在组件中使用路由

```typescript
import { navigate, initRouter, isSpecialRoute } from "./router/utils.js";
import { resolveRoute } from "./router/index.js";
```

### 主要函数

- `navigate(path: string)` - 导航到指定路径
- `resolveRoute(path: string)` - 解析指定路径的路由结果（在 index.ts 中定义）
- `initRouter()` - 初始化路由系统，监听浏览器前进/后退事件
- `isSpecialRoute(result)` - 检查路由结果是否为特殊路由（如 'home', 'not-found'）

### 路由配置

路由配置在 `index.ts` 中定义：

```typescript
const routes = [
    {
        path: '/',
        action: (): RouteResult => 'home'
    },
    {
        path: '/page1',
        action: async (): Promise<RouteResult> => {
            const module = await import('../pages/Page1.svelte');
            return module.default as unknown as PageComponent;
        }
    },
    // ... 其他路由
];
```

## 特性

- 动态组件加载 - 按需加载页面组件
- 浏览器历史记录支持 - 支持前进/后退按钮
- 类型安全 - 使用 TypeScript 提供完整的类型支持
- 响应式设计 - 与 Svelte 5 的响应式系统集成

## 注意事项

- 路由组件需要放在 `src/pages/` 目录下
- 路由路径以 `/` 开头
- 使用 `svelte:component` 动态渲染组件
- 路由状态管理在 App.svelte 中进行
