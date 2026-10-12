<script lang="ts">
  import { TIMEFRAMES, type Timeframe } from './options';
  import type { ChartIndicatorDraft } from './chartIndicators';
  import IndicatorEditor from './IndicatorEditor.svelte';
  let { timeframes = $bindable(), drafts = $bindable(), common }: {
    timeframes: Timeframe[]; drafts: ChartIndicatorDraft[]; common: string;
  } = $props();
  let selected = $state(0);
  $effect(() => { if (selected>=timeframes.length) selected = timeframes.length-1; });
  function mode(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value as ChartIndicatorDraft['mode'];
    const current = drafts[selected]!;
    if (value==='custom' && !current.customized) { current.value=common; current.customized=true; }
    current.mode=value;
  }
</script>

<fieldset class="window-fields">
  <legend>窗口设置</legend>
  <div class="tabs" role="tablist" aria-label="图表窗口">
    {#each timeframes as period,index}
      <button type="button" role="tab" aria-selected={selected===index} aria-controls="window-panel"
        onclick={() => { selected=index; }}>窗口 {index+1} · {period}</button>
    {/each}
  </div>
  {#if drafts[selected] && timeframes[selected]}
    <div class="fields" id="window-panel" role="tabpanel" aria-label={`窗口 ${selected+1} 设置`}>
      <label>周期<select name={`timeframe-${selected}`} bind:value={timeframes[selected]}>
        {#each TIMEFRAMES as period}<option value={period}>{period}</option>{/each}
      </select></label>
      <label>指标模式<select name="indicator_mode" value={drafts[selected].mode} onchange={mode}>
        <option value="inherit">继承公共</option><option value="custom">独立配置</option><option value="none">无指标</option>
      </select></label>
      {#if drafts[selected].mode==='custom'}
        <IndicatorEditor label="独立指标" name={`chart.${selected+1}.indicators`} bind:value={drafts[selected].value}
          defaultValue={common} defaultLabel="填入公共指标" />
      {:else if drafts[selected].mode==='inherit'}
        <div class="hint">使用公共指标：{common}</div>
      {:else}
        <div class="hint">此窗口仅显示行情主图。</div>
      {/if}
    </div>
  {/if}
</fieldset>

<style>
  .window-fields { border:1px solid var(--ui-border); border-radius:7px; margin:0; padding:0; min-width:0; overflow:hidden; }
  legend { margin-left:8px; padding:0 5px; font-size:11px; color:var(--secondary-text); }
  .tabs { display:flex; gap:2px; padding:4px 4px 0; border-bottom:1px solid var(--ui-border); background:var(--toggle-background); }
  button { cursor:pointer; flex:1; min-width:0; padding:6px 2px; font-size:10px; color:var(--secondary-text); border:1px solid transparent; border-radius:5px 5px 0 0; background:transparent; }
  [aria-selected="true"] { color:var(--text-color); border-color:var(--ui-border); border-bottom-color:var(--surface-background); background:var(--surface-background); margin-bottom:-1px; }
  .fields { display:flex; flex-direction:column; gap:13px; padding:12px; }
  label { display:flex; flex-direction:column; gap:6px; font-size:11px; color:var(--secondary-text); }
  select { box-sizing:border-box; width:100%; border:1px solid var(--ui-border); padding:8px; border-radius:5px; background:var(--field-background); color:var(--text-color); font-size:12px; }
  select:focus { outline:2px solid var(--accent); border-color:var(--accent); }
  .hint { margin-top:-8px; font-size:10px; color:var(--muted-text); overflow-wrap:anywhere; }
</style>
