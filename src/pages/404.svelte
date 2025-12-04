<script lang="ts">
  interface Props {
    onNavigate?: (path: string) => void;
  }

  let { onNavigate }: Props = $props();
</script>

<div class="not-found-container">
  <div class="not-found-content">
    <div class="error-code">404</div>
    <h2>页面未找到</h2>
    <p>抱歉，您访问的页面不存在</p>
    <button class="back-button" onclick={() => onNavigate?.("/")}>返回主页</button>
  </div>
</div>

<style>
  .not-found-container {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
    background: #f8f9fa;
  }

  .not-found-content {
    text-align: center;
    background: white;
    padding: 50px 40px;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
    max-width: 380px;
  }

  .error-code {
    font-size: 80px;
    font-weight: 700;
    color: #667eea;
    margin-bottom: 16px;
    letter-spacing: -2px;
  }

  h2 {
    font-size: 22px;
    color: #212529;
    margin: 0 0 12px 0;
    font-weight: 600;
  }

  p {
    font-size: 15px;
    color: #6c757d;
    margin: 0 0 28px 0;
    line-height: 1.5;
  }

  .back-button {
    padding: 10px 28px;
    background: #667eea;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s ease;
  }

  .back-button:hover {
    background: #5a67d8;
    transform: translateY(-1px);
  }

  /* 响应式设计 */
  @media (max-width: 480px) {
    .not-found-content {
      padding: 40px 24px;
      margin: 20px;
    }

    .error-code {
      font-size: 64px;
    }

    h2 {
      font-size: 20px;
    }
  }
</style>
