import ChartDashboard from './pages/ChartDashboard/ChartDashboard.svelte';
import { mount, type Component } from 'svelte';
import type { DashboardProps } from './pages/ChartDashboard/chartDashboard.types';

export type { DashboardProps, DashboardOverride, ChartConfigJSON, SeriesItemConfig } from './pages/ChartDashboard/chartDashboard.types';
export type { IndicatorSpec, IndicatorAnnotation, IndicatorOutput } from './indicators/types';
export type { ChartApi, ChartConfig, SeriesConfig, SeriesDataPatch, SeriesMode } from './utils/chartTypes';

// 与组件的 $props 共用类型；原生声明编译器无需推导 Svelte 文件内部实现。
const Dashboard: Component<DashboardProps> = ChartDashboard;

// Notebook 等非 Svelte 环境继续通过原入口挂载。
export function mountDashboard(target: HTMLElement, props: DashboardProps) {
    return mount(Dashboard, {
        target,
        props
    });
}

export default Dashboard;
