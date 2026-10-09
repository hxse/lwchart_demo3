<script lang="ts">
  import { untrack } from 'svelte';
  import { currentWatchIndex, adjacentWatch, shortWatchLabel, type WatchEntry } from './watchlist';
  import type { DashboardSettings, DockPosition } from './options';
  import { anchorPopup } from './popup';
  let { entries, flat, position, current, error, onSelect, onEdit, onFlatChange }: {
    entries: WatchEntry[]; flat: boolean; position: DockPosition; current?: DashboardSettings; error: string;
    onSelect: (entry: WatchEntry) => boolean; onEdit: () => void; onFlatChange: (value: boolean) => boolean;
  } = $props();
  const HOVER_MARGIN = 12;
  let opened = $state(false);
  let locked = $state(false);
  let pointerVisible = $state(false);
  let focusVisible = $state(false);
  const controlsVisible = $derived(pointerVisible || focusVisible);
  let dock = $state<HTMLDivElement>();
  let toggle = $state<HTMLButtonElement>();
  let controls = $state<HTMLDivElement>();
  let panel = $state<HTMLElement>();
  let list = $state<HTMLDivElement>();
  let rail = $state<HTMLDivElement>();
  const active = $derived(current ? currentWatchIndex(entries, current) : -1);
  $effect(() => {
    if (!entries[active]) return;
    if (opened && list) center(list, active);
    if (flat && rail) center(rail, active);
  });
  $effect(() => { if (flat) { pointerVisible = false; focusVisible = false; } });
  $effect(() => { if (!entries.length && !error && !flat) opened = false; });
  function center(container: HTMLDivElement, index: number) {
    const horizontal = container === rail && (position === 'top' || position === 'bottom');
    untrack(() => {
      const selected = container.querySelector<HTMLElement>(`[data-watch-index="${index}"]`);
      if (!selected) return;
      // 只滚动列表内部；浏览器在首尾自动限制到可滚动范围。
      if (horizontal) container.scrollLeft += selected.getBoundingClientRect().left - container.getBoundingClientRect().left
        + (selected.offsetWidth - container.clientWidth) / 2;
      else container.scrollTop += selected.getBoundingClientRect().top - container.getBoundingClientRect().top
        + (selected.offsetHeight - container.clientHeight) / 2;
    });
  }
  function choose(entry: WatchEntry) { if (onSelect(entry) && !locked) opened = false; }
  function edit() { if (!locked) opened = false; onEdit(); }
  function outside(event: MouseEvent) {
    if (opened && !locked && event.target instanceof Node && !panel?.contains(event.target) && !dock?.contains(event.target)) opened = false;
  }
  function trackPointer(event: PointerEvent) {
    if (flat || !controlsVisible || !toggle || !controls) return;
    const button = toggle.getBoundingClientRect();
    const arrows = controls.getBoundingClientRect();
    // 范围覆盖按钮与下方控制，再向四周扩展 12px；不依赖残留焦点维持显示。
    pointerVisible = event.clientX >= Math.min(button.left, arrows.left) - HOVER_MARGIN
      && event.clientX <= Math.max(button.right, arrows.right) + HOVER_MARGIN
      && event.clientY >= Math.min(button.top, arrows.top) - HOVER_MARGIN
      && event.clientY <= Math.max(button.bottom, arrows.bottom) + HOVER_MARGIN;
    if (!pointerVisible) focusVisible = false;
  }
  function adjacent(direction: -1 | 1) {
    if (!current) return;
    const entry = adjacentWatch(entries, current, direction);
    if (entry) onSelect(entry);
  }
</script>

<svelte:window onclick={outside} onpointermove={trackPointer}
  onpointerout={event => { if (!event.relatedTarget) { pointerVisible = false; focusVisible = false; } }}
  onblur={() => { pointerVisible = false; focusVisible = false; }} />
