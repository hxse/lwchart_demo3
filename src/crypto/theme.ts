import { ColorType, type ChartOptions, type DeepPartial } from 'lightweight-charts';
import type { Theme } from './options';

// 画布和 DOM 共用配色；旧场景不导入新看盘主题。
const palettes = {
    dark: {
        background: '#131722', text: '#d1d4dc', secondary: '#9aa4b5', muted: '#8b95a7',
        grid: '#242833', border: '#363c4e', divider: '#2a2e39',
        surface: 'rgba(28,32,43,.98)', overlay: 'rgba(19,23,34,.88)',
        status: 'rgba(28,32,43,.96)', toggle: 'rgba(36,41,54,.72)',
        errorBackground: '#352026', error: '#ff8d86', accent: '#4c82da',
        shadow: 'rgba(0,0,0,.35)', crosshair: '#8792a7', crosshairLabel: '#465269',
    },
    light: {
        background: '#ffffff', text: '#253247', secondary: '#536076', muted: '#7f8ba0',
        grid: '#f0f2f5', border: '#dbe2ec', divider: '#dce2ea',
        surface: 'rgba(255,255,255,.98)', overlay: 'rgba(255,255,255,.87)',
        status: 'rgba(247,249,252,.94)', toggle: 'rgba(255,255,255,.64)',
        errorBackground: '#fff3f0', error: '#bc4535', accent: '#346bc1',
        shadow: 'rgba(28,41,67,.13)', crosshair: '#8792a7', crosshairLabel: '#536076',
    },
} as const;

export function chartTheme(theme: Theme): DeepPartial<ChartOptions> {
    const p = palettes[theme];
    return {
        layout: { background: { type: ColorType.Solid, color: p.background }, textColor: p.secondary },
        grid: { vertLines: { color: p.grid }, horzLines: { color: p.grid } },
        timeScale: { borderColor: p.border },
        leftPriceScale: { borderColor: p.border }, rightPriceScale: { borderColor: p.border },
        crosshair: {
            vertLine: { color: p.crosshair, labelBackgroundColor: p.crosshairLabel },
            horzLine: { color: p.crosshair, labelBackgroundColor: p.crosshairLabel },
        },
    };
}

export function themeStyles(theme: Theme): string {
    const p = palettes[theme];
    const variables = {
        'chart-background': p.background, 'dashboard-divider': p.divider,
        'text-color': p.text, 'secondary-text': p.secondary, 'muted-text': p.muted,
        'surface-background': p.surface, 'field-background': p.background, 'ui-border': p.border,
        'chart-overlay': p.overlay, 'status-background': p.status, 'toggle-background': p.toggle,
        'error-background': p.errorBackground, 'error-text': p.error, 'accent': p.accent, 'ui-shadow': p.shadow,
        'chart-legend-bg': p.overlay, 'chart-legend-value': p.text, 'chart-legend-label': p.muted,
        'chart-legend-border': p.border, 'chart-legend-shadow': p.shadow,
    };
    return `color-scheme:${theme};` + Object.entries(variables).map(([key, color]) => `--${key}:${color};`).join('');
}
