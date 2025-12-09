<script lang="ts">
  import { onMount, untrack } from "svelte";
  import type { SeriesConfig } from "../../utils/seriesMatcher";
  import { ChartController } from "./logic/ChartController";

  // Props
  interface Props {
    series: SeriesConfig[]; // Configuration for all series in this chart
    template?: string; // Optional identifier for template logic if needed
    fitContent?: boolean; // New prop: Auto-fit content
    fitContentOnDblClick?: boolean; // New prop: Auto-fit on double click
    chartOptions?: Record<string, any>; // New prop: Custom chart options (e.g. handleScale)
    onCrosshairMove?: (param: any) => void; // New prop: Sync callback
    onRegister?: (api: { setCrosshair: (param: any) => void }) => void; // Sync registration
  }

  let {
    series,
    fitContent = false,
    fitContentOnDblClick = false,
    chartOptions = {},
    onCrosshairMove,
    onRegister,
  }: Props = $props();

  // State
  let chartContainer = $state<HTMLDivElement>();
  const controller = new ChartController();

  // Exported method for external sync
  export const setCrosshair = (param: any) => {
    controller.setCrosshair(param);
  };

  onMount(() => {
    const startTime = performance.now();
    if (!chartContainer) return;

    // 1. Initialize Chart
    controller.init(chartContainer);

    // Apply custom options
    if (Object.keys(chartOptions).length > 0) {
      controller.applyOptions(chartOptions);
    }

    // Register API if requested
    if (onRegister) {
      onRegister({ setCrosshair });
    }

    // Subscribe to Crosshair Move
    const handleCrosshairMove = (param: any) => {
      if (onCrosshairMove) {
        onCrosshairMove(param);
      }
    };
    controller.subscribeCrosshairMove(handleCrosshairMove);

    // Double Click Handler
    const handleDblClick = () => {
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

    console.log(
      `[Performance] Chart mount: ${(performance.now() - startTime).toFixed(2)}ms`,
    );

    // Cleanup
    return () => {
      resizeObserver.disconnect();
      controller.unsubscribeCrosshairMove(handleCrosshairMove);
      if (fitContentOnDblClick) {
        controller.unsubscribeDblClick(handleDblClick);
      }
      controller.destroy();
    };
  });

  // React to series config changes
  $effect(() => {
    const startTime = performance.now();
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

    console.log(
      `[Performance] Chart effect update: ${(performance.now() - startTime).toFixed(2)}ms`,
    );
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
