// Samples drawings per class from the public Quick, Draw! bucket (no credentials needed).
// Usage: node scripts/fetch-quickdraw.mjs [perClass=300] [outDir=tmp/quickdraw]
// Each class is stored as <outDir>/<slug>.json: an array of { word, drawing } entries.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BUCKET = 'https://storage.googleapis.com/quickdraw_dataset/full/simplified/';
const LISTING = 'https://storage.googleapis.com/storage/v1/b/quickdraw_dataset/o?prefix=full/simplified/&maxResults=1000';
const BYTES_PER_DRAWING_ESTIMATE = 1500; // rough NDJSON size per simplified drawing

export function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Parses complete NDJSON lines only. A range request can cut the last line, so a
// line is kept only when it ends in a newline or is the final line of a full file.
export function parseDrawingLines(text, limit, { complete = false } = {}) {
  const lines = text.split('\n');
  if (!complete) lines.pop();
  const out = [];
  for (const line of lines) {
    if (out.length >= limit) break;
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (Array.isArray(row.drawing) && row.drawing.length) out.push({ word: row.word, drawing: row.drawing });
    } catch {
      // skip malformed or truncated line
    }
  }
  return out;
}

export async function listClassFiles(fetchImpl = fetch) {
  const res = await fetchImpl(LISTING);
  if (!res.ok) throw new Error(`Listing failed: HTTP ${res.status}`);
  const body = await res.json();
  return (body.items || [])
    .filter((item) => item.name.endsWith('.ndjson'))
    .map((item) => {
      const file = item.name.split('/').pop();
      return { name: path.basename(file, '.ndjson'), file };
    });
}

export async function sampleClass(file, perClass, fetchImpl = fetch) {
  const bytes = Math.min(perClass * BYTES_PER_DRAWING_ESTIMATE, 50 * 1024 * 1024);
  const res = await fetchImpl(BUCKET + encodeURIComponent(file).replace(/%2F/g, '/'), {
    headers: { Range: `bytes=0-${bytes - 1}` },
  });
  if (!res.ok && res.status !== 206) throw new Error(`Download ${file} failed: HTTP ${res.status}`);
  const text = await res.text();
  const complete = res.status === 200;
  return parseDrawingLines(text, perClass, { complete });
}

async function main() {
  const perClass = Number(process.argv[2] || 300);
  const outDir = path.resolve(process.argv[3] || 'tmp/quickdraw');
  await mkdir(outDir, { recursive: true });
  const classes = await listClassFiles();
  console.log(`Found ${classes.length} classes; sampling ${perClass} drawings each into ${outDir}`);
  let done = 0;
  for (const cls of classes) {
    const samples = await sampleClass(cls.file, perClass);
    await writeFile(path.join(outDir, `${slugify(cls.name)}.json`), JSON.stringify(samples));
    done += 1;
    if (done % 25 === 0 || done === classes.length) console.log(`${done}/${classes.length} classes`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
