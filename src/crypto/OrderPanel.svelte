<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { TIMEFRAMES, symbol, type DashboardSettings, type DockPosition, type OrderPanelLayout } from './options';
  import type { MarketHub } from './data/MarketHub';
  import { anchorPopup } from './popup';
  import { draftParameters, OrderPanelState, type PanelState } from './trading/panel-state';
  import { cancelOrderDraft, resetOrderDraft, orderReaderSettings, type OrderMemory } from './trading/memory';
  import { matchesChart, type OrderExample } from './trading/preview';
  import { OrderExecution, type ExecutionState } from './trading/execution-state';
  import type { Side } from './trading/types';
  import { planNotionalValue } from './trading/risk-model';
  import OrderResult from './OrderResult.svelte';
  import OrderConfirmation from './OrderConfirmation.svelte';
  import OrderPositions from './OrderPositions.svelte';
  import OrderExampleControls from './OrderExampleControls.svelte';
  import OrderNumberInput from './OrderNumberInput.svelte';

  let { current, chartCurrent, memory = $bindable(), layout, width, hub, execution, anchor, position, onClose, onExample, onLayoutChange, overlayOpen = false }: {
    current: DashboardSettings; chartCurrent?: DashboardSettings; hub: MarketHub; execution: OrderExecution;
    memory: OrderMemory; layout: OrderPanelLayout; width: number; onLayoutChange: (layout: OrderPanelLayout) => void;
    overlayOpen?: boolean;
    anchor?: HTMLElement; position: DockPosition; onClose: () => void; onExample: (example: OrderExample | null) => void;
  } = $props();
  const initial = untrack(() => structuredClone($state.snapshot(current)));
  const context = $derived(memory.context), applied = $derived(memory.applied), draft = $derived(memory.draft);
  const dirty = $derived(memory.dirty), error = $derived(memory.error);
  let snapshot = $state.raw<PanelState | null>(null);
  const view = $derived(snapshot && matchesChart(orderReaderSettings(memory, initial), snapshot.identity) ? snapshot : null);
  let progress = $state.raw<ExecutionState>(untrack(() => execution.state));
  const cleaning = $derived(progress.inspection.pending && progress.inspection.cleanup);
  const busy = $derived(progress.pending || progress.checking || cleaning);
  let panel = $state<HTMLElement>();
  let controller: OrderPanelState | undefined;
  let exampleSide = $state<Side | null>(null);
  let confirmation = $state<Side | null>(null);
  const sides: Side[] = ['buy', 'sell'];
  const readerIdentity = $derived(JSON.stringify([context, applied.symbol]));
  $effect(() => {
    readerIdentity;
    // 只按已确认身份重建读取；草稿、风险参数及显示配置变化不重复订阅。
    return untrack(() => {
      clearExample(); confirmation = null; snapshot = null;
      const settings = orderReaderSettings(memory, initial);
      execution.syncInspectionIdentity(settings.source === 'ccxt' ? settings.ccxt : null);
      let reader: OrderPanelState | undefined, unsubscribe: (() => void) | undefined;
      if (context.source === 'ccxt') {
        reader = new OrderPanelState(settings, hub, undefined, { ...applied });
        controller = reader;
        unsubscribe = reader.subscribe(value => { snapshot = value; }); reader.start();
      }
      return () => { unsubscribe?.(); reader?.dispose(); execution.cancelInspection(); controller = undefined; snapshot = null; };
    });
  });
  $effect(() => { if (dirty || overlayOpen) confirmation = null; });
  const canExample = $derived(!dirty && !busy && !!view && matchesChart(chartCurrent, view.identity));
  $effect(() => {
    const preview = exampleSide && canExample ? view?.directions[exampleSide].preview : null;
    onExample(preview && view && exampleSide ? { identity: { ...view.identity }, side: exampleSide,
      entry: preview.plan.entry_price, stop: preview.plan.stop_price, takeProfit: preview.plan.take_profit_price,
      visible: { ...memory.exampleVisibility } } : null);
  });
  const percent = (value: string) => `${(Number(value) * 100).toFixed(3).replace(/\.?0+$/, '')}%`;
  const warnings = $derived([...new Map([...view?.directions.buy.preview?.warnings ?? [], ...view?.directions.sell.preview?.warnings ?? []].map(w => [w.code, w])).values()]);
  onMount(() => {
    const unsubscribeExecution = execution.subscribe(value => { progress = value; });
    panel?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
    return () => { unsubscribeExecution(); onExample(null); };
  });
  function commitDraft() {
    const nextDraft = $state.snapshot(draft);
    draftParameters(nextDraft); symbol(nextDraft.symbol);
    if (nextDraft.symbol !== applied.symbol) clearExample();
    else controller?.apply(nextDraft);
    memory.applied = { ...nextDraft }; memory.dirty = false; memory.error = '';
  }
  function apply(event: SubmitEvent) {
    event.preventDefault();
    if (!dirty) return;
    try { commitDraft(); }
    catch (value) { memory.error = (value as Error).message; }
  }
  function cancel() { cancelOrderDraft(memory); }
  function reset() { resetOrderDraft(memory, chartCurrent ?? initial); }
  function close() { clearExample(); onClose(); }
  function clearExample() { exampleSide = null; onExample(null); }
  function toggleExample(side: Side) {
    if (exampleSide === side) { clearExample(); return; }
    if (canExample && controller?.snapshot().directions[side].preview) exampleSide = side;
  }
  function selectReference(side: Side) {
    if (side === memory.referenceSide) return;
    clearExample(); memory.referenceSide = side;
  }
  function referenceKey(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const side = event.key === 'Home' ? 'buy' : event.key === 'End' ? 'sell' : memory.referenceSide === 'buy' ? 'sell' : 'buy';
    selectReference(side); panel?.querySelector<HTMLButtonElement>(`#order-side-${side}`)?.focus();
  }
  function refresh() { if (!dirty && view) void controller?.refresh(); }
  function check() { if (!dirty) void execution.check(); }
  function inspect() { if (!dirty && view) void execution.inspect(view.identity, memory.cleanupOnQuery); }
  function requestSubmit(side: Side) {
    if (dirty || busy || !view?.directions[side].preview) return;
    clearExample(); confirmation = side;
    if (memory.inspectBeforeSubmit) inspect();
  }
  function submit() {
    const side = confirmation;
    if (!side) return;
    if (dirty || busy || !view || !controller) return;
    confirmation = null;
    try { const input = controller.prepare(side); memory.error = ''; void execution.submit(input); }
    catch (value) { memory.error = (value as Error).message; }
  }
  function outside(event: MouseEvent) {
    if (layout === 'inline' || confirmation) return;
    // 内部操作可能先切换条件内容并移除点击目标，须按原始事件路径判断归属。
    const path = event.composedPath();
    if (panel && path.includes(panel) || anchor && path.includes(anchor)) return;
    close();
  }
