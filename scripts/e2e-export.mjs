// Usage: node scripts/e2e-export.mjs [baseUrl] [outFile]
// Requires a running server (npm start) and ffmpeg on PATH (FFMPEG_BIN to override).
import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const base = process.argv[2] || 'http://localhost:3000';
const outFile = process.argv[3] || 'e2e-output.mp4';
const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg';

async function api(path, init) {
  const res = await fetch(base + path, init);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) throw new Error(`${init?.method || 'GET'} ${path} -> ${res.status}: ${body?.error || text}`);
  return body;
}

const script = await api('/api/script', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ topic: 'At 3 AM an unknown virus hit the city. A guy woke to alarms, saw green zombies chasing people below his window, and had to escape.', duration: 30, tone: 'auto', characterCount: 'auto', narration: true, subtitles: true }),
});
console.log(`script: source=${script.source} title=${script.project.title} tone=${script.project.tone} cast=${script.project.characters.length} scenes=${script.project.scenes.length} duration=${script.project.duration}s`);
if (script.project.scenes.some((sc) => /create a|make a|generate a|animation about/i.test(sc.narration))) throw new Error('Generated narration appears to repeat the user prompt instead of narrating story events.');
if (!script.project.scenes.some((sc) => sc.characters.some((c) => ['zombie_walk', 'zombie_chase', 'turn_zombie', 'infect'].includes(c.action)))) throw new Error('Outbreak story is missing animated zombie actions.');

const started = await api('/api/exports', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ project: script.project, resolution: 480, fps: 12 }),
});
let job = started.job;
const t0 = Date.now();
while (job.status === 'queued' || job.status === 'running') {
  await new Promise((r) => setTimeout(r, 500));
  job = (await api(`/api/exports/${job.id}`)).job;
  process.stdout.write(`\r  ${job.status} ${Math.round((job.progress || 0) * 100)}% ${job.message || ''}      `);
}
console.log(`\nexport finished: ${job.status} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (job.status !== 'done') throw new Error(`export ${job.status}: ${job.error || ''}`);

const res = await fetch(base + job.result.downloadUrl);
if (!res.ok) throw new Error(`download failed: ${res.status}`);
const type = res.headers.get('content-type');
const buf = Buffer.from(await res.arrayBuffer());
await writeFile(outFile, buf);
console.log(`downloaded ${outFile}: ${buf.length} bytes, ${type}`);
if (type !== 'video/mp4') throw new Error(`unexpected content-type ${type}`);

const info = spawnSync(ffmpeg, ['-hide_banner', '-i', outFile], { encoding: 'utf8' }).stderr;
const videoLine = info.split('\n').find((l) => l.includes('Video:')) || '';
console.log(info.split('\n').find((l) => l.includes('Duration:'))?.trim());
console.log(videoLine.trim());
if (!/Video: h264/.test(info)) throw new Error('downloaded file is not an H.264 video');
if (!/Audio:/.test(info)) throw new Error('downloaded MP4 has no spoken audio track');
