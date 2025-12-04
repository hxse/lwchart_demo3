<script lang="ts">
    import Header from "../components/Header.svelte";
    import { settings } from "../store.svelte";
    import { api } from "../services/api";

    let loading = $state(false);
    let message = $state("");
    let error = $state("");

    async function handleSaveAndLogin() {
        loading = true;
        message = "";
        error = "";
        try {
            await api.login();
            message = "登录成功！配置已保存。";
        } catch (e) {
            error = "登录失败: " + (e as Error).message;
        } finally {
            loading = false;
        }
    }
</script>

<div class="page">
    <Header showBackButton={true} onBack={() => history.back()}>
        {#snippet children()}
            <span class="title">设置</span>
        {/snippet}
    </Header>

    <div class="content">
        <div class="form-group">
            <label for="baseUrl">服务器地址 (Base URL)</label>
            <input
                id="baseUrl"
                type="text"
                bind:value={settings.baseUrl}
                placeholder="http://127.0.0.1:5123"
            />
        </div>

        <div class="form-group">
            <label for="username">用户名</label>
            <input id="username" type="text" bind:value={settings.username} />
        </div>

        <div class="form-group">
            <label for="password">密码</label>
            <input
                id="password"
                type="password"
                bind:value={settings.password}
            />
        </div>

        <div class="actions">
            <button onclick={handleSaveAndLogin} disabled={loading}>
                {loading ? "登录中..." : "登录"}
            </button>
            <button
                class="test-btn"
                onclick={async () => {
                    loading = true;
                    message = "";
                    error = "";
                    try {
                        const token = await api.login();
                        message = `登录成功！Token: ${token.substring(0, 20)}...`;
                    } catch (e) {
                        error = "测试失败: " + (e as Error).message;
                    } finally {
                        loading = false;
                    }
                }}
                disabled={loading}
            >
                {loading ? "测试中..." : "测试连接"}
            </button>
        </div>

        {#if message}
            <p class="success">{message}</p>
        {/if}

        {#if error}
            <p class="error">{error}</p>
        {/if}
    </div>
</div>

<style>
    .page {
        display: flex;
        flex-direction: column;
        height: 100vh;
        background: #f5f5f5;
    }

    .title {
        font-weight: bold;
        font-size: 1.1em;
    }

    .content {
        padding: 20px;
        max-width: 600px;
        margin: 0 auto;
        width: 100%;
        box-sizing: border-box;
    }

    .form-group {
        margin-bottom: 15px;
    }

    label {
        display: block;
        margin-bottom: 5px;
        font-weight: 500;
    }

    input {
        width: 100%;
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        box-sizing: border-box;
    }

    .actions {
        margin-top: 20px;
        display: flex;
        gap: 10px;
    }

    button {
        padding: 10px 20px;
        background: #007bff;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 16px;
    }

    .test-btn {
        background: #28a745;
    }

    .test-btn:hover:not(:disabled) {
        background: #218838;
    }

    button:disabled {
        background: #ccc;
        cursor: not-allowed;
    }

    .success {
        color: green;
        margin-top: 10px;
    }

    .error {
        color: red;
        margin-top: 10px;
    }
</style>
