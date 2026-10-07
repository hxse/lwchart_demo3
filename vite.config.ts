import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  build: {
    rolldownOptions: {
      output: {
        // 旧文件查看器的表格库独立成包，避免与 Parquet 解码合成过大的共享块。
        codeSplitting: { groups: [{ name: 'tables', test: /node_modules[\\/]tabulator-tables[\\/]/ }] },
      },
    },
  },
})