<div class="dock" data-position={position} bind:this={dock} role="group" aria-label="自选控制"
  onfocusout={event => { if (!(event.relatedTarget instanceof Node) || !dock?.contains(event.relatedTarget)) focusVisible = false; }}>
  <button class="toggle" aria-label={entries.length || error || flat ? '展开自选列表' : '新建自选'} aria-expanded={opened}
    bind:this={toggle}
    onpointerenter={event => { if (!flat && event.pointerType !== 'touch') pointerVisible = true; }}
    onfocus={event => { if (!flat && event.currentTarget.matches(':focus-visible')) focusVisible = true; }}
    title={entries.length || error || flat ? '自选列表' : '新建自选'} onclick={() => { if (!entries.length && !error && !flat) onEdit(); else opened = !opened; }}>☰</button>
  {#if !flat}
  <div class="shortcuts" class:visible={controlsVisible} bind:this={controls} use:anchorPopup={{ anchor: toggle, side: position, controls: true }}>
    <button aria-label="上一个自选" disabled={!entries.length || !current} onclick={() => adjacent(-1)}>↑</button>
    <button aria-label="下一个自选" disabled={!entries.length || !current} onclick={() => adjacent(1)}>↓</button>
  </div>
  {:else}
    <div class="flat-rail" aria-label="平铺自选栏" bind:this={rail}>
      <button aria-label="平铺上一个自选" disabled={!entries.length || !current} onclick={() => adjacent(-1)}>↑</button>
      <button aria-label="平铺下一个自选" disabled={!entries.length || !current} onclick={() => adjacent(1)}>↓</button>
      <button aria-label="平铺编辑自选" onclick={edit}>编辑</button>
      {#each entries as item, index}
        <button class="flat-entry" class:active={index === active} data-watch-index={index}
          aria-label={`自选 ${item.provider} ${item.symbol}`} aria-current={index === active ? 'true' : undefined}
          disabled={!current} title={`${item.provider} · ${item.symbol}`} onclick={() => choose(item)}>{shortWatchLabel(item)}</button>
      {/each}
    </div>
  {/if}
</div>
{#if opened && (entries.length || error || flat)}
  <aside class="watch-panel" aria-label="自选列表" bind:this={panel} use:anchorPopup={{ anchor: toggle, side: position }}>
    <header>
      <button aria-label="列表上一个自选" disabled={!entries.length || !current} onclick={() => adjacent(-1)}>↑</button>
      <button aria-label="列表下一个自选" disabled={!entries.length || !current} onclick={() => adjacent(1)}>↓</button>
      <button class="edit" aria-label="编辑自选" onclick={edit}>编辑</button>
      <button aria-label={flat ? '关闭平铺自选' : '开启平铺自选'} aria-pressed={flat} title="平铺显示自选" onclick={() => onFlatChange(!flat)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="4" rx="1" /><rect x="5" y="10" width="14" height="4" rx="1" /><rect x="5" y="17" width="14" height="4" rx="1" /></svg>
      </button>
      <button class="lock" aria-label={locked ? '解锁自选面板' : '锁定自选面板'} aria-pressed={locked}
        title={locked ? '已锁定：点击品种或外部保持展开' : '未锁定：点击品种或外部收起'} onclick={() => { locked = !locked; }}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" /><path d={locked ? 'M8 10V7a4 4 0 0 1 8 0v3' : 'M8 10V7a4 4 0 0 1 8 0v1'} /><path d="M12 14v3" /></svg>
      </button>
      <button aria-label="折叠自选列表" onclick={() => { opened = false; }}>×</button>
    </header>
    <div class="list" bind:this={list}>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      {#each entries as item, index}
        <button class="entry" data-watch-index={index} class:active={index === active} aria-current={index === active ? 'true' : undefined}
          disabled={!current} title={`${item.provider} · ${item.symbol}`} onclick={() => choose(item)}>
          <small>{item.provider === 'tq' ? 'TQ' : item.provider === 'binance' ? 'Binance' : 'Kraken'}</small>
          <span>{item.symbol}</span>
        </button>
      {/each}
    </div>
  </aside>
{/if}

<style>
  .dock { position:relative; flex:1; min-height:0; min-width:0; width:38px; display:flex; flex-direction:column; align-items:center; gap:4px; }
  .dock[data-position="top"],.dock[data-position="bottom"] { flex-direction:row; width:auto; height:36px; }
  .shortcuts { position:fixed; z-index:125; display:flex; gap:4px; opacity:0; visibility:hidden; pointer-events:none; }
  .shortcuts button { width:32px; height:28px; padding:0; }
  .shortcuts.visible { opacity:1; visibility:visible; pointer-events:auto; }
  .flat-rail { flex:1; min-height:0; min-width:0; width:38px; display:flex; flex-direction:column; align-items:center; gap:4px; overflow-y:auto; overflow-x:hidden; scrollbar-width:thin; scrollbar-color:var(--ui-border) var(--surface-background); }
  [data-position="top"] .flat-rail,[data-position="bottom"] .flat-rail { flex-direction:row; width:auto; height:36px; overflow-x:auto; overflow-y:hidden; }
  .flat-rail button { width:32px; height:30px; flex-shrink:0; padding:4px 3px; font-size:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; box-sizing:border-box; }
  .flat-entry.active { color:var(--text-color); border-color:var(--accent); background:var(--surface-background); }
  button { border:1px solid var(--ui-border); color:var(--secondary-text); background:var(--toggle-background); cursor:pointer; border-radius:5px; padding:4px 7px; font:inherit; font-size:12px; }
  button:hover { background:var(--surface-background); color:var(--text-color); }
  button:disabled { opacity:.4; cursor:default; } button:focus-visible { outline:2px solid var(--accent); }
  .toggle { width:32px; height:30px; flex-shrink:0; padding:0; box-sizing:border-box; font-size:18px; }
  .watch-panel { position:fixed; z-index:115; width:150px; height:320px; max-width:calc(100vw - 12px); max-height:calc(100dvh - 12px); display:flex; flex-direction:column; background:var(--surface-background); border:1px solid var(--ui-border); box-sizing:border-box; border-radius:7px; box-shadow:0 5px 20px var(--ui-shadow); }
  header { display:flex; gap:2px; padding:4px; border-bottom:1px solid var(--ui-border); }
  header button { width:20px; height:26px; padding:0; flex-shrink:0; display:grid; place-items:center; }
  .edit { width:auto; flex:1; min-width:0; font-size:11px; white-space:nowrap; }
  .lock { font-size:11px; } header button[aria-pressed="true"] { border-color:var(--accent); }
  header svg { width:14px; height:14px; fill:none; stroke:currentColor; stroke-width:1.5; }
  .lock svg { opacity:.7; } .lock[aria-pressed="true"] svg { opacity:1; }
  .list { overflow-y:auto; min-height:0; flex:1; scrollbar-width:thin; scrollbar-color:var(--ui-border) var(--surface-background); }
  .entry { width:100%; display:flex; flex-direction:column; align-items:flex-start; gap:3px; border:none; border-radius:0; padding:8px 10px; background:transparent; text-align:left; }
  .entry.active { color:var(--text-color); background:var(--toggle-background); box-shadow:inset 3px 0 var(--accent); }
  .entry small { font-size:10px; color:var(--muted-text); } .entry span { width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .error { font-size:11px; padding:0 8px; color:var(--error-text); overflow-wrap:anywhere; }
</style>
