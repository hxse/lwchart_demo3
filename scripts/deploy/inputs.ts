import { readdir, lstat, readFile, mkdir, writeFile, copyFile, chmod } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

export interface SourceManifest { id: string; files: Array<{ path: string; sha256: string; mode: number }> }
const topFiles = ['Containerfile', '.containerignore', 'package.json', 'bun.lock', 'svelte.config.js', 'vite.config.crypto.ts',
    'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'tsconfig.runtime.json'];
const digest = (input: string | Buffer) => createHash('sha256').update(input).digest('hex');
async function sourceFiles(root: string) {
    const result = [...topFiles];
    async function walk(directory: string) {
        for (const name of (await readdir(join(root, directory))).sort()) {
            if (name.startsWith('.')) continue;
            const path = join(directory, name);
            const stat = await lstat(join(root, path));
            if (stat.isSymbolicLink()) throw new Error('构建输入不允许符号链接');
            if (stat.isDirectory()) await walk(path);
            else if (/\.(ts|svelte|css|html|js|sh|svg)$/.test(name)) result.push(path);
        }
    }
    await walk('src'); await walk('scripts');
    return result.sort();
}
export async function sourceManifest(root: string): Promise<SourceManifest> {
    const files = [];
    for (const path of await sourceFiles(root)) {
        const file = join(root, path); const stat = await lstat(file);
        if (!stat.isFile()) throw new Error('构建输入必须是普通文件');
        files.push({ path, sha256: digest(await readFile(file)), mode: stat.mode & 0o777 });
    }
    return { id: digest(JSON.stringify(files)), files };
}
export async function prepareInputs(root: string) {
    const manifest = await sourceManifest(root);
    const directory = join(root, '.deploy/sources', manifest.id);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    for (const file of manifest.files) {
        const target = join(directory, file.path);
        await mkdir(dirname(target), { recursive: true });
        let same = false;
        try { same = digest(await readFile(target)) === file.sha256; } catch {}
        if (!same) await copyFile(join(root, file.path), target);
        await chmod(target, file.mode);
    }
    await writeFile(join(directory, '.manifest.json'), JSON.stringify(manifest));
    await writeFile(join(directory, '.manifest.sha256'), manifest.files.map(f => `${f.sha256}  ${f.path}`).join('\n') + '\n');
    return { id: manifest.id, directory };
}
if (import.meta.main) {
    const root = resolve(import.meta.dirname, '../..');
    try { console.log(JSON.stringify(process.argv[2] === '--fingerprint' ? { id: (await sourceManifest(root)).id } : await prepareInputs(root))); }
    catch { console.error('无法准备构建白名单，请核对源码与文件权限'); process.exit(2); }
}
