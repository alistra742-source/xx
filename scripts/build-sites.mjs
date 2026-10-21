#!/usr/bin/env node
// Builds the Freebuff Sites artifact: SPA assets + bundled Worker + deploy
// manifest. MP4 rendering stays on the Node server; this build exposes the
// Workers-compatible API subset (storyboards, prompt planning, voice).
import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const out = join(root, 'sites-build');
const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const compatibilityDate = process.env.SITES_COMPATIBILITY_DATE || '2026-10-01';

function run(args) {
  const result = spawnSync(process.execPath, [viteBin, ...args], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`vite ${args.join(' ')} failed with exit code ${result.status}`);
}

// Stamp the build into the Worker so /api/config reports which code is live.
const gitSha = spawnSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout?.trim();
process.env.VITE_BUILD_ID = gitSha || `local-${Date.now().toString(36)}`;
console.log(`Build id: ${process.env.VITE_BUILD_ID}`);

// A Worker that imports workerd-unavailable modules would fail only at runtime,
// so fail the build instead.
const worker = await readFile(join(root, 'worker', 'index.js'), 'utf8');
for (const specifier of worker.matchAll(/from\s+'([^']+)'/g)) {
  if (specifier[1].startsWith('node:') || specifier[1].includes('@napi-rs')) {
    throw new Error(`worker/index.js imports ${specifier[1]}, which workerd cannot run.`);
  }
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
run(['build']);
run(['build', '--ssr', 'worker/index.js', '--outDir', 'sites-build/.bundle', '--emptyOutDir']);
await rename(join(out, '.bundle', 'index.js'), join(out, 'worker.js'));
await rm(join(out, '.bundle'), { recursive: true, force: true });
await cp(join(root, 'dist'), join(out, 'assets'), { recursive: true });

await writeFile(join(out, 'manifest.json'), `${JSON.stringify({
  entrypoint: 'worker.js',
  compatibilityDate,
  modules: [{ name: 'worker.js', type: 'esm', path: './worker.js' }],
  assetsDirectory: './assets',
  spa: true,
}, null, 2)}\n`);

// Local workerd preview: same entrypoint, binding and SPA fallback as the deploy.
await writeFile(join(out, 'wrangler.jsonc'), `{
  "name": "urv-ai-stick-figure",
  "main": "worker.js",
  "compatibility_date": "${compatibilityDate}",
  "assets": {
    "directory": "./assets",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application"
  }
}\n`);

console.log(`Sites artifact ready in ${out}`);
