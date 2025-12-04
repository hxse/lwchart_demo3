<script lang="ts">
  interface Props {
    name: string;
  }

  let { name }: Props = $props();
</script>

<div class="hello-world">
  <h2>Hello World {name}!</h2>
</div>

<style>
  .hello-world {
    background-color: #f0f8ff;
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  h2 {
    color: #333;
    margin: 0;
  }
</style>
