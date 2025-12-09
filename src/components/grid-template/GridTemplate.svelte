<script lang="ts">
  import { type GridTemplateConfig } from "./gridTemplates";
  import { getCurrentConfig, extractAllAreas } from "./utils";

  // 定义组件项类型
  interface ComponentItem {
    id: string; // Unique ID for keying
    component: any; // 组件类型
    props: Record<string, any>; // 组件参数
  }

  // 定义Props接口
  interface Props {
    items: ComponentItem[]; // 组件数组
    templateConfig: GridTemplateConfig | string; // 模板配置或配置键名
    gap?: string; // 网格间距
  }

  // 接收props
  let { items, templateConfig, gap = "10px" }: Props = $props();

  // 获取当前模板配置 - 直接计算变量，而不是函数
  const currentConfig = $derived(getCurrentConfig(templateConfig));

  // 获取所有唯一的区域名称 - 直接计算变量，而不是函数
  const allAreas = $derived(extractAllAreas(currentConfig.gridTemplateAreas));
</script>

{#key currentConfig}
  <div
    class="grid-container"
    style:display="grid"
    style:grid-template-areas={currentConfig.gridTemplateAreas}
    style:grid-template-columns={currentConfig.gridTemplateColumns}
    style:grid-template-rows={currentConfig.gridTemplateRows}
    style:gap
    style:width="100%"
    style:height="100%"
  >
    {#each items.slice(0, allAreas.length) as item, index (item.id)}
      {#if item.component}
        {@const Component = item.component}
        <div class="grid-item" style="grid-area: {allAreas[index] || 'a'};">
          <Component {...item.props} />
        </div>
      {/if}
    {/each}
  </div>
{/key}

<style>
  /* Ensure the grid container respects parent size */
  .grid-container {
    box-sizing: border-box;
  }

  /* Critical for allowing charts (nested flex/grid) to shrink below content size */
  .grid-item {
    min-width: 0;
    min-height: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
</style>
