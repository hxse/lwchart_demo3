<script lang="ts">
  import { positionKind, type InspectionState } from './trading/inspection';

  let { state }: { state: InspectionState } = $props();
  const rows = $derived(state.snapshot?.positions.filter(position => position.contracts !== '0') ?? []);
  const uncertain = $derived(rows.some(position => position.contracts === null));
  const kind = $derived(state.pending ? 'loading' : positionKind(state.snapshot));
  const writes = { accepted: '请求已受理', rejected: '撤单被拒绝', not_sent: '未发出', unknown: '受理结果未知' };
  const confirmations = { canceled: '已确认取消', absent: '已不在挂单列表，最终状态未确认', open: '仍在挂单列表', unknown: '核对未完成' };
</script>

{#if state.identity}
<section class="positions" class:held={kind === 'held'} class:unknown={kind === 'unknown'} class:flat={kind === 'flat'}
  role="status" aria-label="当前账户仓位" data-state={kind}>
  <strong class="title">{kind === 'loading' ? state.cleanup ? '正在查询／清理…' : '正在查询当前仓位…'
    : kind === 'held' ? '已有仓位' : kind === 'flat' ? '当前空仓' : '持仓未能确认'}</strong>
  <small>{state.identity.exchange_name === 'binance' ? 'Binance' : 'Kraken'} · {state.identity.is_live ? '实盘' : '模拟盘'} · {state.identity.symbol}</small>
  {#if state.error}<p class="error">{state.error}</p>{/if}
  {#if !state.pending}
    {#if rows.length}
      <ul>{#each rows as position}<li>
        <span class="badge" class:long={position.side === 'long'} class:short={position.side === 'short'}>{position.side === 'long' ? '多头' : position.side === 'short' ? '空头' : '方向未确认'}</span>
        <strong>合约数量 {position.contracts ?? '未知'}</strong>
        <span>持仓均价 {position.entry_price ?? '未知'}</span>
      </li>{/each}</ul>
    {:else if kind === 'flat'}<p>本次查询未发现该品种持仓。</p>{/if}
    {#if kind === 'held'}<p>本次下单可能增加、合并或抵销已有仓位，请核对方向和数量。</p>{/if}
    {#if uncertain}<p>部分持仓数量未知，不能按空仓处理。</p>{/if}
    {#if state.snapshot}<small>持仓查询于 {new Date(state.snapshot.checked_at).toLocaleTimeString()} · 本轮快照</small>{/if}
  {/if}
  {#if state.result}
    <div class="cleanup-result" aria-label="条件单清理结果">
      <strong>{state.result.message}</strong>
      {#if state.result.orders.length}<ul>{#each state.result.orders as order}<li data-order-id={order.id}>
        <strong>订单 {order.id}</strong>
        <span>{writes[order.write_state]} · {confirmations[order.confirmation]}</span>
        {#if order.error}<span class="error">{order.error.message}（{order.error.code}）</span>{/if}
      </li>{/each}</ul>{/if}
      {#each state.result.issues as issue}<p class="error">{issue.message}（{issue.code}）</p>{/each}
      <small>清理核对于 {new Date(state.result.checked_at).toLocaleTimeString()}</small>
    </div>
  {/if}
  {#if state.cleanup}<p class="notice">取消下单不会恢复已撤条件单。{state.pending ? '本轮结束前暂不能开仓。' : '失败或未确认项请到交易所核对，不会自动重试。'}</p>{/if}
</section>
{/if}

<style>
  .positions { border:2px solid var(--ui-border); border-radius:7px; padding:8px; margin:8px 0; font-size:12px; overflow-wrap:anywhere; }
  .title { display:block; font-size:16px; }
  .held,.unknown { border-color:#d97706; background:color-mix(in srgb,#f59e0b 12%,var(--surface-background)); }
  .flat { border-color:#10b981; background:color-mix(in srgb,#10b981 8%,var(--surface-background)); }
  p { margin:7px 0; } small { color:var(--muted-text); }
  ul { list-style:none; padding:0; margin:8px 0; max-height:180px; overflow:auto; }
  li { display:flex; flex-direction:column; align-items:start; gap:4px; padding:6px 0; }
  li strong { font-size:14px; }
  .badge { padding:2px 6px; border-radius:4px; border:1px solid currentColor; }
  .long { color:#10b981; } .short,.error { color:var(--error-text); }
  .cleanup-result { border-top:1px solid var(--ui-border); margin-top:8px; padding-top:8px; }
  .cleanup-result > strong,.cleanup-result > small { display:block; margin-bottom:4px; }
  .notice { color:var(--secondary-text); }
</style>
