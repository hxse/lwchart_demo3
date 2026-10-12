<script lang="ts">
  import { computableIndicatorTypes, unavailableIndicatorTypes, indicatorSupport } from '../indicators/support';
  import { indicatorDefinition } from '../indicators/definitions';
  import { MAX_INDICATORS_PER_LIST } from '../indicators/parameters';
  let { value = $bindable(), label = '技术指标', name = 'indicators', defaultValue, defaultLabel = '默认 EMA' }: {
    value: string; label?: string; name?: string; defaultValue: string; defaultLabel?: string;
  } = $props();
</script>

<label>{label}<textarea {name} bind:value rows="3" spellcheck="false"></textarea></label>
<p class="hint">支持 {computableIndicatorTypes().join('、')}；如 ema,14;rsi,14;macd,12,26,9。最多 {MAX_INDICATORS_PER_LIST} 项。</p>
{#each unavailableIndicatorTypes() as type}
  <p class="hint">{indicatorDefinition(type).title} 暂不支持计算：{indicatorSupport(type).reason}。</p>
{/each}
<div class="small-actions">
  <button type="button" onclick={() => { value = 'none'; }}>无指标</button>
  <button type="button" onclick={() => { value = defaultValue; }}>{defaultLabel}</button>
</div>

<style>
  label { display:flex; flex-direction:column; gap:6px; font-size:11px; color:var(--secondary-text); min-width:0; }
  textarea { box-sizing:border-box; width:100%; border:1px solid var(--ui-border); padding:8px; border-radius:5px; background:var(--field-background); color:var(--text-color); font-size:12px; font-family:inherit; }
  textarea:focus { outline:2px solid var(--accent); border-color:var(--accent); }
  .hint { margin:-8px 0 0; font-size:10px; color:var(--muted-text); }
  .small-actions { display:flex; gap:8px; margin-top:-7px; }
  button { cursor:pointer; border:1px solid var(--ui-border); background:var(--field-background); color:var(--secondary-text); padding:4px 8px; border-radius:5px; font-size:10px; }
</style>
