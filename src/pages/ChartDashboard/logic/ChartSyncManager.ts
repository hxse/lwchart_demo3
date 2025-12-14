export class ChartSyncManager {
    private chartApis = new Map<string, any>();

    register(id: string, api: any) {
        // console.log(`[Sync] Registering chart ${id}`);
        this.chartApis.set(id, api);
    }

    sync(sourceId: string, param: any) {
        // Broadcast to all other charts
        for (const [id, api] of this.chartApis) {
            if (id !== sourceId) {
                api.setCrosshair(param);
            }
        }
    }

    // 时间跳转：点击底栏时，所有主图表跳转到该时间
    jumpToTime(time: number, excludeId?: string) {
        // 步骤1：清除所有主图表的光标，避免跳转时闪烁
        for (const [id, api] of this.chartApis) {
            if (excludeId && id === excludeId) continue;
            if (!id.includes('bottom')) {
                api.clearCrosshair?.();
            }
        }

        // 步骤2：跳转所有主图表
        for (const [id, api] of this.chartApis) {
            if (excludeId && id === excludeId) continue;
            if (!id.includes('bottom')) {
                api.scrollToTime?.(time);
            }
        }

        // 步骤3：延迟同步光标，确保setVisibleLogicalRange完成后再设置光标
        setTimeout(() => {
            this.sync('jumpToTime-trigger', { time });
        }, 50);
    }

    // 所有图表显示全部数据
    fitContentAll() {
        for (const [id, api] of this.chartApis) {
            api.fitContent?.();
        }
    }

    // 主图表重置时间轴（显示最新，等于双击x轴）
    resetTimeScaleAll() {
        for (const [id, api] of this.chartApis) {
            if (!id.includes('bottom')) {
                // 主图表：重置时间轴
                api.resetTimeScale?.();
            } else {
                // 底栏：显示全部数据
                api.fitContent?.();
            }
        }
    }

    clear() {
        this.chartApis.clear();
    }
}
