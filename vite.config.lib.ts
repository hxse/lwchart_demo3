import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';
import { buildDeclarations } from './scripts/legacy/declarations';

export default defineConfig({
    plugins: [svelte(), { name: 'library-declarations', async closeBundle() { await buildDeclarations(import.meta.dirname); } }],
    build: {
        lib: {
            entry: resolve(import.meta.dirname, 'src/lib-entry.ts'),
            name: 'ChartDashboardLib',
            fileName: (format) => `chart-dashboard.${format}.js`
        },
        outDir: 'dist-lib',
        emptyOutDir: true
    }
});
