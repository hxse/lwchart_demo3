<script lang="ts">
  import { onMount } from 'svelte';
  import GridTemplate from '../components/grid-template/GridTemplate.svelte';
  import { ChartSyncManager } from '../components/lw-chart/logic/ChartSyncManager';
  import CryptoChartPane from './CryptoChartPane.svelte';
  import ControlsMenu from './ControlsMenu.svelte';
  import { CryptoClient } from './data/client';
  import { MarketHub } from './data/MarketHub';
  import type { MarketStream } from './data/MarketStream';
  import { parseDashboardQuery, serializeDashboardQuery } from './query';
  import { LAYOUTS, type DashboardOptions, type RuntimeOptions } from './options';

  const client = new CryptoClient();
  const sync = new ChartSyncManager();
  let runtime = $state<RuntimeOptions>();
  let options = $state<DashboardOptions>();
  let streams = $state<MarketStream[]>([]);
  let error = $state('');
  let opened = $state(false);
  let menuVersion = $state(0);
  let hub: MarketHub | undefined;
  let menuStart: { url: string; options: DashboardOptions | undefined; error: string } | undefined;
  const items = $derived(streams.map((stream, index) => ({
    id: `slot-${index}`, component: CryptoChartPane,
    props: { slotId: `slot-${index}`, stream, indicators: options?.indicators || [], sync },
  })));

  function urlFor(value: DashboardOptions) {
    return `${location.pathname}?${serializeDashboardQuery(value)}${location.hash}`;
  }
  function rememberMenu() {
    menuStart = { url: `${location.pathname}${location.search}${location.hash}`,
      options: options ? structuredClone($state.snapshot(options)) : undefined, error };
  }
  function preview(value: DashboardOptions) {
    const next = urlFor(value);
    if (`${location.pathname}${location.search}${location.hash}` !== next) history.replaceState(history.state, '', next);
    if (!options || serializeDashboardQuery(options) !== serializeDashboardQuery(value)) options = value;
    error = '';
  }
  function readUrl() {
    if (!runtime) return;
    try { preview(parseDashboardQuery(location.search, runtime.defaults)); }
    catch (e) { options = undefined; error = (e as Error).message; }
    if (opened) { rememberMenu(); menuVersion++; }
  }
  function cancel() {
    if (menuStart) {
      history.replaceState(history.state, '', menuStart.url);
      if (menuStart.options) preview(menuStart.options);
      else { options = undefined; error = menuStart.error; }
    }
    opened = false;
    menuStart = undefined;
  }
  function toggle() {
    if (opened) { cancel(); return; }
    rememberMenu(); opened = true;
  }
  function apply(value: DashboardOptions) {
    const next = urlFor(value);
    if (menuStart && menuStart.url !== next) {
      // 预览替换了当前地址，提交时恢复旧历史项，再只新增一次。
      history.replaceState(history.state, '', menuStart.url);
      history.pushState(null, '', next);
    }
    preview(value);
    opened = false; menuStart = undefined;
  }
  $effect(() => {
    const current = options;
    const settings = runtime;
    if (!current || !settings) {
      hub?.dispose(); hub = undefined; streams = []; sync.clear();
      return;
    }
    if (!hub) hub = new MarketHub(client, settings.data);
    streams = hub.configure(current);
    sync.setReady(true);
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

<main class="dashboard" aria-label="加密货币多周期看盘">
  {#if options && streams.length}
    <GridTemplate {items} templateConfig={LAYOUTS[options.layout]} gap="2px" />
  {:else}
    <div class="empty" role={error ? 'alert' : 'status'}>
      <strong>{error ? '看盘参数暂不可用' : '正在准备看盘…'}</strong>
      {#if error}<p>{error}</p>{/if}
    </div>
  {/if}
  <button class="toggle" aria-label="展开看盘设置" aria-expanded={opened} title="看盘设置"
    onclick={toggle} disabled={!runtime}>⚙</button>
  {#if opened && runtime}
    <ControlsMenu current={options || runtime.defaults} defaults={runtime.defaults} version={menuVersion} onPreview={preview} onApply={apply} onCancel={cancel} />
  {/if}
</main>

<style>
  .dashboard { width:100%; height:100%; overflow:hidden; background:#dce2ea; }
  .toggle { position:fixed; z-index:110; top:8px; right:10px; width:32px; height:30px; padding:0; display:grid; place-items:center; border:1px solid #ccd5e099; border-radius:7px; background:rgba(255,255,255,.64); color:#52647f; font-size:18px; cursor:pointer; opacity:.7; box-shadow:0 2px 8px #24324811; }
  .toggle:hover,.toggle[aria-expanded="true"] { opacity:1; background:white; }
  .toggle:disabled { cursor:wait; }
  .empty { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:#64718a; font-size:13px; background:#f8fafc; }
  .empty p { max-width:80%; font-size:12px; }
</style>
