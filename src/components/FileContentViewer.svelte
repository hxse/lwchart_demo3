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
        <div class="header">
            <h3>{file.filename}</h3>
        </div>
        <div class="content-wrapper">
            {#if file.type === "csv" || file.type === "parquet"}
                <div class="table-container" bind:this={tableContainer}></div>
            {:else}
                <pre class="text-preview">{file.preview ||
                        (typeof file.data === "string"
                            ? file.data
                            : JSON.stringify(file.data, null, 2))}</pre>
            {/if}
        </div>
    {/if}
</div>

<style>
    .display-area {
        height: 100%;
        display: flex;
        flex-direction: column;
        background: white;
        overflow: hidden;
    }
    .header {
        padding: 10px 15px;
        border-bottom: 1px solid #eee;
        flex-shrink: 0;
    }
    .header h3 {
        margin: 0;
        font-size: 1.1em;
        color: #333;
    }
    .content-wrapper {
        flex: 1;
        overflow: hidden;
        position: relative;
    }
    .table-container {
        height: 100%;
        width: 100%;
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
        margin: 0;
        height: 100%;
        overflow-y: auto;
        box-sizing: border-box;
    }
</style>