</script>

<svelte:window onclick={outside} onkeydown={event => { if (event.key === 'Escape' && !overlayOpen && !confirmation) { event.preventDefault(); close(); } }} />
<div class="order-panel" class:inline={layout === 'inline'} style:width={`${width}px`} bind:this={panel} role="dialog" tabindex="-1" aria-label="下单面板"
  data-layout={layout} use:anchorPopup={{ anchor, side: position, enabled: layout === 'floating' }}>
  <header><strong>手动下单</strong><div class="header-actions">
    <button aria-label={layout === 'inline' ? '切换为悬浮' : '切换为平铺'} onclick={() => onLayoutChange(layout === 'inline' ? 'floating' : 'inline')}>{layout === 'inline' ? '悬浮' : '平铺'}</button>
    <button class="close" aria-label="关闭下单面板" onclick={close}>×</button>
  </div></header>
  {#if context.source !== 'ccxt'}
    <p>{context.source.toUpperCase()} · {draft.symbol}</p><p role="status">待实现</p>
    {#if dirty}<p class="warning">仍有未确认的参数修改。</p><form onsubmit={apply}>
      <button type="submit">确认</button><button type="button" onclick={cancel}>取消</button>
    </form>{/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  {:else}
    <p class="identity">CCXT · {context.exchange_name === 'binance' ? 'Binance' : 'Kraken'} · <strong>{context.is_live ? '实盘交易' : '模拟盘交易'}</strong></p>
    <div class="tabs" role="tablist" aria-label="下单模式"><button role="tab" aria-selected="true" aria-controls="order-mode" id="fixed-risk-tab">固定风险金额＋ATR</button></div>
    <div id="order-mode" role="tabpanel" aria-labelledby="fixed-risk-tab">
      <div class="refresh-row">
        <button aria-label="强制刷新" disabled={dirty || !view || view.loading || view.refreshing || view.refreshCooldownSeconds > 0} onclick={refresh}>
          {view?.refreshing ? '刷新中…' : view?.refreshCooldownSeconds ? `强制刷新（${view.refreshCooldownSeconds}s）` : '强制刷新'}
        </button>
        <span class="quote-status" class:stale={!view?.quote || (view?.quoteAgeSeconds ?? 0) > 5} role="timer" aria-label="报价刷新状态" data-testid="order-quote-status">
          ticker：{view?.quoteAgeSeconds == null ? '尚未成功刷新' : `${view.quoteAgeSeconds} 秒前更新`}{view?.quoteAgeSeconds != null && !view.quote ? ' · 报价不可用' : ''}
        </span>
      </div>
      {#if dirty}<p class="warning" role="status">参数有未确认的改动，请确认或取消；下单、强制刷新和查询暂不可用。</p>{/if}
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <details class="group" bind:open={memory.expanded.parameters} data-testid="order-parameters">
        <summary>参数{#if dirty}<span class="section-state">待确认</span>{/if}</summary>
        <form onsubmit={apply} oninput={() => { memory.dirty = true; memory.error = ''; }} novalidate>
          <label class="span-two">下单品种<input name="order.symbol" bind:value={draft.symbol} spellcheck="false" /></label>
          <label>K 线周期<select name="order.timeframe" bind:value={draft.timeframe}>{#each TIMEFRAMES as timeframe}<option value={timeframe}>{timeframe}</option>{/each}</select></label>
          <OrderNumberInput name="order.atr_period" label="ATR 根数" inputmode="numeric" bind:value={draft.atr_period} />
          <OrderNumberInput name="order.risk_amount" label={`风险金额（${view?.data?.market_info.quote ?? '报价币'}）`} bind:value={draft.risk_amount} />
          <OrderNumberInput name="order.atr_multiplier" label="止损 ATR 倍数" bind:value={draft.atr_multiplier} />
          <OrderNumberInput name="order.risk_tolerance" label="金额容差（%）" bind:value={draft.risk_tolerance} />
          <OrderNumberInput name="order.atr_tolerance" label="ATR 倍数容差（%）" bind:value={draft.atr_tolerance} />
          <OrderNumberInput name="order.take_profit_multiplier" label="止盈距离倍数" bind:value={draft.take_profit_multiplier} />
          <div class="field">入场方式<span class="fixed">市价</span></div>
          <div class="actions span-two"><button type="button" onclick={reset}>重置默认值</button><button type="submit" disabled={!dirty}>确认</button><button type="button" disabled={!dirty} onclick={cancel}>取消</button></div>
        </form>
      </details>
      <details class="group" bind:open={memory.expanded.reference} data-testid="order-reference">
        <summary>参考</summary>
        <p class="hint">{exampleSide ? `正在示例：${exampleSide === 'buy' ? '做多' : '做空'}${dirty || !canExample ? '（暂不显示）' : ''}` : '临时画线，关闭或切品种自动清除'}</p>
        {#if view && !matchesChart(chartCurrent, view.identity)}<p class="hint">下单品种或交易身份与当前图表不同，不能画线示例。</p>{/if}
        <p class="reference">当前预览：{view?.identity.symbol ?? applied.symbol} · {view?.parameters.timeframe ?? applied.timeframe} ·
          ATR <span data-testid="order-atr">{view?.atr?.value ?? '等待计算'}</span></p>
        {#if view}<OrderPositions state={progress.inspection} disabled={dirty || busy}
          bind:cleanupOnQuery={memory.cleanupOnQuery} bind:inspectBeforeSubmit={memory.inspectBeforeSubmit} onQuery={inspect} />{/if}
        {#if view?.data}<p class="hint">账户 taker：{percent(view.data.trading_fee.taker)} · {view.data.trading_fee.source === 'binance_commission_rate' ? 'Binance 账户费率' : 'Kraken 账户费率'} · {new Date(view.data.trading_fee.updated_at).toLocaleTimeString()}</p>{/if}
        <div class="tabs" role="tablist" aria-label="参考方向">
          {#each sides as side}
            <button role="tab" id={`order-side-${side}`} aria-controls={`order-reference-${side}`}
              aria-selected={memory.referenceSide === side} tabindex={memory.referenceSide === side ? 0 : -1}
              onclick={() => selectReference(side)} onkeydown={referenceKey}>{side === 'buy' ? '做多参考' : '做空参考'}</button>
          {/each}
        </div>
        {#each sides as side}
          {@const value = view?.directions[side]}
          {@const preview = value?.preview}
          <div class="preview" role="tabpanel" tabindex="0" id={`order-reference-${side}`} aria-labelledby={`order-side-${side}`} hidden={memory.referenceSide !== side}>
            {#if preview}
              <dl>
                <dt>参考入场</dt><dd>{preview.plan.entry_price}（{preview.quote_source === 'ask' ? '卖一' : preview.quote_source === 'bid' ? '买一' : '最新成交'}）</dd>
                <dt>合约数量</dt><dd data-testid={`order-amount-${side}`}>{preview.plan.amount}</dd>
                <dt>基础币数量</dt><dd>{preview.base_amount} {view?.data?.market_info.base}</dd>
                <dt title="合约数量 × 合约乘数 × 参考入场价；不代表保证金">仓位名义价值</dt><dd>{planNotionalValue(preview.plan)} {preview.plan.risk_currency}</dd>
                <dt>价格风险</dt><dd>{preview.price_risk} {preview.plan.risk_currency}</dd>
                <dt>开仓／止损费用</dt><dd>{preview.plan.opening_fee} ／ {preview.plan.estimated_stop_fee} {preview.plan.risk_currency}</dd>
                <dt>金额／ATR 误差</dt><dd>{percent(preview.risk_error)} ／ {percent(preview.atr_error)}</dd>
                <dt>止损／止盈</dt><dd>{preview.plan.stop_price} ／ {preview.plan.take_profit_price}</dd>
                <dt>实际 ATR／止盈倍数</dt><dd>{Number(preview.atr_multiple).toPrecision(6)} ／ {Number(preview.take_profit_multiple).toPrecision(6)}</dd>
                <dt>预计含费风险</dt><dd>{preview.plan.estimated_risk} {preview.plan.risk_currency}</dd>
                <dt>预计止盈净收益</dt><dd>{preview.plan.estimated_take_profit_net} {preview.plan.risk_currency}</dd>
              </dl>
            {:else}<p class="unavailable">{value?.error ?? '正在准备交易资料…'}</p>{/if}
            {#if memory.referenceSide === side}
              <OrderExampleControls {side} active={exampleSide === side} disabled={!canExample || !preview}
                bind:visibility={memory.exampleVisibility} onToggle={() => toggleExample(side)} />
            {/if}
            <button class="submit" disabled={!preview || dirty || busy} onclick={() => requestSubmit(side)}>{side === 'buy' ? '做多 · 市价下单' : '做空 · 市价下单'}</button>
          </div>
        {/each}
        {#each warnings as warning}<p class="warning">{warning.message}</p>{/each}
        <p class="hint">风险含预计开仓及止损手续费；滑点、资金费与未来费率变化不在估计内。保护单独立，剩余挂单需手动管理。</p>
      </details>
      <details class="group" bind:open={memory.expanded.log} data-testid="order-log">
        <summary>日志<span class="section-state">{progress.pending ? '执行中' : progress.checking ? '查询中' : progress.error ? '有错误' : progress.result ? '有结果' : ''}</span></summary>
        {#if !progress.pending && !progress.error && !progress.result}<p class="hint">暂无下单记录。</p>{/if}
        <OrderResult state={progress} checkDisabled={dirty || cleaning} onCheck={check} />
      </details>
    </div>
  {/if}
  {#if confirmation && view}
    <OrderConfirmation state={view} side={confirmation} disabled={dirty || busy}
      inspection={memory.inspectBeforeSubmit ? progress.inspection : undefined}
      onConfirm={submit} onCancel={() => { confirmation = null; }} />
  {/if}
</div>

<style>
  .order-panel { position:fixed; z-index:120; padding:10px; box-sizing:border-box; overflow:auto; background:var(--surface-background); color:var(--text-color); border:1px solid var(--ui-border); border-radius:10px; box-shadow:0 10px 32px var(--ui-shadow); font-size:13px; line-height:1.4; container-type:inline-size; }
  .order-panel.inline { position:relative; z-index:auto; flex:0 0 auto; height:100%; max-width:calc(100% - min(160px,40%)); border-radius:0; box-shadow:none; }
  header { display:flex; align-items:center; justify-content:space-between; }
  .header-actions { display:flex; align-items:center; gap:8px; }
  .identity { color:var(--secondary-text); overflow-wrap:anywhere; }
  .tabs { display:flex; border-bottom:1px solid var(--ui-border); margin:8px 0; }
  .tabs button { flex:1; min-width:0; border-radius:5px 5px 0 0; }
  .tabs button[aria-selected="true"] { border-color:var(--accent); }
  .group { border-top:1px solid var(--ui-border); margin-top:8px; }
  summary { padding:8px 0; font-weight:600; cursor:pointer; }
  summary:focus-visible { outline:2px solid var(--accent); }
  .section-state { margin-left:8px; font-size:11px; font-weight:normal; color:var(--secondary-text); }
  form { display:grid; grid-template-columns:repeat(4,minmax(0,108px)); align-items:end; gap:6px 8px; }
  label,.field { display:flex; flex-direction:column; gap:3px; color:var(--secondary-text); font-size:12px; min-width:0; }
  .span-two { grid-column:span 2; }
  input,select,.fixed { width:100%; height:26px; box-sizing:border-box; border:1px solid var(--ui-border); border-radius:4px; padding:3px 6px; background:var(--field-background); color:var(--text-color); font:inherit; }
  select,.fixed { max-width:80px; }
  input:focus,select:focus { outline:2px solid var(--accent); }
  .fixed { border-color:transparent; }
  button { border:1px solid var(--ui-border); border-radius:5px; padding:5px 8px; background:var(--field-background); color:var(--text-color); cursor:pointer; font:inherit; }
  button:disabled { opacity:.45; cursor:default; } button:focus-visible { outline:2px solid var(--accent); }
  .close { padding:0 4px; border:0; font-size:24px; background:none; }
  .actions { display:flex; align-items:end; justify-content:end; flex-wrap:wrap; gap:6px; }
  .actions button { height:26px; padding:3px 8px; }
  .refresh-row { display:flex; align-items:center; flex-wrap:wrap; gap:8px; }
  .quote-status { font-size:12px; color:var(--muted-text); font-variant-numeric:tabular-nums; }
  .quote-status.stale { color:var(--error-text); }
  .preview { padding:8px; border:1px solid var(--ui-border); border-radius:6px; display:flex; flex-direction:column; overflow-wrap:anywhere; }
  .preview[hidden] { display:none; }
  .preview:focus-visible { outline:2px solid var(--accent); }
  dl { margin:0 0 12px; font-size:12px; flex:1; } dt { color:var(--muted-text); margin-top:6px; } dd { margin:2px 0 0; }
  .submit { width:100%; margin-top:auto; border-color:var(--accent); }
  .reference { font-size:12px; overflow-wrap:anywhere; }
  .hint { font-size:11px; color:var(--muted-text); }
  .warning { padding-left:8px; border-left:2px solid var(--accent); color:var(--secondary-text); font-size:12px; }
  .error { color:var(--error-text); font-size:12px; }
  .unavailable { color:var(--secondary-text); font-size:12px; }
  @container (max-width:440px) { form { grid-template-columns:repeat(2,minmax(0,108px)); } }
  @container (max-width:160px) { form { grid-template-columns:minmax(0,108px); } .span-two { grid-column:auto; } }
</style>
