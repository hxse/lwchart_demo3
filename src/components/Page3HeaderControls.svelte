<script lang="ts">
    import { navigate } from "../router/utils";
    import type { ParsedFileContent } from "../utils/zipParser";
    import type { FileItem } from "../utils/fileManager";

    interface Props {
        zipFiles: FileItem[];
        internalFiles: ParsedFileContent[];
        selectedZipIndex: string;
        selectedInternalIndex: string;
        loading: boolean;
        parsing: boolean;
        // New Props for Grid Template
        templates: string[];
        selectedTemplate: string;
        showBottomRow: boolean;
        viewMode: "chart" | "table"; // New prop

        // Callbacks
        onZipChange: (event: Event) => void;
        onInternalFileChange: (event: Event) => void;
        onTemplateChange: (event: Event) => void;
        onShowBottomRowChange: (event: Event) => void;
        onViewModeChange: (mode: "chart" | "table") => void; // New callback
    }

    let {
        zipFiles,
        internalFiles,
        selectedZipIndex,
        selectedInternalIndex,
        loading,
        parsing,
        templates,
        selectedTemplate,
        showBottomRow,
        viewMode,
        onZipChange,
        onInternalFileChange,
        onTemplateChange,
        onShowBottomRowChange,
        onViewModeChange,
    }: Props = $props();
</script>

<div class="actions">
    <!-- ZIP Selection -->
    <select value={selectedZipIndex} onchange={onZipChange} disabled={loading}>
        <option value="-1">选择 ZIP 文件...</option>
        {#each zipFiles as file, index}
            <option value={index.toString()}>{file.filename}</option>
        {/each}
    </select>

    <!-- Internal File Selection -->
    <select
        value={selectedInternalIndex}
        onchange={onInternalFileChange}
        disabled={loading || parsing || internalFiles.length === 0}
    >
        <option value="-1">
            {parsing ? "正在解析..." : "选择内部文件..."}
        </option>
        {#each internalFiles as file, index}
            <option value={index.toString()}>{file.filename}</option>
        {/each}
    </select>

    <div class="separator"></div>

    <!-- Grid Template Selection -->
    <select
        value={selectedTemplate}
        onchange={onTemplateChange}
        disabled={loading}
    >
        {#each templates as t}
            <option value={t}>{t}</option>
        {/each}
    </select>

    <!-- Bottom Row Toggle -->
    <label class="checkbox-label">
        <input
            type="checkbox"
            checked={showBottomRow}
            onchange={onShowBottomRowChange}
            disabled={loading}
        />
        显示底栏
    </label>

    <div class="separator"></div>

    <!-- View Mode Toggle -->
    <div class="view-toggle">
        <button
            class:active={viewMode === "chart"}
            onclick={() => onViewModeChange("chart")}
            disabled={loading}
        >
            图表
        </button>
        <button
            class:active={viewMode === "table"}
            onclick={() => onViewModeChange("table")}
            disabled={loading}
        >
            表格
        </button>
    </div>

    <div class="separator"></div>

    <button class="settings-btn" onclick={() => navigate("/settings")}>
        设置
    </button>
</div>

<style>
    .actions {
        display: flex;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
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
    .separator {
        width: 1px;
        height: 20px;
        background-color: #ccc;
        margin: 0 5px;
    }
    .checkbox-label {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 14px;
        cursor: pointer;
        user-select: none;
    }
    .view-toggle {
        display: flex;
        border: 1px solid #ccc;
        border-radius: 4px;
        overflow: hidden;
    }
    .view-toggle button {
        padding: 5px 10px;
        border: none;
        background: white;
        cursor: pointer;
    }
    .view-toggle button.active {
        background: #e0e0e0;
        font-weight: bold;
    }
    .view-toggle button:hover:not(.active) {
        background: #f5f5f5;
    }
</style>
