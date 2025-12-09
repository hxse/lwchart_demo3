import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';

export default defineConfig({
    plugins: [svelte()],
    build: {
        lib: {
            entry: path.resolve(__dirname, 'src/lib-entry.ts'),
            name: 'ChartDashboardLib',
            fileName: (format) => `chart-dashboard.${format}.js`
        },
        rollupOptions: {
            // Ensure specific external dependencies are not bundled if necessary, 
            // but for a standalone notebook widget we usually WANT to bundle everything 
            // except maybe svelte itself if provided globally? 
            // For simplicity in Jupyter, we often bundle everything.
            // But let's check if we want to bundle lightweight-charts. Yes we do.
            external: [],
            output: {
                // Global variables for use in UMD build
                globals: {}
            }
        },
        outDir: 'dist-lib',
        emptyOutDir: true
    }
});
