<script lang="ts">
  import GridTemplate from "../components/grid-template/GridTemplate.svelte";
  import HelloWorld from "../components/grid-template/HelloWorld.svelte";
  import { GridTemplateType } from "../components/grid-template/gridTemplates";
  import { addBottomRow } from "../components/grid-template/gridTemplatesExtended";
  import Header from "../components/Header.svelte";
  import { navigate } from "../router/utils";

  // 准备组件数组
  const gridItems = [
    {
      component: HelloWorld,
      props: { name: "组件1" },
    },
    {
      component: HelloWorld,
      props: { name: "组件2" },
    },
    {
      component: HelloWorld,
      props: { name: "组件3" },
    },
    {
      component: HelloWorld,
      props: { name: "组件4" },
    },
    {
      component: HelloWorld,
      props: { name: "组件5" },
    },
  ];

  // 选择一个模板配置
  let selectedTemplate;
  // selectedTemplate = GridTemplateType.HORIZONTAL_1x1;
  // selectedTemplate = addBottomRow(GridTemplateType.HORIZONTAL_1x1);
  selectedTemplate = GridTemplateType.VERTICAL_1x2;
  // selectedTemplate = addBottomRow(GridTemplateType.VERTICAL_1x2);
  // selectedTemplate = GridTemplateType.HORIZONTAL_1x2;
  // selectedTemplate = addBottomRow(GridTemplateType.HORIZONTAL_1x2, "25vh");

  // selectedTemplate = GridTemplateType.GRID_2x2;
  // selectedTemplate = addBottomRow(GridTemplateType.GRID_2x2);
</script>

<div>
  <Header onBack={() => navigate("/")} />
  <GridTemplate
    items={gridItems}
    templateConfig={selectedTemplate}
    gap="10px"
  />
</div>

<style>
  div {
    width: 100%;
    height: 100%;
    background-color: #e8f5e8;
    overflow: hidden;
  }
</style>
