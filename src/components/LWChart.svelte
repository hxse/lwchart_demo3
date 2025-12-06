<script lang="ts">
    import { onMount, onDestroy, untrack } from "svelte";
    import {
        createChart,
        CandlestickSeries,
        ColorType,
        type IChartApi,
        type ISeriesApi,
    } from "lightweight-charts";

    // Props
    interface Props {
        data: Array<{
            time: number | string;
            open: number;
            high: number;
            low: number;
            close: number;
            volume?: number;
        }>;
    }

    let { data }: Props = $props();

    // State
    let chartContainer = $state<HTMLDivElement>();
    let chart: IChartApi | null = null;
    let candlestickSeries: ISeriesApi<"Candlestick"> | null = null;

    // 生命周期：挂载图表
    onMount(() => {
        if (!chartContainer) return;

        // 创建图表
        chart = createChart(chartContainer, {
            layout: {
                textColor: "black",
                background: { type: ColorType.Solid, color: "white" },
            },
            width: chartContainer.clientWidth,
            height: 500,
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
            },
        });

        // 添加蜡烛图系列
        candlestickSeries = chart.addSeries(CandlestickSeries, {
            upColor: "#26a69a",
            downColor: "#ef5350",
            borderVisible: false,
            wickUpColor: "#26a69a",
            wickDownColor: "#ef5350",
        });

        // 数据更新由 $effect 处理

        // 响应窗口调整大小
        const handleResize = () => {
            if (chart && chartContainer) {
                chart.applyOptions({
                    width: chartContainer.clientWidth,
                });
            }
        };

        window.addEventListener("resize", handleResize);

        // 清理函数
        return () => {
            window.removeEventListener("resize", handleResize);
        };
    });

    // 更新图表数据
    function updateChartData() {
        if (!candlestickSeries || !data || data.length === 0) return;

        const startTime = performance.now();
        console.log(`📈 开始设置图表数据，数据量: ${data.length} 条`);

        // 设置数据（添加类型断言以避免 TypeScript 错误）
        candlestickSeries.setData(data as any);

        // 自适应内容
        if (chart) {
            chart.timeScale().fitContent();
        }

        const endTime = performance.now();
        console.log(
            `✅ 图表数据设置完成，耗时: ${(endTime - startTime).toFixed(2)}ms`,
        );
    }

    // 监听数据变化
    $effect(() => {
        const currentData = data;
        const dataLen = currentData?.length || 0;

        if (dataLen === 0) {
            console.log("⏭️ 跳过更新：无数据");
            return;
        }

        console.log("🔄 $effect 触发，数据长度:", dataLen);

        // 方案1：使用 Svelte 5 的 untrack（推荐）
        // untrack 明确告诉 Svelte：不要追踪这段代码的响应式依赖
        untrack(() => {
            updateChartData();
        });

        /* 方案2：使用 queueMicrotask（当前方案，也可以）
        queueMicrotask(() => {
            updateChartData();
        });
        */

        /* 方案3：直接调用（慢，不推荐）
        updateChartData(); // ❌ 慢，有响应式追踪开销
        */
    });

    // 组件销毁时清理图表
    onDestroy(() => {
        if (chart) {
            chart.remove();
            chart = null;
        }
    });
</script>

<div class="chart-wrapper">
    <div bind:this={chartContainer} class="chart-container"></div>
</div>

<style>
    .chart-wrapper {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
    }

    .chart-container {
        flex: 1;
        min-height: 500px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
</style>
