<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import LWChart from '../components/lw-chart/LWChart.svelte';
  import type { ChartApi } from '../utils/chartTypes';
  import { ChartSyncManager } from '../components/lw-chart/logic/ChartSyncManager';
  import { chartSeries, chartPatches } from './data/chartData';
  import type { MarketStream, StreamStatus } from './data/MarketStream';
  import { EMA_COLORS, type IndicatorSpec } from './options';

  let { slotId, stream, indicators, sync }: {
    slotId: string; stream: MarketStream; indicators: IndicatorSpec[]; sync: ChartSyncManager;
  } = $props();
  let api = $state<ChartApi>();
  let status = $state<StreamStatus>(untrack(() => stream.status));
  let renderError = $state('');
  let hoverTime = $state<number | undefined>();
  let warmedPeriods = $state<Set<number>>(new Set());
  let unregister: (() => void) | undefined;
  const series = $derived(chartSeries(indicators));
  const labels: Record<string,string> = { '1d': '日线', '1w': '周线' };
  const chartOptions = {
    layout: { textColor: '#536076', background: { type: 'solid', color: '#fff' }, attributionLogo: true },
    grid: { vertLines: { color: '#f0f2f5' }, horzLines: { color: '#f0f2f5' } },
    timeScale: { timeVisible: true, secondsVisible: false, rightOffset: 5 },
    rightPriceScale: { autoScale: true, scaleMargins: { top: 0.03, bottom: 0.03 } },
  };
  function register(value: ChartApi) {
    unregister?.();
    api = value;
    unregister = sync.register(slotId, {
      ...value,
      // Lightweight Charts 程序清除光标时不发事件，视图状态同步清空。
      setCrosshair(param: any) { hoverTime = undefined; value.setCrosshair(param); },
      clearCrosshair() { hoverTime = undefined; value.clearCrosshair(); },
    });
  }
  function crosshair(param: any) {
    hoverTime = typeof param.time === 'number' ? param.time : undefined;
    if (param.sourceEvent || param.time === undefined) sync.sync(slotId, param);
  }
  $effect(() => {
    const current = stream;
    const currentIndicators = indicators;
    const chart = api;
    if (!chart) return;
    let active = true;
    let queue = Promise.resolve();
    const unsubscribe = current.subscribe(event => {
      status = current.status;
      warmedPeriods = new Set([...current.store.emas].filter(([, ema]) => ema.points.length > 0).map(([period]) => period));
      if (event.kind === 'status') return;
      // 等子组件完成系列协调，再按顺序提交已捕获的数据页。
      queue = queue.then(async () => {
        await tick();
        if (!active) return;
        const patches = chartPatches(event, currentIndicators);
        if (event.kind === 'replace') chart.replaceSeriesData(patches);
        else chart.updateSeriesData(patches);
        renderError = '';
      }).catch(() => { if (active) renderError = '图表更新失败，请重新加载'; });
    });
    return () => { active = false; unsubscribe(); };
  });
  onMount(() => () => { unregister?.(); });
</script>

<section class="crypto-chart" data-slot={slotId} data-timeframe={stream.identity.timeframe}
  data-phase={status.phase} data-bars={status.count} data-crosshair-time={hoverTime ?? ''}>
  <div class="caption">
    <strong>{stream.identity.symbol}</strong>
    <span class="period">{labels[stream.identity.timeframe] || stream.identity.timeframe}</span>
    <span class="indicator-labels">
      {#each indicators as indicator, index (indicator.period)}
        <span style:color={EMA_COLORS[index % EMA_COLORS.length]}>EMA{indicator.period}{#if status.count && !warmedPeriods.has(indicator.period)}（预热）{/if}</span>
      {/each}
    </span>
  </div>
  <LWChart {series} seriesMode="reconcile" {chartOptions} onRegister={register}
    onCrosshairMove={crosshair} enableLegend={true} showLegendInAll={true} />
  {#if status.message || renderError}
    <div class:error={status.phase === 'error' || !!renderError} class="status" role="status">
      {renderError || status.message}
    </div>
  {/if}
</section>

<style>
  .crypto-chart { width:100%; height:100%; position:relative; min-width:0; min-height:0; overflow:hidden; background:white; }
  .caption { position:absolute; z-index:12; left:9px; top:7px; display:flex; align-items:center; gap:9px; font-size:11px; pointer-events:none; background:rgba(255,255,255,.87); padding:3px 5px; border-radius:3px; }
  strong { font-weight:600; color:#253247; }
  .period { font-weight:600; color:#66738a; }
  .indicator-labels { display:flex; gap:7px; font-size:10px; }
  .status { position:absolute; z-index:14; left:14px; bottom:30px; max-width:80%; background:rgba(247,249,252,.94); color:#728096; padding:5px 8px; font-size:11px; border-radius:4px; pointer-events:none; }
  .status.error { background:#fff3f0; color:#bc4535; }
  :global(.crypto-chart .chart-legend) { top:34px !important; }
  @media(max-width:700px) { .indicator-labels { display:none; } .caption { font-size:10px; gap:4px; } }
</style>
