import type { ISeriesApi, MouseEventParams } from "lightweight-charts";

export interface LegendItemConfig {
    name: string;
    color: string;
    showInLegend: boolean;
}

export class LegendManager {
    private legendElement: HTMLElement | null = null;
    private seriesMap = new Map<ISeriesApi<any>, LegendItemConfig>();

    /**
     * 创建 Legend DOM 元素
     * @param container 图表容器，用于挂载 Legend
     */
    public create(container: HTMLElement): void {
        if (this.legendElement) return;

        this.legendElement = document.createElement("div");
        this.legendElement.className = "chart-legend";

        // 样式设置
        Object.assign(this.legendElement.style, {
            position: "absolute",
            left: "6px",
            top: "6px",
            zIndex: "10",
            fontSize: "11px",
            fontFamily: "'Inter', 'Segoe UI', 'Consolas', monospace",
            lineHeight: "14px",
            color: "#444",
            background: "rgba(255, 255, 255, 0.3)",
            padding: "4px 6px",
            borderRadius: "3px",
            border: "1px solid rgba(0,0,0,0.08)",
            pointerEvents: "none",
            display: "none", // 初始隐藏
            flexDirection: "column",
            gap: "1px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            backdropFilter: "blur(8px)"
        });

        container.style.position = "relative";
        container.appendChild(this.legendElement);
    }

    /**
     * 注册要显示的系列
     * @param series 价格系列 API
     * @param config 系列配置 (名称, 颜色, 显隐控制)
     */
    public registerSeries(series: ISeriesApi<any>, config: LegendItemConfig): void {
        this.seriesMap.set(series, config);
    }

    /**
     * 更新 Legend 显示内容
     * @param param 十字线移动事件参数
     */
    public update(param: MouseEventParams): void {
        if (!this.legendElement) return;

        // 如果不是用户发起的交互（例如程序调用的同步），隐藏 Legend
        if (!param.sourceEvent) {
            this.legendElement.style.display = "none";
            return;
        }

        // 如果没有时间戳（鼠标离开）或点不在图表内，隐藏 Legend
        if (!param.time || !param.point || param.point.x < 0 || param.point.y < 0) {
            this.legendElement.style.display = "none";
            return;
        }

        let html = "";
        let hasContent = false;

        this.seriesMap.forEach((config, series) => {
            if (!config.showInLegend) return;

            const data = param.seriesData.get(series);
            if (!data) return;

            hasContent = true;

            // 处理不同类型的数据显示
            let valueStr = "";
            const labelStyle = 'color: #888; margin-right: 2px;';
            const valStyle = () => `color: #222; font-weight: 500; margin-right: 6px;`;

            if ("open" in data && "high" in data && "low" in data && "close" in data) {
                // OHLC 数据 (Candle/Bar) - 采用更精简的标签
                valueStr = `<span style="${labelStyle}">O</span><span style="${valStyle()}">${data.open.toFixed(2)}</span>` +
                    `<span style="${labelStyle}">H</span><span style="${valStyle()}">${data.high.toFixed(2)}</span>` +
                    `<span style="${labelStyle}">L</span><span style="${valStyle()}">${data.low.toFixed(2)}</span>` +
                    `<span style="${labelStyle}">C</span><span style="${valStyle()}">${data.close.toFixed(2)}</span>`;
            } else if ("value" in data) {
                // 单值数据 (Line/Area/Histogram)
                valueStr = `<span style="${labelStyle}">${config.name}</span><span style="${valStyle()}">${data.value.toFixed(2)}</span>`;
            }

            if (valueStr) {
                html += `<div class="legend-item" style="display:flex; align-items:center; gap:4px;">${valueStr}</div>`;
            }
        });

        if (hasContent) {
            this.legendElement.innerHTML = html;
            this.legendElement.style.display = "flex";
        } else {
            this.legendElement.style.display = "none";
        }
    }

    /**
     * 销毁 Legend
     */
    public destroy(): void {
        if (this.legendElement && this.legendElement.parentNode) {
            this.legendElement.parentNode.removeChild(this.legendElement);
        }
        this.legendElement = null;
        this.seriesMap.clear();
    }
}
