<script lang="ts">
  // 可以添加加载逻辑或状态
  // let { message = "加载中..." }: { message?: string } = $props();
  let { message = "" }: { message?: string } = $props();
</script>

<div class="loading">
  {message}
</div>

<style>
  .loading {
    position: fixed;
    top: 10px;
    left: 10px;
    color: #666;
    font-size: 14px;
  }
</style>
