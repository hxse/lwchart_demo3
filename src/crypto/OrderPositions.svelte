<script lang="ts">
  import { untrack } from 'svelte';
  import { OrderClient, OrderHttpError } from './trading/client';
  import type { PositionSnapshot, TradeIdentity } from './trading/types';

  let { identity, disabled = false }: { identity: TradeIdentity; disabled?: boolean } = $props();
  const client = new OrderClient();
  const key = $derived(JSON.stringify(identity));
  let request: AbortController | undefined;
  let loading = $state(false);
  let snapshot = $state.raw<PositionSnapshot | null>(null);
  let error = $state('');
  const rows = $derived(snapshot?.positions.filter(position => position.contracts !== '0') ?? []);
  const held = $derived(rows.some(position => position.contracts !== null));
  const uncertain = $derived(rows.some(position => position.contracts === null));
  const kind = $derived(loading ? 'loading' : !snapshot ? 'unknown' : held ? 'held' : uncertain ? 'unknown' : 'flat');
  $effect(() => {
    key;
    // 身份变化只清理旧快照；持仓展示始终由用户显式查询。
    return untrack(() => {
      loading = false; snapshot = null; error = '';
      return () => request?.abort();
    });
  });
  async function query() {
    if (disabled || loading) return;
    const abort = new AbortController();
    request = abort;
    loading = true; snapshot = null; error = '';
    try {
      const value = await client.positions({ ...identity }, abort.signal);
      if (!abort.signal.aborted) snapshot = value;
    } catch (value) {
      if (!abort.signal.aborted) error = value instanceof OrderHttpError ? value.message : '持仓查询未完成，请到交易所核对';
    } finally { if (!abort.signal.aborted) loading = false; }
  }
</script>

<div class="query-actions">
  <button aria-label="查询持仓" disabled={disabled || loading} onclick={query}>{loading ? '查询中…' : '查询持仓'}</button>
  <small>仅手动刷新</small>
</div>
{#if loading || snapshot || error}
<section class="positions" class:held={kind === 'held'} class:unknown={kind === 'unknown'} class:flat={kind === 'flat'}
  role="status" aria-label="当前账户仓位" data-state={kind}>
  <strong class="title">{kind === 'loading' ? '正在查询当前仓位…' : kind === 'held' ? '已有仓位' : kind === 'flat' ? '当前空仓' : '持仓未能确认'}</strong>
  <small>{identity.symbol}</small>
  {#if !loading}
    {#if !snapshot}<p>{error || '持仓查询未完成，请到交易所核对'}</p>
    {:else if rows.length}
      <ul>{#each rows as position}<li>
        <span class="badge" class:long={position.side === 'long'} class:short={position.side === 'short'}>{position.side === 'long' ? '多头' : position.side === 'short' ? '空头' : '方向未确认'}</span>
        <strong>合约数量 {position.contracts ?? '未知'}</strong>
        <span>持仓均价 {position.entry_price ?? '未知'}</span>
      </li>{/each}</ul>
    {:else}<p>本次查询未发现该品种持仓。</p>{/if}
    {#if kind === 'held'}<p>本次下单可能增加、合并或抵销已有仓位，请核对方向和数量。</p>{/if}
    {#if uncertain}<p>部分持仓数量未知，不能按空仓处理。</p>{/if}
    {#if snapshot}<small>查询于 {new Date(snapshot.checked_at).toLocaleTimeString()} · 手动查询快照</small>{/if}
  {/if}
</section>
{/if}

<style>
  .query-actions { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin:8px 0; }
  button { font:inherit; padding:5px 8px; border:1px solid var(--ui-border); border-radius:5px; background:var(--field-background); color:var(--text-color); cursor:pointer; }
  button:disabled { opacity:.45; cursor:default; } button:focus-visible { outline:2px solid var(--accent); }
  .positions { border:2px solid var(--ui-border); border-radius:7px; padding:8px; margin:8px 0; font-size:12px; overflow-wrap:anywhere; }
  .title { display:block; font-size:16px; }
  .held,.unknown { border-color:#d97706; background:color-mix(in srgb,#f59e0b 12%,var(--surface-background)); }
  .flat { border-color:#10b981; background:color-mix(in srgb,#10b981 8%,var(--surface-background)); }
  p { margin:7px 0; } small { color:var(--muted-text); }
  ul { list-style:none; padding:0; margin:8px 0; max-height:180px; overflow:auto; }
  li { display:flex; flex-direction:column; align-items:start; gap:4px; padding:6px 0; }
  li strong { font-size:14px; }
  .badge { padding:2px 6px; border-radius:4px; border:1px solid currentColor; }
  .long { color:#10b981; } .short { color:#ef4444; }
</style>
