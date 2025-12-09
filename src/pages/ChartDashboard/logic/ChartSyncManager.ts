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

    clear() {
        this.chartApis.clear();
    }
}
