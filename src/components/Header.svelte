<script lang="ts">
  interface Props {
    showBackButton?: boolean;
    onBack?: () => void;
    children?: import("svelte").Snippet;
  }

  let { showBackButton = true, onBack, children }: Props = $props();
</script>

<header class="header">
  <div class="left">
    {#if showBackButton}
      <button class="back-button" onclick={onBack}>
        <svg
          width="1em"
          height="1em"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M19 12H5M5 12L12 19M5 12L12 5"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        返回
      </button>
    {/if}
  </div>

  <div class="right">
    {@render children?.()}
  </div>
</header>

<style>
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 20px;
    background: #f8f9fa;
    border-bottom: 1px solid #dee2e6;
    height: 60px;
    box-sizing: border-box;
  }

  .left,
  .right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .back-button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    color: #333;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .back-button:hover {
    background: #f5f5f5;
  }
</style>
