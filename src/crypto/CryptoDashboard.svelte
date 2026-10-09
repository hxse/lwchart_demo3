<script lang="ts">
  import { onMount } from 'svelte';
  import GridTemplate from '../components/grid-template/GridTemplate.svelte';
  import { ChartSyncManager } from '../components/lw-chart/logic/ChartSyncManager';
  import CryptoChartPane from './CryptoChartPane.svelte';
  import ControlsMenu from './ControlsMenu.svelte';
  import WatchlistPanel from './WatchlistPanel.svelte';
  import WatchlistEditor from './WatchlistEditor.svelte';
  import { MarketClient } from './data/client';
  import { MarketHub } from './data/MarketHub';
  import type { MarketStream } from './data/MarketStream';
  import { parseDashboardQuery, serializeDashboardQuery } from './query';
  import { LAYOUTS, indicatorString, parseIndicators, activeOptions, type DashboardSettings, type RuntimeOptions } from './options';
  import { parseWatchlist, serializeWatchlist, selectWatch, assertUrlLength, type WatchEntry, type WatchlistState } from './watchlist';
  import { themeStyles } from './theme';
  import { createTimeDisplay } from './time';

  const client = new MarketClient();
  const sync = new ChartSyncManager();
  let runtime = $state<RuntimeOptions>();
  let settings = $state<DashboardSettings>();
  const options = $derived(settings ? activeOptions(settings) : undefined);
  let watchlist = $state<WatchlistState>({ entries: [], flat: false });
  let watchError = $state('');
  let editing = $state(false);
  let streams = $state<MarketStream[]>([]);
  let error = $state('');
  let opened = $state(false);
  let menuVersion = $state(0);
  let settingsButton = $state<HTMLButtonElement>();
  let hub: MarketHub | undefined;
  let lastSearch: string | undefined;
  let lastHash: string | undefined;
  let lastAddress: string | undefined;
  const theme = $derived(options?.theme ?? runtime?.defaults.theme ?? 'dark');
  const dockPosition = $derived(settings?.dock_position ?? runtime?.defaults.dock_position ?? 'right');
  const timezone = $derived(options?.timezone ?? runtime?.defaults.timezone ?? 'local');
  const timeDisplay = $derived(createTimeDisplay(timezone));
  const indicatorKey = $derived(indicatorString(options?.indicators || []));
  const indicators = $derived(parseIndicators(indicatorKey));
  const items = $derived(streams.map((stream, index) => ({
    id: `slot-${index}`, component: CryptoChartPane,
    props: { slotId: `slot-${index}`, stream, indicators, theme, timeDisplay, sync },
  })));
  function urlFor(value: DashboardSettings) { return `${location.origin}${location.pathname}?${serializeDashboardQuery(value)}${location.hash}`; }
  function validLength(url: string) {
    try { assertUrlLength(url); return true; }
    catch (e) { window.alert((e as Error).message); return false; }
  }
  function readUrl() {
    if (!runtime) return;
    const withinLimit = location.href === lastAddress || validLength(location.href);
    if (location.search !== lastSearch) {
      try {
        const value = parseDashboardQuery(location.search, runtime);
        const next = urlFor(value);
        if (next !== location.href && withinLimit && validLength(next)) history.replaceState(history.state, '', next);
        if (!settings || serializeDashboardQuery(settings) !== serializeDashboardQuery(value)) settings = value;
        error = '';
      } catch (e) { settings = undefined; error = (e as Error).message; }
      lastSearch = location.search;
      if (opened) menuVersion++;
    }
    if (location.hash !== lastHash) {
      try { watchlist = parseWatchlist(location.hash); watchError = ''; }
      catch (e) { watchlist = { entries: [], flat: false }; watchError = (e as Error).message; }
      lastHash = location.hash; editing = false;
    }
    lastAddress = location.href;
  }
  function apply(value: DashboardSettings) {
    const next = urlFor(value);
    if (!validLength(next)) return false;
    if (location.href !== next) history.pushState(null, '', next);
    if (!settings || serializeDashboardQuery(settings) !== serializeDashboardQuery(value)) settings = value;
    lastSearch = location.search; lastAddress = location.href;
    error = ''; opened = false;
    return true;
  }
  function publishWatchlist(value: WatchlistState) {
    const next = new URL(location.href);
    next.hash = serializeWatchlist(value);
    if (!validLength(next.href)) return false;
    if (next.href !== location.href) history.pushState(null, '', next);
    watchlist = value; watchError = ''; editing = false;
    lastHash = location.hash; lastAddress = location.href;
    return true;
  }
  function saveWatchlist(entries: WatchEntry[]) { return publishWatchlist({ entries, flat: watchlist.flat }); }
  function setFlat(flat: boolean) { return publishWatchlist({ entries: watchlist.entries, flat }); }
  function select(entry: WatchEntry) { return settings ? apply(selectWatch(settings, entry)) : false; }
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
    window.addEventListener('hashchange', readUrl);
    return () => {
      controller.abort(); hub?.dispose(); sync.clear();
      window.removeEventListener('popstate', readUrl); window.removeEventListener('hashchange', readUrl);
    };
  });
