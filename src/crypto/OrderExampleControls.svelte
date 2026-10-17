<script lang="ts">
  import type { ExampleVisibility } from './trading/preview';
  import type { Side } from './trading/types';

  let { side, active, disabled, visibility = $bindable(), onToggle }: {
    side: Side; active: boolean; disabled: boolean; visibility: ExampleVisibility; onToggle: () => void;
  } = $props();
  let expanded = $state(false);
  let root = $state<HTMLDivElement>(), trigger = $state<HTMLButtonElement>();
  const hasLines = $derived(Object.values(visibility).some(Boolean));
  function outside(event: MouseEvent) { if (expanded && root && !event.composedPath().includes(root)) expanded = false; }
  function escape(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !expanded) return;
    event.preventDefault(); event.stopPropagation(); expanded = false; trigger?.focus();
  }
</script>

<svelte:window onclick={outside} />
<div class="example-control" bind:this={root}>
  <div class="split-button">
    <button class="example" aria-pressed={active} disabled={!active && (disabled || !hasLines)}
      title={!hasLines && !active ? '请先勾选要显示的示例线' : undefined}
      onclick={() => { expanded = false; onToggle(); }} onkeydown={escape}>{active ? '取消示例' : '画线示例'}</button>
    <button class="options-toggle" aria-label="示例线显示选项" aria-expanded={expanded} aria-controls={`example-options-${side}`}
      onclick={() => { expanded = !expanded; }} onkeydown={escape} bind:this={trigger}>▾</button>
  </div>
  {#if expanded}
    <div class="options" id={`example-options-${side}`} role="group" aria-label="示例线选项">
      <label><input type="checkbox" bind:checked={visibility['take-profit']} onkeydown={escape} />止盈线显示</label>
      <label><input type="checkbox" bind:checked={visibility.stop} onkeydown={escape} />止损线显示</label>
      <label><input type="checkbox" bind:checked={visibility.entry} onkeydown={escape} />仓位线显示</label>
      <p>仓位线表示参考入场价。</p>
    </div>
  {/if}
  {#if !hasLines}<p class="empty">未选择显示线</p>{/if}
</div>

<style>
  .example-control { position:relative; margin-bottom:6px; }
  .split-button { display:flex; width:100%; }
  button { border:1px solid var(--ui-border); padding:5px 8px; background:var(--field-background); color:var(--text-color); cursor:pointer; font:inherit; }
  button:disabled { opacity:.45; cursor:default; } button:focus-visible,input:focus-visible { outline:2px solid var(--accent); }
  .example { flex:1; min-width:0; border-radius:5px 0 0 5px; border-right:0; }
  .example[aria-pressed="true"],.options-toggle[aria-expanded="true"] { border-color:var(--accent); }
  .options-toggle { width:30px; flex:none; padding:5px 4px; border-radius:0 5px 5px 0; }
  .options { position:absolute; z-index:2; bottom:calc(100% + 4px); left:0; right:0; padding:8px; border:1px solid var(--ui-border); border-radius:6px; background:var(--surface-background); box-shadow:0 4px 16px var(--ui-shadow); font-size:12px; }
  label { display:flex; align-items:center; gap:8px; padding:5px 0; cursor:pointer; }
  input { margin:0; accent-color:var(--accent); }
  p { font-size:11px; color:var(--muted-text); margin:6px 0 0; }
</style>
