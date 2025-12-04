import { resolveRoute } from './index.js';
import type { PageComponent, RouteResult } from './index.js';

// 导航到指定路径
export function navigate(path: string): void {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
}

// 初始化路由
export function initRouter(onPathChange?: (path: string) => void): () => void {
    // 监听浏览器前进/后退
    const handlePopState = () => {
        const currentPath = window.location.pathname;
        if (onPathChange) {
            onPathChange(currentPath);
        }
    };

    window.addEventListener('popstate', handlePopState);

    // 返回清理函数
    return () => {
        window.removeEventListener('popstate', handlePopState);
    };
}

// 检查是否为特殊路由
export function isSpecialRoute(result: RouteResult): boolean {
    return typeof result === 'string';
}

// 获取路由类型
export function getRouteType(result: RouteResult): string {
    if (typeof result === 'string') {
        return result;
    }
    return 'component';
}
