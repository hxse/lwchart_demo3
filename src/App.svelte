<script lang="ts">
  import { onMount } from "svelte";
  import {
    navigate as changeUrl,
    initRouter,
    isSpecialRoute,
  } from "./router/utils.js";
  import { resolveRoute } from "./router/index.js";
  import Loading from "./pages/Loading.svelte";
  import NotFound from "./pages/404.svelte";

  // 当前路径
  let currentPath = $state(window.location.pathname);

  // 路由状态 - 使用 derived 自动计算
  let routeState = $derived(async () => {
    try {
      const result = await resolveRoute(currentPath);
      return {
        type: isSpecialRoute(result) ? result : "component",
        component: isSpecialRoute(result) ? null : result,
      };
    } catch {
      return { type: "not-found", component: null };
    }
  });

  // 导航到指定路径
  function navigateTo(path: string) {
    currentPath = path;
    changeUrl(path);
  }

  // 监听浏览器前进/后退
  onMount(() =>
    initRouter((path) => {
      currentPath = path;
    }),
  );
</script>

<main>
  {#await routeState()}
    <Loading />
  {:then state}
    {#if state.type === "component"}
      <!-- 动态渲染组件 - Svelte 5 中直接使用组件变量 -->
      {@const Component = state.component}
      <div class="component-container">
        <Component />
      </div>
    {:else if state.type === "home"}
      <div class="home-panel">
        <h1>主页面</h1>
        <p>请选择要访问的页面：</p>
        <div class="button-panel">
          <button class="nav-button" onclick={() => navigateTo("/page1")}
            >基本示例</button
          >
          <button class="nav-button" onclick={() => navigateTo("/page2")}
            >页面 2</button
          >
          <button class="nav-button" onclick={() => navigateTo("/page3")}
            >页面 3</button
          >
        </div>
      </div>
    {:else}
      <NotFound onNavigate={navigateTo} />
    {/if}
  {:catch}
    <NotFound onNavigate={navigateTo} />
  {/await}
</main>

<style>
  main {
    width: 100vw;
    height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .component-container {
    flex: 1;
    overflow: auto;
  }

  .home-panel {
    text-align: center;
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: center;
    padding-top: 15vh;
  }

  .home-panel h1 {
    color: #333;
  }

  .button-panel {
    display: flex;
    gap: 20px;
    justify-content: center;
    flex-wrap: wrap;
  }

  .nav-button {
    padding: 15px 30px;
    font-size: 16px;
    background: #4caf50;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
  }

  .nav-button:hover {
    background: #45a049;
  }
</style>
