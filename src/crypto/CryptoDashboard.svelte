<script lang="ts">
  import { onMount } from 'svelte';
  import GridTemplate from '../components/grid-template/GridTemplate.svelte';
  import { ChartSyncManager } from '../components/lw-chart/logic/ChartSyncManager';
  import CryptoChartPane from './CryptoChartPane.svelte';
  import ControlsMenu from './ControlsMenu.svelte';
  import { MarketClient } from './data/client';
  import { MarketHub } from './data/MarketHub';
  import type { MarketStream } from './data/MarketStream';
  import { parseDashboardQuery, serializeDashboardQuery } from './query';
  import { LAYOUTS, indicatorString, parseIndicators, type DashboardOptions, type RuntimeOptions } from './options';
  import { themeStyles } from './theme';
  import { createTimeDisplay } from './time';

  const client = new MarketClient();
  const sync = new ChartSyncManager();
  let runtime = $state<RuntimeOptions>();
  let options = $state<DashboardOptions>();
  let streams = $state<MarketStream[]>([]);
  let error = $state('');
  let opened = $state(false);
  let menuVersion = $state(0);
  let hub: MarketHub | undefined;
  const theme = $derived(options?.theme ?? runtime?.defaults.theme ?? 'dark');
  const timezone = $derived(options?.timezone ?? runtime?.defaults.timezone ?? 'local');
  const timeDisplay = $derived(createTimeDisplay(timezone));
  const indicatorKey = $derived(indicatorString(options?.indicators || []));
  const indicators = $derived(parseIndicators(indicatorKey));
  const items = $derived(streams.map((stream, index) => ({
    id: `slot-${index}`, component: CryptoChartPane,
    props: { slotId: `slot-${index}`, stream, indicators, theme, timeDisplay, sync },
  })));
  function urlFor(value: DashboardOptions) { return `${location.pathname}?${serializeDashboardQuery(value)}${location.hash}`; }
  function readUrl() {
    if (!runtime) return;
    try {
      options = parseDashboardQuery(location.search, runtime);
      const next = urlFor(options);
      if (`${location.pathname}${location.search}${location.hash}` !== next) history.replaceState(history.state, '', next);
      error = '';
    } catch (e) { options = undefined; error = (e as Error).message; }
    if (opened) menuVersion++;
  }
  function apply(value: DashboardOptions) {
    const next = urlFor(value);
    if (`${location.pathname}${location.search}${location.hash}` !== next) history.pushState(null, '', next);
    if (!options || serializeDashboardQuery(options) !== serializeDashboardQuery(value)) options = value;
    error = ''; opened = false;
  }
  $effect(() => {
    const current = options;
    if (!current) { hub?.dispose(); hub = undefined; streams = []; sync.clear(); return; }
    if (!hub) hub = new MarketHub(client);
    streams = hub.configure(current); sync.setReady(true);
    document.title = `${current.symbol} · 多周期看盘`;
  });
  onMount(() => {
    const controller = new AbortController();
    void client.runtime(controller.signal).then(value => {
      if (!controller.signal.aborted) { runtime = value; readUrl(); }
    }).catch(() => { if (!controller.signal.aborted) error = '无法读取看盘配置，请检查本地服务'; });
    window.addEventListener('popstate', readUrl);
    return () => { controller.abort(); hub?.dispose(); sync.clear(); window.removeEventListener('popstate', readUrl); };
  });
</script>

<main class="dashboard" data-theme={theme} style={themeStyles(theme)} aria-label="多周期行情看盘">
  {#if options && streams.length}
    <GridTemplate {items} templateConfig={LAYOUTS[options.layout]} gap="2px" />
  {:else}
    <div class="empty" role={error ? 'alert' : 'status'}>
      <strong>{error ? '看盘参数暂不可用' : '正在准备看盘…'}</strong>
      {#if error}<p>{error}</p>{/if}
    </div>
  {/if}
  <button class="toggle" aria-label="展开看盘设置" aria-expanded={opened} title="看盘设置"
    onclick={() => { opened = !opened; }} disabled={!runtime}>⚙</button>
  {#if opened && runtime}
    <ControlsMenu current={options || runtime.defaults} {runtime} version={menuVersion} onApply={apply} onCancel={() => { opened = false; }} />
  {/if}
</main>

<style>
  .dashboard { width:100%; height:100%; overflow:hidden; background:var(--dashboard-divider); color:var(--text-color); }
  .toggle { position:fixed; z-index:110; top:8px; right:10px; width:32px; height:30px; padding:0; display:grid; place-items:center; border:1px solid var(--ui-border); border-radius:7px; background:var(--toggle-background); color:var(--secondary-text); font-size:18px; cursor:pointer; opacity:.7; box-shadow:0 2px 8px var(--ui-shadow); }
  .toggle:hover,.toggle[aria-expanded="true"] { opacity:1; background:var(--surface-background); }
  .toggle:disabled { cursor:wait; }
  .empty { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:var(--secondary-text); font-size:13px; background:var(--chart-background); }
  .empty p { max-width:80%; font-size:12px; }
</style>
