<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import type { TabulatorFull as Tabulator } from "tabulator-tables";
    import { createTable } from "../utils/tableHelper";
    import type { ParsedFileContent } from "../utils/zipParser";

    interface Props {
        file: ParsedFileContent | undefined;
    }

    let { file }: Props = $props();

    let tableContainer = $state<HTMLElement>();
    let tabulatorInstance: Tabulator | null = null;

    function destroyTable() {
        if (tabulatorInstance) {
            tabulatorInstance.destroy();
            tabulatorInstance = null;
        }
    }

    function initTable() {
        destroyTable();
        if (
            file &&
            (file.type === "csv" || file.type === "parquet") &&
            tableContainer &&
            Array.isArray(file.data)
        ) {
            tabulatorInstance = createTable(tableContainer, file.data);
        }
    }

    // React to file changes
    $effect(() => {
        if (file) {
            // Small delay to ensure container is mounted if switching view types
            setTimeout(initTable, 0);
        }
    });

    onDestroy(() => {
        destroyTable();
    });
</script>

<div class="display-area" class:hidden={!file}>
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
</div>

<style>
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
