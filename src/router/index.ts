import UniversalRouter from 'universal-router';

// 定义页面组件类型 - 使用更通用的类型
type PageComponent = any;
type RouteResult = string | PageComponent;

// 路由配置
const routes = [
    {
        path: '/',
        action: (): RouteResult => 'home' // 返回主页标识
    },
    {
        path: '/page1',
        action: async (): Promise<RouteResult> => {
            // 动态导入页面1组件，实现按需加载
            const module = await import('../pages/Page1.svelte');
            return module.default as unknown as PageComponent;
        }
    },
    {
        path: '/page2',
        action: async (): Promise<RouteResult> => {
            // 动态导入页面2组件，实现按需加载
            const module = await import('../pages/Page2.svelte');
            return module.default as unknown as PageComponent;
        }
    },
    {
        path: '/page3',
        action: async (): Promise<RouteResult> => {
            // 动态导入页面3组件，实现按需加载
            const module = await import('../pages/page3/Page3.svelte');
            return module.default as unknown as PageComponent;
        }
    },
    {
        path: '/settings',
        action: async (): Promise<RouteResult> => {
            const module = await import('../pages/Settings.svelte');
            return module.default as unknown as PageComponent;
        }
    },
    {
        path: '/*',
        action: (): RouteResult => 'not-found' // 404页面
    }
];

// 创建路由实例
export const router = new UniversalRouter(routes);

// 导出路由解析函数
export async function resolveRoute(path: string): Promise<RouteResult> {
    try {
        const result = await router.resolve({ pathname: path });
        // 确保返回值不为 null 或 undefined
        return result || 'not-found';
    } catch (error) {
        console.error('路由解析错误:', error);
        return 'not-found';
    }
}

// 导出类型定义
export type { PageComponent, RouteResult };
