// Cloudflare Workers entrypoint for Freebuff Sites.
//
// workerd cannot run FFmpeg, native canvas, or a persistent filesystem, so this
// build serves the studio UI and the API routes that only need fetch():
// model-written storyboards, prompt planning, provider diagnostics and
// ElevenLabs narration. MP4 export stays on the Node server; the studio's
// browser-recording WebM export works here instead.
import {
  ACTIONS, ANIMATION_STYLES, ASPECT_RATIOS, BACKGROUNDS, DEFAULT_FPS, DEFAULT_RESOLUTION, EFFECTS,
  EMOTIONS, FPS_OPTIONS, HATS, TOPS, ACCESSORIES, LIMITS, RESOLUTIONS, SUBTITLE_POSITIONS, TONES,
} from '../shared/constants.js';
import { validateGenerateRequest, ValidationError } from '../shared/schema.js';
import { providerConfig } from '../shared/provider-config.js';
import { createLlm } from '../server/script/llm.js';
import { createScriptService } from '../server/script/index.js';
import { createVoice } from './elevenlabs.js';

const STARTED_AT = new Date().toISOString();
const MAX_BODY = 1024 * 1024;
const MP4_UNAVAILABLE = 'MP4 export needs FFmpeg, which Freebuff Sites cannot run. Use Export WebM in the studio instead.';

class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; Object.assign(this, extra); }
}

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
});

async function readJson(request) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BODY) throw new HttpError(413, 'Request body is too large.');
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'Request body is too large.');
  if (!text.trim()) return {};
  try { return JSON.parse(text); } catch { throw new HttpError(400, 'Request body must be valid JSON.'); }
}

/** Mutations must come from this site's own origin; foreign Origins get 403. */
function sameOrigin(request, url) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).host === url.host; } catch { return false; }
}

function deployment(env) {
  return {
    revision: String(env.CF_VERSION_METADATA?.id || env.SOURCE_VERSION || 'sites').slice(0, 12),
    generationMode: 'ai-only',
    startedAt: STARTED_AT,
    runtime: 'workers',
  };
}

async function handleApi(request, env, url) {
  const config = providerConfig(env);
  const llm = createLlm(config);
  const voice = createVoice(config);
  const generateScript = createScriptService({ llm });
  const narration = () => voice.status();
  const method = request.method;

  if (method === 'POST' && !sameOrigin(request, url)) throw new HttpError(403, 'Cross-origin requests are not allowed.');

  if ((method === 'GET' || method === 'HEAD') && url.pathname === '/api/health') {
    return json({
      ok: true, uptime: Math.round((Date.now() - Date.parse(STARTED_AT)) / 1000), rssMB: null,
      ffmpeg: false, narration: narration(), llm: llm.status(), exports: 0, deployment: deployment(env),
    });
  }

  if ((method === 'GET' || method === 'HEAD') && url.pathname === '/api/config') {
    return json({
      tones: TONES, styles: ANIMATION_STYLES, aspectRatios: ASPECT_RATIOS, backgrounds: BACKGROUNDS,
      actions: ACTIONS, effects: EFFECTS, emotions: EMOTIONS, subtitlePositions: SUBTITLE_POSITIONS,
      hats: HATS, tops: TOPS, accessories: ACCESSORIES,
      resolutions: RESOLUTIONS, defaultResolution: DEFAULT_RESOLUTION, fpsOptions: FPS_OPTIONS, defaultFps: DEFAULT_FPS,
      ffmpeg: false,
      narration: { ...narration(), available: voice.enabled },
      llm: llm.status(), deployment: deployment(env),
      limits: { minDuration: LIMITS.minDuration, maxDuration: LIMITS.maxDuration, maxCharacters: LIMITS.maxCharacters, maxTopicChars: LIMITS.maxTopicChars },
    });
  }

  if (method === 'POST' && url.pathname === '/api/diagnostics') {
    await llm.checkConnection().catch(() => {});
    return json({ llm: llm.status(), narration: narration(), deployment: deployment(env) });
  }

  if (method === 'POST' && url.pathname === '/api/voice') {
    if (!['auto', 'elevenlabs', 'none'].includes(config.ttsProvider)) throw new HttpError(503, 'This deployment supports ElevenLabs narration only.');
    if (!voice.enabled) throw new HttpError(503, voice.error || 'Natural narration is not configured for this site.');
    const body = await readJson(request);
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, LIMITS.maxNarrationChars) : '';
    if (text.length < 1) throw new HttpError(400, 'Narration text is required.');
    const audio = await voice.synth(text);
    return new Response(audio, {
      status: 200,
      headers: { 'content-type': 'audio/mpeg', 'content-length': String(audio.length), 'cache-control': 'no-store' },
    });
  }

  if (method === 'POST' && url.pathname === '/api/script') {
    const input = validateGenerateRequest(await readJson(request));
    return json(await generateScript(input));
  }

  if (method === 'POST' && url.pathname === '/api/improve-prompt') {
    const body = await readJson(request);
    const topic = typeof body.topic === 'string' ? body.topic.trim().slice(0, LIMITS.maxTopicChars) : '';
    if (topic.length < 3) throw new HttpError(400, 'Enter a topic before improving the prompt.');
    return json({ prompt: await llm.improvePrompt(topic, { duration: body.duration }), source: 'llm' });
  }

  if (method === 'POST' && url.pathname === '/api/prompt/enhance') {
    return json(await llm.enhancePrompt(validateGenerateRequest(await readJson(request))));
  }

  // MP4 rendering is intentionally not emulated here.
  if (url.pathname === '/api/exports' || url.pathname.startsWith('/api/exports/')) {
    throw new HttpError(501, MP4_UNAVAILABLE, { code: 'MP4_UNSUPPORTED', retryable: false });
  }

  throw new HttpError(404, 'Not found.');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health' || url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url);
      } catch (error) {
        if (error instanceof ValidationError) return json({ error: error.message, field: error.field }, 400);
        const status = error?.status || 500;
        const safe = error instanceof HttpError || (typeof error?.code === 'string' && Number.isInteger(error?.status));
        if (!safe) console.error('[worker]', error?.message || error);
        return json({
          error: safe ? error.message : 'Something went wrong. Please try again.',
          ...(safe && error.code ? { code: error.code, retryable: Boolean(error.retryable), retryAfterMs: error.retryAfterMs || 0 } : {}),
        }, status);
      }
    }
    if (!env.ASSETS) return new Response('Not found.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    return env.ASSETS.fetch(request);
  },
};
