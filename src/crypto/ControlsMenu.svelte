<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { changeLayout, serializeDashboardQuery } from './query';
  import { normalizeSettings, validateMainPaneRatio, indicatorString, parseIndicators, LAYOUTS, MAX_HISTORY_BARS, type DashboardSettings, type Layout, type RuntimeOptions, type DockPosition } from './options';
  import { chartIndicatorDrafts, resizeChartIndicatorDrafts, parseChartIndicatorDrafts } from './chartIndicators';
  import IndicatorEditor from './IndicatorEditor.svelte';
  import WindowSettings from './WindowSettings.svelte';
  import { anchorPopup } from './popup';
  let { current, runtime, anchor, position, version, onApply, onCancel }: {
    current: DashboardSettings; runtime: RuntimeOptions; anchor?: HTMLElement; position: DockPosition; version: number;
    onApply: (value: DashboardSettings) => void; onCancel: () => void;
  } = $props();
  let draft = $state(untrack(() => structuredClone($state.snapshot(current))));
  let indicators = $state(untrack(() => indicatorString(draft.indicators)));
  let charts = $state(untrack(() => chartIndicatorDrafts(current)));
  let error = $state('');
  let dialog = $state<HTMLDivElement>();
  let published = untrack(() => serializeDashboardQuery(current));
  let navigation = untrack(() => version);
  const localZone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
  onMount(() => { dialog?.querySelector<HTMLInputElement>('input')?.focus(); });
  $effect(() => {
    const key = serializeDashboardQuery(current);
    const currentNavigation = version;
    if (key !== published || currentNavigation !== navigation) untrack(() => {
      published = key; navigation = currentNavigation;
      draft = structuredClone($state.snapshot(current));
      indicators = indicatorString(current.indicators); error = '';
      charts = chartIndicatorDrafts(current);
    });
  });
  function layout(value: Layout) {
    draft = changeLayout(draft,value,runtime.defaults);
    charts = resizeChartIndicatorDrafts(charts,draft.timeframes.length,indicators);
  }
  function apply(event: SubmitEvent) {
    event.preventDefault();
    try {
      onApply(normalizeSettings({ ...draft, indicators:parseIndicators(indicators), chart_indicators:parseChartIndicatorDrafts(charts),
        main_pane_ratio:validateMainPaneRatio(draft.main_pane_ratio) }));
    }
    catch (e) { error = (e as Error).message; }
  }
</script>

