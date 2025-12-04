<script lang="ts">
  import Header from "../components/Header.svelte";
  import { navigate } from "../router/utils";
  import { onMount, onDestroy, tick } from "svelte";
  import type { TabulatorFull as Tabulator } from "tabulator-tables";
  import type { ParsedFileContent } from "../utils/zipParser";
  import {
    downloadAndParseZip,
    fetchFileList,
    type FileItem,
  } from "../utils/fileManager";
  import { createTable } from "../utils/tableHelper";

  // State
  let fileList: FileItem[] = $state([]);
  let zipFiles: FileItem[] = $derived(
    fileList.filter((f) => f.filename.toLowerCase().endsWith(".zip")),
  );

  let selectedZipIndex: string = $state("-1");
  let internalFiles: ParsedFileContent[] = $state([]);
  let selectedInternalIndex: string = $state("-1");

  let loading = $state(false);
  let parsing = $state(false);
  let error = $state("");

  let tableContainer = $state<HTMLElement>();
  let tabulatorInstance: Tabulator | null = null;

  // Lifecycle
  onMount(async () => {
    try {
      fileList = await fetchFileList();
    } catch (e) {
      error = "获取文件列表失败: " + (e as Error).message;
    }
  });

  onDestroy(() => {
    destroyTable();
  });

  // Handlers
  async function handleZipSelect(event: Event) {
    const select = event.target as HTMLSelectElement;
    const index = parseInt(select.value);
    selectedZipIndex = select.value;

    resetInternalSelection();

    if (index === -1 || isNaN(index)) return;

    const selectedFile = zipFiles[index];
    if (!selectedFile) return;

    loading = true;
    parsing = true;

    try {
      internalFiles = await downloadAndParseZip(selectedFile);
    } catch (e) {
      error = "Error processing zip: " + (e as Error).message;
    } finally {
      loading = false;
      parsing = false;
    }
  }

  async function handleInternalFileSelect(event: Event) {
    const select = event.target as HTMLSelectElement;
    const index = parseInt(select.value);
    selectedInternalIndex = select.value;
    error = "";

    destroyTable();

    if (index === -1 || isNaN(index)) return;

    await tick(); // Wait for DOM update

    const file = internalFiles[index];
    if (!file) return;

    if (file.type === "csv" || file.type === "parquet") {
      if (tableContainer) {
        tabulatorInstance = createTable(tableContainer, file.data);
      }
    }
  }

  // Helpers
  function resetInternalSelection() {
    internalFiles = [];
    selectedInternalIndex = "-1";
    error = "";
    destroyTable();
  }

  function destroyTable() {
    if (tabulatorInstance) {
      tabulatorInstance.destroy();
      tabulatorInstance = null;
    }
  }
</script>

<div class="page-container">
  <Header onBack={() => navigate("/")}>
    {#snippet children()}
      <div class="actions">
        <!-- ZIP Selection -->
        <select
          value={selectedZipIndex}
          onchange={handleZipSelect}
          disabled={loading}
        >
          <option value="-1">选择 ZIP 文件...</option>
          {#each zipFiles as file, index}
            <option value={index}>{file.filename}</option>
          {/each}
        </select>

        <!-- Internal File Selection -->
        <select
          value={selectedInternalIndex}
          onchange={handleInternalFileSelect}
          disabled={loading || parsing || internalFiles.length === 0}
        >
          <option value="-1">
            {parsing ? "正在解析..." : "选择内部文件..."}
          </option>
          {#each internalFiles as file, index}
            <option value={index}>{file.filename}</option>
          {/each}
        </select>

        <button class="settings-btn" onclick={() => navigate("/settings")}>
          设置
        </button>
      </div>
    {/snippet}
  </Header>

  <div class="content">
    <h1>页面 2</h1>
    <p>File Management Demo</p>

    {#if loading}<p>Loading...</p>{/if}
    {#if error}<p class="error">{error}</p>{/if}

    <!-- Display Area -->
    <div class="display-area" class:hidden={selectedInternalIndex === "-1"}>
      {#if selectedInternalIndex !== "-1"}
        {@const file = internalFiles[parseInt(selectedInternalIndex)]}
        {#if file}
          <h3>{file.filename}</h3>
          {#if file.type === "csv" || file.type === "parquet"}
            <div bind:this={tableContainer}></div>
          {:else}
            <pre class="text-preview">{file.preview ||
                (typeof file.data === "string"
                  ? file.data
                  : JSON.stringify(file.data, null, 2))}</pre>
          {/if}
        {/if}
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
    padding: 20px;
    overflow: auto;
    flex: 1;
  }
  .actions {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  select {
    padding: 5px;
    border-radius: 4px;
    border: 1px solid #ccc;
    min-width: 150px;
  }
  .settings-btn {
    padding: 5px 10px;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  .error {
    color: red;
  }
  .display-area {
    margin-top: 20px;
    background: white;
    padding: 15px;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
  .hidden {
    display: none;
  }
  .text-preview {
    white-space: pre-wrap;
    word-break: break-all;
    font-family: monospace;
    background: #f5f5f5;
    padding: 10px;
    border-radius: 4px;
    max-height: 500px;
    overflow-y: auto;
  }
</style>
