<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { changeLayout } from './query';
  import { serializeDashboardQuery } from './query';
  import { normalizeOptions, indicatorString, TIMEFRAMES, LAYOUTS, MAX_HISTORY_BARS, type DashboardOptions, type Layout } from './options';
  let { current, defaults, version, onPreview, onApply, onCancel }: {
    current: DashboardOptions; defaults: DashboardOptions;
    version: number;
    onPreview: (value: DashboardOptions) => void;
    onApply: (value: DashboardOptions) => void; onCancel: () => void;
  } = $props();
  let draft = $state(untrack(() => structuredClone($state.snapshot(current))));
  let indicators = $state(untrack(() => indicatorString(draft.indicators)));
  let error = $state('');
  let dialog = $state<HTMLDivElement>();
  let published = untrack(() => serializeDashboardQuery(current));
  let navigation = untrack(() => version);
  let previewTimer: ReturnType<typeof setTimeout> | undefined;
  function clearPreview() { if (previewTimer) clearTimeout(previewTimer); previewTimer = undefined; }
  onMount(() => { dialog?.querySelector<HTMLInputElement>('input')?.focus(); return clearPreview; });
  $effect(() => {
    const key = serializeDashboardQuery(current);
    const currentNavigation = version;
    if (key !== published || navigation !== currentNavigation) untrack(() => {
      clearPreview(); published = key; navigation = currentNavigation;
      draft = structuredClone($state.snapshot(current));
      indicators = indicatorString(current.indicators); error = '';
    });
  });
  function preview(event?: Event) {
    clearPreview();
    try {
      const value = normalizeOptions({ ...draft, indicators });
      error = '';
      const publish = () => { published = serializeDashboardQuery(value); onPreview(value); };
      const target = event?.target;
      if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) previewTimer = setTimeout(publish, 250);
      else publish();
    } catch (e) { error = (e as Error).message; }
  }
  function setIndicators(value: string) { indicators = value; preview(); }
  function apply(event: SubmitEvent) {
    event.preventDefault();
    clearPreview();
    try { onApply(normalizeOptions({ ...draft, indicators })); }
    catch (e) { error = (e as Error).message; }
  }
</script>

<svelte:window onkeydown={event => { if (event.key === 'Escape') { event.preventDefault(); onCancel(); } }} />
<div class="menu" bind:this={dialog} role="dialog" aria-modal="true" aria-label="看盘设置" tabindex="-1">
  <div class="heading"><strong>看盘设置</strong><button class="close" aria-label="关闭设置" onclick={onCancel}>×</button></div>
  <form onsubmit={apply} oninput={preview} onchange={preview}>
    <label>品种<input name="symbol" bind:value={draft.symbol} placeholder="BTC/USDT:USDT" /></label>
    <div class="row">
      <label>交易所<select name="exchange_name" bind:value={draft.exchange_name}><option value="binance">Binance</option><option value="kraken">Kraken</option></select></label>
      <label>市场<select name="market" bind:value={draft.market}><option value="future">合约</option><option value="spot">现货</option></select></label>
      <label>环境<select name="is_live" bind:value={draft.is_live}><option value={true}>实盘行情</option><option value={false}>模拟盘行情</option></select></label>
    </div>
    <div class="row">
      <label>布局<select name="layout" value={draft.layout}
        onchange={event => { draft = changeLayout(draft, event.currentTarget.value as Layout, defaults); }}>
        {#each Object.keys(LAYOUTS) as layout}<option value={layout}>{layout.replace('x',' × ')}</option>{/each}
      </select></label>
      <label>主题<select name="theme" bind:value={draft.theme}><option value="dark">深色</option><option value="light">浅色</option></select></label>
    </div>
    <div class="periods">
      {#each draft.timeframes as _, index}
        <label>窗口 {index + 1}<select name={`timeframe-${index}`} bind:value={draft.timeframes[index]}>
          {#each TIMEFRAMES as period}<option value={period}>{period}</option>{/each}
        </select></label>
      {/each}
    </div>
    <label>EMA 指标<textarea name="indicators" bind:value={indicators} rows="2" spellcheck="false"></textarea></label>
    <div class="hint">例如 ema,5;ema,14;ema,50</div>
    <div class="small-actions"><button type="button" onclick={() => setIndicators('none')}>无指标</button>
      <button type="button" onclick={() => setIndicators(indicatorString(defaults.indicators))}>默认 EMA</button></div>
    <label>更新间隔（秒）<input name="refresh_seconds" type="number" min="1" max="3600" bind:value={draft.refresh_seconds} /></label>
    <label>历史 K 线数量<input name="history_bars" type="number" min="1" max={MAX_HISTORY_BARS} bind:value={draft.history_bars} /></label>
    <div class="hint">历史不足时显示实际返回数量；最多 {MAX_HISTORY_BARS} 根。</div>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <div class="hint">有效修改自动同步 URL；取消可恢复打开前设置。</div>
    <div class="footer"><button type="button" onclick={onCancel}>取消</button><button class="apply" type="submit">应用并更新 URL</button></div>
  </form>
</div>

<style>
  .menu { position:fixed; z-index:100; top:48px; right:12px; width:350px; max-width:calc(100vw - 24px); max-height:calc(100dvh - 64px); overflow:auto; padding:18px; box-sizing:border-box; background:var(--surface-background); border:1px solid var(--ui-border); box-shadow:0 14px 50px var(--ui-shadow); border-radius:12px; }
  .heading { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; color:var(--text-color); }
  .close { border:none; font-size:24px; padding:0 4px; background:none; color:var(--secondary-text); }
  form { display:flex; flex-direction:column; gap:13px; }
  label { display:flex; flex-direction:column; gap:6px; font-size:11px; color:var(--secondary-text); flex:1; min-width:0; }
  input,select,textarea { box-sizing:border-box; width:100%; border:1px solid var(--ui-border); padding:8px; border-radius:5px; background:var(--field-background); color:var(--text-color); font-size:12px; font-family:inherit; }
  input:focus,select:focus,textarea:focus { outline:2px solid var(--accent); border-color:var(--accent); }
  .row,.periods { display:flex; gap:8px; }
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