<svelte:window onkeydown={event => { if (event.key === 'Escape') { event.preventDefault(); onCancel(); } }} />
<div class="menu" bind:this={dialog} use:anchorPopup={{ anchor, side: position }} role="dialog" aria-modal="true" aria-label="看盘设置" tabindex="-1">
  <div class="heading"><strong>看盘设置</strong><button class="close" aria-label="关闭设置" onclick={onCancel}>×</button></div>
  <form onsubmit={apply} novalidate>
    <section class="source-section" aria-label="来源设置">
    <div class="tabs" role="tablist" aria-label="数据源">
      <button type="button" role="tab" aria-selected={draft.source === 'ccxt'} aria-controls="source-fields" onclick={() => { draft.source = 'ccxt'; }}>CCXT</button>
      <button type="button" role="tab" aria-selected={draft.source === 'tq'} aria-controls="source-fields" onclick={() => { draft.source = 'tq'; }}>TQ</button>
    </div>
    <div class="source-fields" id="source-fields" role="tabpanel" aria-label={draft.source === 'ccxt' ? 'CCXT 参数' : 'TQ 参数'}>
    {#if draft.source === 'ccxt'}
      <label>品种<input name="ccxt.symbol" bind:value={draft.ccxt.symbol} placeholder="BTC/USDT:USDT" /></label>
      <div class="row">
        <label>交易所<select name="ccxt.exchange_name" bind:value={draft.ccxt.exchange_name}><option value="binance">Binance</option><option value="kraken">Kraken</option></select></label>
        <label>市场<select name="ccxt.market" bind:value={draft.ccxt.market}><option value="future">合约</option><option value="spot">现货</option></select></label>
        <label>环境<select name="ccxt.is_live" bind:value={draft.ccxt.is_live}><option value={true}>实盘行情</option><option value={false}>模拟盘行情</option></select></label>
      </div>
    {:else}
      <label>品种<input name="tq.symbol" bind:value={draft.tq.symbol} placeholder="KQ.m@SHFE.rb" /></label>
    {/if}
    </div>
    </section>
    <fieldset class="common-fields">
    <legend>公共设置</legend>
    <div class="row">
      <label>布局<select name="layout" value={draft.layout}
        onchange={event => { layout(event.currentTarget.value as Layout); }}>
        {#each Object.keys(LAYOUTS) as layout}<option value={layout}>{layout.replace('x',' × ')}</option>{/each}
      </select></label>
      <label>主题<select name="theme" bind:value={draft.theme}><option value="dark">深色</option><option value="light">浅色</option></select></label>
    </div>
    <label>主图占比<input name="main_pane_ratio" type="number" min="0" max="1" step="any" bind:value={draft.main_pane_ratio} /></label>
    <div class="hint">大于 0、小于 1；例如 0.7 表示主图七成，剩余由副图均分。拖动仅临时调整。</div>
    <label>按钮栏位置<select name="dock_position" bind:value={draft.dock_position}>
      <option value="top">上方</option><option value="bottom">下方</option><option value="left">左侧</option><option value="right">右侧</option>
    </select></label>
    <label>显示时区<input name="timezone" list="timezones" bind:value={draft.timezone} spellcheck="false" /></label>
    <datalist id="timezones"><option value="local">本地</option><option value="UTC"></option><option value="Asia/Shanghai"></option><option value="America/New_York"></option><option value="Europe/London"></option></datalist>
    <div class="hint">local 跟随本地（{localZone}）；也可填 IANA 时区。只改变显示。</div>
    <IndicatorEditor bind:value={indicators} defaultValue={indicatorString(runtime.defaults.indicators)} />
    <div class="hint">公共默认指标；独立配置的窗口保留自己的列表。</div>
    <label>更新间隔（秒）<input name="refresh_seconds" type="number" min="1" max="3600" bind:value={draft.refresh_seconds} /></label>
    <label>历史 K 线数量<input name="history_bars" type="number" min="1" max={MAX_HISTORY_BARS} bind:value={draft.history_bars} /></label>
    <div class="hint">历史不足时显示实际返回数量；最多 {MAX_HISTORY_BARS} 根。</div>
    </fieldset>
    <WindowSettings bind:timeframes={draft.timeframes} bind:drafts={charts} common={indicators} />
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <div class="hint">点击应用后更新图表与地址；关闭或取消丢弃修改。</div>
    <div class="footer"><button type="button" onclick={onCancel}>取消</button><button class="apply" type="submit">应用</button></div>
  </form>
</div>

<style>
  .menu { position:fixed; z-index:100; width:350px; max-width:calc(100vw - 24px); max-height:calc(100dvh - 12px); overflow:auto; padding:18px; box-sizing:border-box; background:var(--surface-background); border:1px solid var(--ui-border); box-shadow:0 14px 50px var(--ui-shadow); border-radius:12px; }
  .heading { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; color:var(--text-color); }
  .close { border:none; font-size:24px; padding:0 4px; background:none; color:var(--secondary-text); }
  form { display:flex; flex-direction:column; gap:13px; }
  label { display:flex; flex-direction:column; gap:6px; font-size:11px; color:var(--secondary-text); flex:1; min-width:0; }
  input,select { box-sizing:border-box; width:100%; border:1px solid var(--ui-border); padding:8px; border-radius:5px; background:var(--field-background); color:var(--text-color); font-size:12px; font-family:inherit; }
  input:focus,select:focus { outline:2px solid var(--accent); border-color:var(--accent); }
  .row { display:flex; gap:8px; }
  .source-section,.common-fields { border:1px solid var(--ui-border); border-radius:7px; min-width:0; }
  .source-section { overflow:hidden; }
  .tabs { display:flex; gap:4px; padding:4px 4px 0; border-bottom:1px solid var(--ui-border); background:var(--toggle-background); }
  .tabs button { flex:1; margin-bottom:-1px; border-color:transparent; border-radius:5px 5px 0 0; background:transparent; }
  .tabs [aria-selected="true"] { color:var(--text-color); border-color:var(--ui-border); border-bottom-color:var(--surface-background); background:var(--surface-background); }
  .source-fields,.common-fields { display:flex; flex-direction:column; gap:13px; padding:12px; }
  .source-fields select { padding:8px 4px; font-size:11px; }
  .common-fields { margin:0; }
  legend { padding:0 5px; font-size:11px; color:var(--secondary-text); }
  .hint { margin-top:-8px; font-size:10px; color:var(--muted-text); }
  .footer { display:flex; gap:8px; }
  button { cursor:pointer; border:1px solid var(--ui-border); background:var(--field-background); color:var(--secondary-text); padding:7px 11px; border-radius:5px; font-size:11px; }
  .footer { justify-content:flex-end; margin-top:5px; }
  .apply { background:var(--accent); color:white; border-color:var(--accent); }
  .error { font-size:11px; color:var(--error-text); margin:0; }
</style>
