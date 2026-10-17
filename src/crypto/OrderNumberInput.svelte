<script lang="ts">
  import { Decimal, one } from './trading/decimal';

  let { name, label, value = $bindable(), inputmode = 'decimal' }: {
    name: string; label: string; value: string; inputmode?: 'numeric' | 'decimal';
  } = $props();
  let input: HTMLInputElement;
  const number = $derived.by(() => {
    try { return Decimal.parse(value); }
    catch { return null; }
  });
  function step(direction: 1 | -1) {
    if (!number) return;
    input.value = (direction === 1 ? number.add(one) : number.sub(one)).toString();
    // 与键盘输入共用原始文本绑定和表单的待确认标记。
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus({ preventScroll: true });
  }
  function keydown(event: KeyboardEvent) {
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault(); step(event.key === 'ArrowUp' ? 1 : -1);
  }
  function focusedWheel(node: HTMLElement) {
    const wheel = (event: WheelEvent) => {
      if (document.activeElement !== input || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey
        || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      event.preventDefault(); step(event.deltaY < 0 ? 1 : -1);
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return { destroy: () => node.removeEventListener('wheel', wheel) };
  }
</script>

<div class="number-field">
  <label for={name}>{label}</label>
  <div class="number-control" use:focusedWheel>
    <input id={name} {name} {inputmode} bind:this={input} bind:value role="spinbutton"
      aria-valuenow={number ? Number(value) : undefined} aria-valuetext={value}
      onkeydown={keydown} autocomplete="off" spellcheck="false" />
    <div class="stepper">
      <button type="button" tabindex="-1" aria-label={`增加 ${label}`} title={number ? '增加 1' : '输入完整数字后可微调'} disabled={!number}
        onpointerdown={event => event.preventDefault()} onclick={() => step(1)}>
        <svg width="10" height="7" viewBox="0 0 12 8" aria-hidden="true"><path d="m3 5.5 3-3 3 3" /></svg>
      </button>
      <button type="button" tabindex="-1" aria-label={`减少 ${label}`} title={number ? '减少 1' : '输入完整数字后可微调'} disabled={!number}
        onpointerdown={event => event.preventDefault()} onclick={() => step(-1)}>
        <svg width="10" height="7" viewBox="0 0 12 8" aria-hidden="true"><path d="m3 2.5 3 3 3-3" /></svg>
      </button>
    </div>
  </div>
</div>

<style>
  .number-field { display:flex; flex-direction:column; gap:3px; min-width:0; color:var(--secondary-text); font-size:12px; }
  .number-control { position:relative; width:100%; max-width:80px; height:26px; border-radius:4px; background:var(--field-background); }
  .number-control:focus-within { outline:2px solid var(--accent); }
  input { width:100%; height:100%; min-width:0; box-sizing:border-box; border:1px solid var(--ui-border); outline:none; border-radius:4px; padding:3px 23px 3px 6px; background:transparent; color:var(--text-color); font:inherit; font-variant-numeric:tabular-nums; }
  .stepper { position:absolute; top:1px; right:1px; bottom:1px; width:17px; display:grid; grid-template-rows:repeat(2,minmax(0,1fr)); border-left:1px solid var(--ui-border); border-radius:0 3px 3px 0; overflow:hidden; }
  button { display:grid; place-items:center; min-width:0; border:0; padding:0; background:transparent; color:var(--secondary-text); cursor:pointer; }
  button + button { border-top:1px solid var(--ui-border); }
  button:hover:not(:disabled),button:active:not(:disabled) { color:var(--accent); background:color-mix(in srgb,var(--accent) 12%,transparent); }
  button:disabled { opacity:.35; cursor:default; }
  path { fill:none; stroke:currentColor; stroke-width:1.5; stroke-linecap:round; stroke-linejoin:round; }
</style>
