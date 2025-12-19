<script lang="ts">
  import { onMount, untrack } from "svelte";
  import type { SeriesConfig } from "../../utils/chartTypes";
  import { ChartController } from "./logic/ChartController";

  // Props
  interface Props {
    series: SeriesConfig[]; // Configuration for all series in this chart
    template?: string; // Optional identifier for template logic if needed
    fitContent?: boolean; // New prop: Auto-fit content
    fitContentOnDblClick?: boolean; // New prop: Auto-fit on double click
    chartOptions?: Record<string, any>; // New prop: Custom chart options (e.g. handleScale)
    onCrosshairMove?: (param: any) => void; // New prop: Sync callback
    onRegister?: (api: {
      setCrosshair: (param: any) => void;
      clearCrosshair: () => void;
      scrollToTime: (time: number) => void;
      resetTimeScale: () => void;
      fitContent: () => void;
    }) => void; // Sync registration
    onClick?: (param: any) => void; // New prop: Click callback
    enableLegend?: boolean; // 是否启用 Legend 展示
  }

  let {
    series,
    fitContent = false,
    fitContentOnDblClick = false,
    chartOptions = {},
    onCrosshairMove,
    onRegister,
    onClick,
    enableLegend = false,
  }: Props = $props();

  // State
  let chartContainer = $state<HTMLDivElement>();
  const controller = new ChartController();

  // Exported methods for external sync
  export const setCrosshair = (param: any) => {
    controller.setCrosshair(param);
  };

  export const clearCrosshair = () => {
    controller.clearCrosshair();
  };

  export const scrollToTime = (time: number) => {
    controller.scrollToTime(time);
  };

  export const resetTimeScale = () => {
    controller.resetTimeScale();
  };

  export const doFitContent = () => {
    controller.fitContent();
  };

  onMount(() => {
    if (!chartContainer) return;

    // 1. Initialize Chart
    controller.init(chartContainer);

    // Apply custom options
    if (Object.keys(chartOptions).length > 0) {
      controller.applyOptions(chartOptions);
    }

    // Enable Legend if requested
    if (enableLegend) {
      controller.enableLegend(chartContainer);
    }

    // Register API if requested
    if (onRegister) {
      onRegister({
        setCrosshair,
        clearCrosshair,
        scrollToTime,
        resetTimeScale,
        fitContent: doFitContent,
      });
    }

    // Subscribe to Crosshair Move
    const handleCrosshairMove = (param: any) => {
      if (onCrosshairMove) {
        onCrosshairMove(param);
      }
    };
    controller.subscribeCrosshairMove(handleCrosshairMove);

    // Click Handler with debounce for dblclick conflict
    let clickTimer: ReturnType<typeof setTimeout> | null = null;
    const handleClick = (param: any) => {
      if (onClick) {
        // 如果同时有双击处理，延迟单击以避免冲突
        if (fitContentOnDblClick) {
          // 清除之前的定时器
          if (clickTimer) {
            clearTimeout(clickTimer);
          }
          // 延迟执行单击，如果是双击则会被双击事件取消
          clickTimer = setTimeout(() => {
            onClick(param);
            clickTimer = null;
          }, 250); // 250ms足够检测双击
        } else {
          // 没有双击处理，直接执行单击
          onClick(param);
        }
      }
    };

    if (onClick) {
      controller.subscribeClick(handleClick);
    }

    // Double Click Handler
    const handleDblClick = () => {
      // 双击时取消待执行的单击
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
      }
      controller.fitContent();
    };

    if (fitContentOnDblClick) {
      controller.subscribeDblClick(handleDblClick);
    }

    // 2. ResizeObserver
    const resizeObserver = new ResizeObserver((entries) => {
      if (!chartContainer) return;
      const rect = chartContainer.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        controller.resize(rect.width, rect.height, fitContent);
      }
    });

    resizeObserver.observe(chartContainer);

    // 如果不是fitContent模式，初始化后重置时间轴显示最新数据
    if (!fitContent) {
      controller.resetTimeScale();
    }

    // Cleanup
    return () => {
      resizeObserver.disconnect();
      controller.unsubscribeCrosshairMove(handleCrosshairMove);
      if (onClick) {
        controller.unsubscribeClick(handleClick);
      }
      if (fitContentOnDblClick) {
        controller.unsubscribeDblClick(handleDblClick);
      }
      controller.destroy();
    };
  });

  // React to series config changes
  $effect(() => {
    const currentSeriesConfig = series;

    untrack(() => {
      if (!chartContainer) return;

      const rect = chartContainer.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        // Ensure correct size before update
        // If resize happens immediately after mount, controller might not be ready if init was async (it's sync here)
        controller.resize(rect.width, rect.height);
      }

      controller.updateSeries(currentSeriesConfig);

      if (fitContent) {
        controller.fitContent();
      }
    });
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
    width: 100%;
    height: 100%;
    background: white;
    overflow: hidden;
  }
</style>
