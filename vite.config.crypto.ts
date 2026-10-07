import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';

const root = import.meta.dirname;
export default defineConfig({
    root: resolve(root, 'src/crypto'),
    publicDir: false,
    envDir: root,
    plugins: [svelte()],
    server: { fs: { allow: [root], deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.jj/**', '**/config.toml*', '**/config.local.toml*', '**/config.remote.toml*'] } },
    build: { outDir: resolve(root, 'dist-crypto'), emptyOutDir: true },
});
