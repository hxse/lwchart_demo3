<script lang="ts">
  import Header from "../../components/Header.svelte";
  import GridTemplate from "../../components/grid-template/GridTemplate.svelte";
  import Page3HeaderControls from "../../components/Page3HeaderControls.svelte";
  import FileContentViewer from "../../components/FileContentViewer.svelte";
  import { navigate } from "../../router/utils";
  import { Page3State } from "./hooks.svelte";

  const state = new Page3State();
</script>

<div class="page-container">
  <Header onBack={() => navigate("/")}>
    {#snippet children()}
      <Page3HeaderControls
        zipFiles={state.zipFiles}
        internalFiles={state.internalFiles}
        selectedZipIndex={state.selectedZipIndex}
        selectedInternalIndex={state.selectedInternalIndex}
        loading={state.loading}
        parsing={state.parsing}
        templates={state.availableTemplates}
        selectedTemplate={state.selectedTemplate}
        showBottomRow={state.showBottomRow}
        viewMode={state.viewMode}
        onZipChange={state.handleZipSelect}
        onInternalFileChange={state.handleInternalFileSelect}
        onTemplateChange={state.handleTemplateChange}
        onShowBottomRowChange={state.handleShowBottomRowChange}
        onViewModeChange={state.handleViewModeChange}
      />
    {/snippet}
  </Header>

  <div class="content">
    <div style="height: 100%; width: 100%; display: {state.viewMode === 'chart' ? 'block' : 'none'};">
      {#if state.gridItems.length > 0}
        <GridTemplate items={state.gridItems} templateConfig={state.finalTemplate} />
      {:else if !state.loading && state.selectedZipIndex !== "-1"}
        <div class="empty-state">未找到图表数据</div>
      {:else if state.selectedZipIndex === "-1"}
        <div class="empty-state">请选择 ZIP 文件以开始</div>
      {/if}
    </div>

    <div class="manual-viewer" style="height: 100%; display: {state.viewMode === 'table' ? 'block' : 'none'};">
      {#if state.selectedInternalIndex !== "-1"}
        <FileContentViewer file={state.internalFiles[parseInt(state.selectedInternalIndex)]} />
      {:else}
        <div class="empty-state">请选择要查看的文件</div>
      {/if}
    </div>
  </div>
</div>

<style>
  .page-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: #e8f5e8;
  }
  .content {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }
  .empty-state {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    color: #666;
  }
</style>
