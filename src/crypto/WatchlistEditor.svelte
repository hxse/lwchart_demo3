<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { watchEntry, serializeWatchlist, moveWatch, MAX_URL_LENGTH, type WatchEntry, type WatchProvider } from './watchlist';
  let { entries, flat, onSave, onCancel }: {
    entries: WatchEntry[]; flat: boolean; onSave: (value: WatchEntry[]) => boolean; onCancel: () => void;
  } = $props();
  let nextId = 0;
  let rows = $state(untrack(() => entries.map(item => ({ ...item, id: nextId++ }))));
  let dragging = $state<number>();
  let error = $state('');
  let dialog = $state<HTMLDivElement>();
  const length = $derived.by(() => {
    try {
      const url = new URL(location.href);
      url.hash = serializeWatchlist({ entries: rows.map(item => watchEntry(item.provider, item.symbol)), flat });
      return url.href.length;
    } catch { return undefined; }
  });
  onMount(() => { (dialog?.querySelector('input') || dialog?.querySelector('button'))?.focus(); });
  function save(event: SubmitEvent) {
    event.preventDefault();
    try { error = ''; onSave(rows.map(item => watchEntry(item.provider, item.symbol))); }
    catch (e) { error = (e as Error).message; }
  }
  function move(from: number, to: number) { rows = moveWatch(rows, from, to); }
</script>

<svelte:window onkeydown={event => { if (event.key === 'Escape') { event.preventDefault(); onCancel(); } }} />
<div class="backdrop">
  <div class="editor" role="dialog" aria-modal="true" aria-label="编辑自选" bind:this={dialog} tabindex="-1">
    <div class="heading"><strong>编辑自选</strong><button aria-label="关闭自选编辑" onclick={onCancel}>×</button></div>
    <p class="hint">拖拽或用上下按钮排序。保存只更新自选列表，当前看盘保持不变。</p>
    <form onsubmit={save}>
      <ol>
        {#each rows as item, index (item.id)}
          <li data-watch-row={index} ondragover={event => { event.preventDefault(); }}
            ondrop={event => { event.preventDefault(); if (dragging !== undefined) move(dragging, index); dragging = undefined; }}>
            <button class="handle" type="button" draggable="true" aria-label={`拖拽第 ${index + 1} 项`}
              ondragstart={event => { dragging = index; event.dataTransfer?.setData('text/plain', String(index)); }}
              ondragend={() => { dragging = undefined; }}>⠿</button>
            <select aria-label={`第 ${index + 1} 项来源`} bind:value={item.provider}>
              <option value="binance">Binance</option><option value="kraken">Kraken</option><option value="tq">TQ</option>
            </select>
            <input aria-label={`第 ${index + 1} 项品种`} bind:value={item.symbol} placeholder={item.provider === 'tq' ? 'KQ.m@SHFE.rb' : 'BTC/USDT:USDT'} />
            <button type="button" aria-label={`上移第 ${index + 1} 项`} disabled={index === 0} onclick={() => move(index, index - 1)}>↑</button>
            <button type="button" aria-label={`下移第 ${index + 1} 项`} disabled={index === rows.length - 1} onclick={() => move(index, index + 1)}>↓</button>
            <button type="button" aria-label={`删除第 ${index + 1} 项`} onclick={() => { rows = rows.filter(row => row.id !== item.id); }}>×</button>
          </li>
        {/each}
      </ol>
      <button type="button" onclick={() => { rows = [...rows, { id: nextId++, provider: 'binance' as WatchProvider, symbol: '' }]; }}>新增品种</button>
      {#if length !== undefined}<p class="hint" class:too-long={length > MAX_URL_LENGTH}>完整 URL：{length} / {MAX_URL_LENGTH} 字符</p>{/if}
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <div class="footer"><button type="button" onclick={onCancel}>取消</button><button class="save" type="submit">保存自选</button></div>
    </form>
  </div>
</div>

<style>
  .backdrop { position:fixed; inset:0; z-index:200; display:grid; place-items:center; background:var(--chart-overlay); }
  .editor { width:560px; max-width:calc(100vw - 24px); max-height:calc(100dvh - 24px); overflow:auto; padding:18px; box-sizing:border-box; border:1px solid var(--ui-border); border-radius:12px; background:var(--surface-background); box-shadow:0 14px 50px var(--ui-shadow); }
  .heading,.footer { display:flex; align-items:center; justify-content:space-between; gap:8px; }
  .hint { color:var(--muted-text); font-size:11px; line-height:1.6; }
  ol { list-style:none; padding:0; margin:14px 0; display:flex; flex-direction:column; gap:8px; }
  li { display:flex; align-items:center; gap:5px; }
  button,input,select { font:inherit; font-size:12px; color:var(--text-color); background:var(--field-background); border:1px solid var(--ui-border); border-radius:5px; padding:7px; min-width:0; }
  input { flex:1; width:0; } select { width:90px; }
  button { cursor:pointer; } button:disabled { opacity:.35; cursor:default; }
  .handle { cursor:grab; } .handle:active { cursor:grabbing; }
  input:focus,select:focus,button:focus-visible { outline:2px solid var(--accent); }
  .footer { justify-content:flex-end; margin-top:16px; }
  .save { background:var(--accent); border-color:var(--accent); color:white; }
  .error,.too-long { color:var(--error-text); }
  @media(max-width:430px) { li { flex-wrap:wrap; } input { flex-basis:calc(100% - 135px); } }
</style>
