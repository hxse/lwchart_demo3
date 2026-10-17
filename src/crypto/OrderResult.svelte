<script lang="ts">
  import type { ExecutionState } from './trading/execution-state';
  import { orderLegs } from './trading/identity';
  import { planNotionalValue } from './trading/risk-model';
  let { state, onCheck, checkDisabled = false }: { state: ExecutionState; onCheck: () => void; checkDisabled?: boolean } = $props();
  const names = { entry: '入场', stop_loss: '止损', take_profit: '止盈' };
  const writes = { not_sent: '未提交', rejected: '失败', accepted: '已受理', unknown: '结果未知' };
  const confirmations = { unconfirmed: '未确认', unfilled: '未成交', partially_filled: '部分成交', filled: '已成交', open: '已挂单',
    canceled: '已撤销', closed: '已关闭', rejected: '已拒绝', expired: '已过期' };
  const result = $derived(state.result);
</script>

<section class="result" aria-label="下单结果" aria-live="polite">
  {#if state.pending}<p role="status">正在执行：先核实入场成交，再提交止损和止盈。关闭面板不会取消本轮。</p>{/if}
  {#if state.error}<p class="error" role="alert">{state.error}</p>{/if}
  {#if result}
    <header><strong>最近一轮结果</strong><button disabled={checkDisabled || state.pending || state.checking} onclick={onCheck}>{state.checking ? '查询中…' : '查询结果'}</button></header>
    <p class="identity">{result.identity.exchange_name} · {result.identity.is_live ? '实盘' : '模拟盘'} · {result.identity.symbol}</p>
    {#each orderLegs as leg}
      {@const value = result.legs[leg]}
      <div class="leg" data-leg={leg}>
        <strong>{names[leg]} · {writes[value.write_state]}{value.confirmation !== 'unconfirmed' ? ` · ${confirmations[value.confirmation]}` : ''}</strong>
        <code>{value.order_id ?? value.client_order_id}</code>
        {#if value.filled !== null}<span>成交数量 {value.filled}{value.average !== null ? ` · 均价 ${value.average}` : ''}</span>{/if}
        {#if value.error}<span class="error">执行反馈：{value.error.message}（{value.error.code}）</span>{/if}
      </div>
    {/each}
    {#if result.submitted_plan}
      {@const plan = result.submitted_plan}
      <h4>本轮成交估算（提交时）</h4>
      <dl data-testid="order-submitted-plan">
        <dt>成交均价／合约数量</dt><dd>{plan.entry_price} ／ {plan.amount}</dd>
        <dt title="本轮成交数量 × 合约乘数 × 成交均价；不代表保证金或账户总仓位">仓位名义价值</dt><dd>{planNotionalValue(plan)} {plan.risk_currency}</dd>
        <dt>止损／止盈</dt><dd>{plan.stop_price} ／ {plan.take_profit_price}</dd>
        <dt>开仓费用（{plan.opening_fee_source === 'reported' ? '已报告' : '估计'}）</dt><dd>{plan.opening_fee} {plan.risk_currency}</dd>
        <dt>预计含费风险</dt><dd>{plan.estimated_risk} {plan.risk_currency}</dd>
        <dt>预计止盈净收益</dt><dd>{plan.estimated_take_profit_net} {plan.risk_currency}</dd>
      </dl>
      <p class="hint">按本轮成交数量与均价计算，风险和收益为提交时估算，不随后续报价或查询重算。</p>
    {:else}
      <p class="hint">本轮暂无可用的成交估算。</p>
    {/if}
    {#each result.warnings as warning}<p class="warning">{warning.message}</p>{/each}
    {#each result.verification.issues as issue}<p class="warning">核对：{issue.message}</p>{/each}
    <details><summary>账户持仓快照</summary>
      {#if result.verification.positions === null}<p>持仓未确认。</p>
      {:else if !result.verification.positions.length}<p>此次查询为空仓。</p>
      {:else}{#each result.verification.positions as position}<p>{position.side === 'long' ? '多' : position.side === 'short' ? '空' : '方向未知'} · 数量 {position.contracts ?? '未知'} · 均价 {position.entry_price ?? '未知'}</p>{/each}{/if}
    </details>
    <p class="hint">查询只更新订单状态，不重算保护计划、不补单、不平仓。止盈与止损独立，同品种旧仓可合并或抵销，剩余挂单需手动管理。</p>
  {/if}
</section>

<style>
  .result { font-size:12px; overflow-wrap:anywhere; }
  header { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:12px; }
  .identity,.hint { color:var(--muted-text); }
  h4 { font-size:inherit; margin:12px 0 8px; }
  dl { margin:0 0 12px; } dt { color:var(--muted-text); margin-top:6px; } dd { margin:2px 0 0; }
  .leg { border-top:1px solid var(--ui-border); padding:8px 0; display:flex; flex-direction:column; gap:4px; }
  code { color:var(--secondary-text); font-size:11px; }
  .error { color:var(--error-text); }
  .warning { padding-left:8px; border-left:2px solid var(--accent); color:var(--secondary-text); }
  button { font:inherit; padding:5px 8px; border:1px solid var(--ui-border); border-radius:5px; background:var(--field-background); color:var(--text-color); cursor:pointer; }
  button:disabled { opacity:.5; cursor:default; } details { color:var(--secondary-text); }
</style>
