<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { changeLayout, serializeDashboardQuery } from './query';
  import { normalizeSettings, indicatorString, TIMEFRAMES, LAYOUTS, MAX_HISTORY_BARS, type DashboardSettings, type Layout, type RuntimeOptions, type DockPosition } from './options';
  import { anchorPopup } from './popup';
  let { current, runtime, anchor, position, version, onApply, onCancel }: {
    current: DashboardSettings; runtime: RuntimeOptions; anchor?: HTMLElement; position: DockPosition; version: number;
    onApply: (value: DashboardSettings) => void; onCancel: () => void;
  } = $props();
  let draft = $state(untrack(() => structuredClone($state.snapshot(current))));
  let indicators = $state(untrack(() => indicatorString(draft.indicators)));
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
    });
  });
  function apply(event: SubmitEvent) {
    event.preventDefault();
    try { onApply(normalizeSettings({ ...draft, indicators })); }
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
        onchange={event => { draft = changeLayout(draft, event.currentTarget.value as Layout, runtime.defaults); }}>
        {#each Object.keys(LAYOUTS) as layout}<option value={layout}>{layout.replace('x',' × ')}</option>{/each}
      </select></label>
      <label>主题<select name="theme" bind:value={draft.theme}><option value="dark">深色</option><option value="light">浅色</option></select></label>
    </div>
    <label>按钮栏位置<select name="dock_position" bind:value={draft.dock_position}>
      <option value="top">上方</option><option value="bottom">下方</option><option value="left">左侧</option><option value="right">右侧</option>
    </select></label>
    <div class="periods">
      {#each draft.timeframes as _, index}
        <label>窗口 {index + 1}<select name={`timeframe-${index}`} bind:value={draft.timeframes[index]}>
          {#each TIMEFRAMES as period}<option value={period}>{period}</option>{/each}
        </select></label>
      {/each}
    </div>
    <label>显示时区<input name="timezone" list="timezones" bind:value={draft.timezone} spellcheck="false" /></label>
    <datalist id="timezones"><option value="local">本地</option><option value="UTC"></option><option value="Asia/Shanghai"></option><option value="America/New_York"></option><option value="Europe/London"></option></datalist>
    <div class="hint">local 跟随本地（{localZone}）；也可填 IANA 时区。只改变显示。</div>
    <label>EMA 指标<textarea name="indicators" bind:value={indicators} rows="2" spellcheck="false"></textarea></label>
    <div class="hint">例如 ema,5;ema,14;ema,50</div>
    <div class="small-actions"><button type="button" onclick={() => { indicators = 'none'; }}>无指标</button>
      <button type="button" onclick={() => { indicators = indicatorString(runtime.defaults.indicators); }}>默认 EMA</button></div>
    <label>更新间隔（秒）<input name="refresh_seconds" type="number" min="1" max="3600" bind:value={draft.refresh_seconds} /></label>
    <label>历史 K 线数量<input name="history_bars" type="number" min="1" max={MAX_HISTORY_BARS} bind:value={draft.history_bars} /></label>
    <div class="hint">历史不足时显示实际返回数量；最多 {MAX_HISTORY_BARS} 根。</div>
    </fieldset>
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
  input,select,textarea { box-sizing:border-box; width:100%; border:1px solid var(--ui-border); padding:8px; border-radius:5px; background:var(--field-background); color:var(--text-color); font-size:12px; font-family:inherit; }
  input:focus,select:focus,textarea:focus { outline:2px solid var(--accent); border-color:var(--accent); }
  .row,.periods { display:flex; gap:8px; }
  .source-section,.common-fields { border:1px solid var(--ui-border); border-radius:7px; min-width:0; }
  .source-section { overflow:hidden; }
  .tabs { display:flex; gap:4px; padding:4px 4px 0; border-bottom:1px solid var(--ui-border); background:var(--toggle-background); }
  .tabs button { flex:1; margin-bottom:-1px; border-color:transparent; border-radius:5px 5px 0 0; background:transparent; }
  .tabs [aria-selected="true"] { color:var(--text-color); border-color:var(--ui-border); border-bottom-color:var(--surface-background); background:var(--surface-background); }
  .source-fields,.common-fields { display:flex; flex-direction:column; gap:13px; padding:12px; }
  .source-fields select { padding:8px 4px; font-size:11px; }
  .common-fields { margin:0; }
  legend { padding:0 5px; font-size:11px; color:var(--secondary-text); }
  .periods { flex-wrap:wrap; } .periods label { min-width:65px; }
  .hint { margin-top:-8px; font-size:10px; color:var(--muted-text); }
  .small-actions,.footer { display:flex; gap:8px; }
  .small-actions { margin-top:-7px; }
  button { cursor:pointer; border:1px solid var(--ui-border); background:var(--field-background); color:var(--secondary-text); padding:7px 11px; border-radius:5px; font-size:11px; }
  .small-actions button { font-size:10px; padding:4px 8px; }
  .footer { justify-content:flex-end; margin-top:5px; }
  .apply { background:var(--accent); color:white; border-color:var(--accent); }
  .error { font-size:11px; color:var(--error-text); margin:0; }
</style>
