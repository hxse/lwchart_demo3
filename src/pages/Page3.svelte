<script lang="ts">
  // 页面3的脚本
  import Header from "../components/Header.svelte";
  import { navigate } from "../router/utils";
</script>

<div>
  <Header onBack={() => navigate("/")} />
  <h1>页面 3</h1>
  <p>Hello World - 这是页面3的内容</p>
</div>

<style>
  div {
    width: 100%;
    height: 100%;
    background-color: #e8f5e8;
    overflow: hidden;
  }
</style>
