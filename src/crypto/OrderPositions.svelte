<script lang="ts">
  import type { InspectionState } from './trading/inspection';
  import type { TradeIdentity } from './trading/types';
  import { sameTradeIdentity } from './trading/preview';
  import OrderPositionSummary from './OrderPositionSummary.svelte';

  let { identity, state, cleanupOnQuery = $bindable(), inspectBeforeSubmit = $bindable(), disabled, onQuery }: {
    identity: TradeIdentity; state: InspectionState; cleanupOnQuery: boolean; inspectBeforeSubmit: boolean;
    disabled: boolean; onQuery: () => void;
  } = $props();
  const label = $derived(cleanupOnQuery ? '查询并清理' : '查询持仓');
</script>

<div class="query-actions">
  <button aria-label={label} disabled={disabled || state.pending} onclick={onQuery}>{state.pending ? '查询中…' : label}</button>
  <label><input type="checkbox" bind:checked={cleanupOnQuery} disabled={state.pending} />空仓时清理只减仓条件单</label>
  <label><input type="checkbox" bind:checked={inspectBeforeSubmit} disabled={state.pending} />下单前自动查询</label>
  {#if cleanupOnQuery}<small>有开仓挂单时跳过清理；开启自动查询后，进入确认框即可能撤单。</small>{/if}
</div>
{#if state.identity && !sameTradeIdentity(identity, state.identity)}<p class="previous">以下为上次操作的品种，当前下单品种是 {identity.symbol}。</p>{/if}
<OrderPositionSummary {state} />

<style>
  .query-actions { display:flex; flex-direction:column; align-items:start; gap:6px; margin:8px 0; }
  button { font:inherit; padding:5px 8px; border:1px solid var(--ui-border); border-radius:5px; background:var(--field-background); color:var(--text-color); cursor:pointer; }
  button:disabled { opacity:.45; cursor:default; } button:focus-visible,input:focus-visible { outline:2px solid var(--accent); }
  label { display:flex; align-items:start; gap:5px; font-size:12px; cursor:pointer; }
  input { flex:none; margin:2px 0 0; accent-color:var(--accent); }
  small,.previous { font-size:11px; color:var(--muted-text); }
</style>
