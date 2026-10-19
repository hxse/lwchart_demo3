<script lang="ts">
  import { onMount } from 'svelte';
  import type { PanelState } from './trading/panel-state';
  import type { Side } from './trading/types';
  import { planNotionalValue } from './trading/risk-model';
  import type { InspectionState } from './trading/inspection';
  import OrderPositionSummary from './OrderPositionSummary.svelte';

  let { state: view, side, disabled, inspection, onConfirm, onCancel }: {
    state: PanelState; side: Side; disabled: boolean; onConfirm: () => void; onCancel: () => void;
    inspection?: InspectionState;
  } = $props();
  let dialog: HTMLDialogElement;
  const direction = $derived(side === 'buy' ? '做多' : '做空');
  const preview = $derived(view.directions[side].preview);
  onMount(() => { dialog.showModal(); return () => dialog.close(); });
</script>

<dialog bind:this={dialog} aria-labelledby="order-confirmation-title" oncancel={event => { event.preventDefault(); onCancel(); }}>
  <h3 id="order-confirmation-title">确认市价下单</h3>
  <p><strong>{view.identity.is_live ? '实盘交易' : '模拟盘交易'} · {direction}</strong><br />
    {view.identity.exchange_name === 'binance' ? 'Binance' : 'Kraken'} · {view.identity.symbol}</p>
  {#if preview}
    <dl>
      <dt>参考入场／合约数量</dt><dd>{preview.plan.entry_price} ／ {preview.plan.amount}</dd>
      <dt title="合约数量 × 合约乘数 × 参考入场价；不代表保证金">仓位名义价值</dt><dd>{planNotionalValue(preview.plan)} {preview.plan.risk_currency}</dd>
      <dt>止损／止盈</dt><dd>{preview.plan.stop_price} ／ {preview.plan.take_profit_price}</dd>
      <dt>预计含费风险</dt><dd>{preview.plan.estimated_risk} {preview.plan.risk_currency}</dd>
      <dt>预计止盈净收益</dt><dd>{preview.plan.estimated_take_profit_net} {preview.plan.risk_currency}</dd>
    </dl>
  {:else}<p class="error" role="alert">{view.directions[side].error}</p>{/if}
  <p class="hint">参考值持续更新，按确认时的最新有效参考提交。</p>
  {#if inspection}<OrderPositionSummary state={inspection} />{/if}
  <div class="actions">
    <button onclick={onCancel}>取消下单</button>
    <button class="confirm" disabled={disabled || !preview} onclick={onConfirm}>确认{direction}</button>
  </div>
</dialog>

<style>
  dialog { width:360px; max-width:calc(100vw - 32px); max-height:calc(100dvh - 32px); box-sizing:border-box; margin:auto; padding:18px; overflow:auto; border:1px solid var(--ui-border); border-radius:10px; background:var(--surface-background); color:var(--text-color); font:inherit; font-size:14px; overflow-wrap:anywhere; }
  dialog::backdrop { background:rgb(0 0 0 / .45); }
  h3 { font-size:16px; margin:0 0 12px; }
  dl { margin:12px 0; } dt { color:var(--muted-text); margin-top:8px; } dd { margin:3px 0 0; }
  .hint { color:var(--muted-text); font-size:12px; } .error { color:var(--error-text); }
  .actions { display:flex; justify-content:end; flex-wrap:wrap; gap:8px; }
  button { font:inherit; padding:6px 10px; border:1px solid var(--ui-border); border-radius:5px; background:var(--field-background); color:var(--text-color); cursor:pointer; }
  .confirm { border-color:var(--accent); } button:disabled { opacity:.45; cursor:default; }
  button:focus-visible { outline:2px solid var(--accent); }
</style>