</script>

<main class="dashboard" data-theme={theme} data-dock={dockPosition} style={themeStyles(theme)} aria-label="多周期行情看盘">
  <div class="chart-area">
  {#if options && streams.length}
    <GridTemplate {items} templateConfig={LAYOUTS[options.layout]} gap="2px" />
  {:else}
    <div class="empty" role={error ? 'alert' : 'status'}>
      <strong>{error ? '看盘参数暂不可用' : '正在准备看盘…'}</strong>
      {#if error}<p>{error}</p>{/if}
    </div>
  {/if}
  </div>
  <div class="button-bar" role="toolbar" aria-label="看盘按钮栏">
  <button class="toggle" aria-label="展开看盘设置" aria-expanded={opened} title="看盘设置"
    bind:this={settingsButton} onclick={() => { opened = !opened; }} disabled={!runtime}>⚙</button>
  {#if runtime}
    <WatchlistPanel entries={watchlist.entries} flat={watchlist.flat} position={dockPosition} current={settings} error={watchError} onSelect={select} onFlatChange={setFlat}
      onEdit={() => { opened = false; editing = true; }} />
  {/if}
  </div>
  {#if opened && runtime}
    <ControlsMenu current={settings || runtime.defaults} {runtime} anchor={settingsButton} position={dockPosition} version={menuVersion} onApply={apply} onCancel={() => { opened = false; }} />
  {/if}
  {#if runtime}
    {#if editing}<WatchlistEditor entries={watchlist.entries} flat={watchlist.flat} onSave={saveWatchlist} onCancel={() => { editing = false; }} />{/if}
  {/if}
</main>

<style>
  .dashboard { width:100%; height:100%; display:flex; overflow:hidden; background:var(--dashboard-divider); color:var(--text-color); }
  .dashboard[data-dock="left"] { flex-direction:row-reverse; }
  .dashboard[data-dock="top"] { flex-direction:column-reverse; }
  .dashboard[data-dock="bottom"] { flex-direction:column; }
  .chart-area { flex:1; min-width:0; min-height:0; overflow:hidden; }
  .button-bar { display:flex; flex-direction:column; align-items:center; flex:0 0 42px; min-width:0; min-height:0; gap:4px; padding:4px 1px; box-sizing:border-box; background:var(--surface-background); border-left:1px solid var(--ui-border); }
  [data-dock="left"] .button-bar { border-left:0; border-right:1px solid var(--ui-border); }
  [data-dock="top"] .button-bar,[data-dock="bottom"] .button-bar { flex-direction:row; padding:1px 4px; border-left:0; }
  [data-dock="top"] .button-bar { border-bottom:1px solid var(--ui-border); }
  [data-dock="bottom"] .button-bar { border-top:1px solid var(--ui-border); }
  .toggle { width:32px; height:30px; flex-shrink:0; padding:0; display:grid; place-items:center; box-sizing:border-box; border:1px solid var(--ui-border); border-radius:7px; background:var(--toggle-background); color:var(--secondary-text); font-size:18px; cursor:pointer; opacity:.7; }
  .toggle:hover,.toggle[aria-expanded="true"] { opacity:1; background:var(--surface-background); }
  .toggle:disabled { cursor:wait; }
  .empty { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:var(--secondary-text); font-size:13px; background:var(--chart-background); }
  .empty p { max-width:80%; font-size:12px; }
</style>
