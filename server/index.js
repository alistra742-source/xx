// HTTP server: JSON API + static frontend. Uses only Node's built-in http module.
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTIONS, ANIMATION_STYLES, ASPECT_RATIOS, BACKGROUNDS, DEFAULT_FPS, DEFAULT_RESOLUTION, EFFECTS, EMOTIONS, FPS_OPTIONS, LIMITS, RESOLUTIONS, SUBTITLE_POSITIONS, TONES } from '../shared/constants.js';
import { normalizeProject, validateGenerateRequest, ValidationError } from '../shared/schema.js';
import { loadConfig } from './config.js';
import { createJobs } from './jobs.js';
import { renderMp4, frameSize } from './exporter.js';
import { createLlm } from './script/llm.js';
import { createScriptService } from './script/index.js';
import { createTts } from './tts.js';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const MAX_BODY = 1024 * 1024;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { 'content-type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(payload);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw new HttpError(413, 'Request body is too large.');
    chunks.push(c);
  }
  if (!size) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'Request body must be valid JSON.'); }
}

function checkFfmpeg(bin) {
  return new Promise((resolve) => {
    const child = spawn(bin, ['-version'], { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

export async function createApp(overrides = {}) {
  const config = { ...loadConfig(), ...overrides };
  const ffmpegOk = await checkFfmpeg(config.ffmpegBin);
  const tts = await createTts(config);
  const llm = createLlm(config);
  const generateScript = createScriptService({ llm });
  const jobs = createJobs({ maxQueue: config.maxQueue, ttlMs: config.jobTtlMs });
  await mkdir(config.outputDir, { recursive: true });

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;

    if (req.method === 'GET' && (path === '/api/health' || path === '/health')) {
      const m = process.memoryUsage();
      return send(res, 200, {
        ok: true, uptime: Math.round(process.uptime()), rssMB: Math.round(m.rss / 1048576),
        ffmpeg: ffmpegOk, narration: tts.name, llm: llm.status(), exports: jobs.size(),
      });
    }

    if (req.method === 'GET' && path === '/api/config') {
      return send(res, 200, {
        tones: TONES, styles: ANIMATION_STYLES, aspectRatios: ASPECT_RATIOS, backgrounds: BACKGROUNDS,
        actions: ACTIONS, effects: EFFECTS, emotions: EMOTIONS, subtitlePositions: SUBTITLE_POSITIONS,
        resolutions: RESOLUTIONS, defaultResolution: DEFAULT_RESOLUTION, fpsOptions: FPS_OPTIONS, defaultFps: DEFAULT_FPS,
        ffmpeg: ffmpegOk, narration: { provider: tts.name, available: tts.enabled }, llm: { enabled: llm.enabled() },
        limits: { minDuration: LIMITS.minDuration, maxDuration: LIMITS.maxDuration },
      });
    }

    if (req.method === 'POST' && path === '/api/script') {
      const input = validateGenerateRequest(await readJson(req));
      const result = await generateScript(input);
      return send(res, 200, result);
    }

    if (req.method === 'POST' && path === '/api/exports') {
      if (!ffmpegOk) throw new HttpError(503, 'MP4 export is unavailable: ffmpeg was not found on this server.');
      const body = await readJson(req);
      const project = normalizeProject(body.project ?? {}, {});
      const resolution = RESOLUTIONS.includes(Number(body.resolution)) ? Number(body.resolution) : DEFAULT_RESOLUTION;
      const fps = FPS_OPTIONS.includes(Number(body.fps)) ? Number(body.fps) : DEFAULT_FPS;
      const { W, H } = frameSize(project.aspectRatio, resolution);
      const view = jobs.submit(async ({ id, signal, onProgress, setOutput }) => {
        const outPath = join(config.outputDir, `${id}.mp4`);
        setOutput(outPath);
        return renderMp4({
          project, options: { resolution, fps }, outPath, workDir: join(config.outputDir, `work-${id}`),
          tts, ffmpegBin: config.ffmpegBin, signal, onProgress,
        });
      });
      return send(res, 202, { job: view, width: W, height: H, fps, format: 'mp4' });
    }

    const m = path.match(/^\/api\/exports\/([0-9a-f-]{36})(\/cancel|\/download)?$/);
    if (m) {
      const [, id, action] = m;
      if (req.method === 'POST' && action === '/cancel') {
        const job = jobs.cancel(id);
        if (!job) throw new HttpError(404, 'Export not found.');
        return send(res, 200, { job });
      }
      if (req.method === 'GET' && action === '/download') {
        const raw = jobs.raw(id);
        if (!raw) throw new HttpError(404, 'Export not found or expired.');
        if (raw.status !== 'done' || !raw.outPath) throw new HttpError(409, 'Video is not ready yet.');
        const st = await stat(raw.outPath).catch(() => null);
        if (!st) throw new HttpError(410, 'The video file has expired. Please export again.');
        res.writeHead(200, {
          'content-type': 'video/mp4', 'content-length': st.size,
          'content-disposition': `attachment; filename="stick-video-${id.slice(0, 8)}.mp4"`, 'cache-control': 'no-store',
        });
        createReadStream(raw.outPath).pipe(res);
        return undefined;
      }
      if (req.method === 'GET' && !action) {
        const job = jobs.get(id);
        if (!job) throw new HttpError(404, 'Export not found.');
        return send(res, 200, { job });
      }
    }

    if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(path, res, config.staticDir);
    throw new HttpError(404, 'Not found.');
  }

  const server = createServer(async (req, res) => {
    try {
      await handle(req, res);
    } catch (err) {
      if (res.headersSent) { res.destroy(); return; }
      if (err instanceof ValidationError) return send(res, 400, { error: err.message, field: err.field });
      const status = err.status || 500;
      if (status >= 500) console.error('[server]', err);
      send(res, status, { error: status >= 500 && !(err instanceof HttpError) ? 'Something went wrong. Please try again.' : err.message });
    }
  });
  return { server, config, jobs };
}

async function serveStatic(path, res, dir) {
  const safe = normalize(decodeURIComponent(path)).replace(/^(\.\.[/\\])+/, '');
  let file = join(dir, safe);
  let st = await stat(file).catch(() => null);
  if (!st || st.isDirectory()) {
    if (path.startsWith('/api/')) throw new HttpError(404, 'Not found.');
    file = join(dir, 'index.html');
    st = await stat(file).catch(() => null);
    if (!st) return send(res, 200, 'Frontend not built. Run npm run build.');
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'content-length': st.size,
    'cache-control': file.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
  createReadStream(file).pipe(res);
}

// Start when executed directly (not when imported by tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { server, config } = await createApp();
  server.listen(config.port, config.host, () => {
    console.log(`Stick-figure video maker listening on http://${config.host}:${config.port}`);
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
