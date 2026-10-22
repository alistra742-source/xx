import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { sceneCountFor } from '../shared/schema.js';

const assets = () => {
  const calls = [];
  return {
    calls,
    binding: { fetch: async (request) => { calls.push(request.url); return new Response('<!doctype html><title>studio</title>', { headers: { 'content-type': 'text/html' } }); } },
  };
};
const env = (extra = {}) => ({ ASSETS: assets().binding, ...extra });
const call = (path, init = {}, bindings = env()) => worker.fetch(new Request(`https://preview.test${path}`, init), bindings);
const post = (path, body, bindings, headers = {}) => call(path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }, bindings);

function story(request, label = 'mara') {
  return {
    title: 'The Lighthouse Signal', tone: 'hopeful',
    characters: [{ id: label, name: 'Mara', role: 'keeper', color: '#123456' }],
    scenes: Array.from({ length: sceneCountFor(request.duration) }, (_, i) => ({
      duration: request.duration / sceneCountFor(request.duration), background: 'street',
      purpose: `Beat ${i + 1} advances the rescue`, action: `Mara carries lens part ${i + 1} up the stairs`,
      narration: `She climbs with the glass, part ${i + 1}.`, camera: i % 2 ? 'close' : 'wide', cameraMotion: 'push_in',
      shotDescription: `Frame Mara at step ${i + 1}.`, continuity: `Part ${i + 1} secured.`,
      characters: [{ id: label, action: i % 2 ? 'run' : 'walk', emotion: 'determined' }],
    })),
  };
}
const completion = (value) => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] }), { status: 200, headers: { 'content-type': 'application/json' } });

async function withFetch(handler, work) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try { await work(); } finally { globalThis.fetch = original; }
}

test('worker serves the studio shell and reports an honest unconfigured provider', async () => {
  const shell = env();
  const res = await call('/', {}, shell);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /studio/);

  const config = await (await call('/api/config', {}, env())).json();
  assert.equal(config.llm.enabled, false);
  assert.equal(config.llm.configured, false);
  assert.equal(config.llm.provider, 'local');
  assert.equal(config.narration.available, false);
  assert.equal(config.ffmpeg, false);
  assert.equal(config.deployment.runtime, 'workers');
  assert.ok(config.actions.length > 10 && config.tones.length > 1);
  assert.equal(JSON.stringify(config).includes('apiKey'), false);
});

test('worker writes a built-in storyboard when no model is configured', async () => {
  for (const path of ['/api/script', '/api/prompt/enhance']) {
    const res = await post(path, { topic: 'A violinist repairs a bridge with music', duration: 30 });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.source, 'instant');
    assert.equal(body.project.scenes.length, sceneCountFor(30));
    assert.ok(body.project.characters.length >= 1);
    assert.ok(body.project.scenes.every((scene) => scene.action && scene.narration));
    if (path === '/api/prompt/enhance') { assert.match(body.enhancedPrompt, /Scene 1/); assert.match(body.enhancedPrompt, /Action: /); }
  }
  const improve = await post('/api/improve-prompt', { topic: 'A violinist repairs a bridge' });
  assert.equal(improve.status, 200);
  assert.equal((await improve.json()).source, 'instant');
});

test('worker generates a model story through the Sites API and omits an unset model name', async () => {
  const bindings = env({ LLAMA_URL: 'https://model.test/v1', LLM_ENABLED: 'true' });
  const seen = [];
  await withFetch(async (url, init) => { seen.push({ url: String(url), body: JSON.parse(init.body) }); return completion(story({ duration: 30 })); }, async () => {
    const res = await post('/api/script', { topic: 'A lighthouse keeper races a storm to save a ship', duration: 30 }, bindings);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.project.scenes.length, 6);
    assert.equal(body.source, 'llm');
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, 'https://model.test/v1/chat/completions');
    assert.equal('model' in seen[0].body, false);
    assert.match(seen[0].body.messages[1].content, /lighthouse keeper/);
  });
});

test('worker rejects MP4 export explicitly and keeps narration failures actionable', async () => {
  const mp4 = await post('/api/exports', { project: {} });
  assert.equal(mp4.status, 501);
  const mp4Body = await mp4.json();
  assert.equal(mp4Body.code, 'MP4_UNSUPPORTED');
  assert.match(mp4Body.error, /WebM/);
  assert.equal((await call('/api/exports/0b5e5a68-1111-4222-8333-944455556666')).status, 501);

  const voice = await post('/api/voice', { text: 'The music carries across the river.' });
  assert.equal(voice.status, 503);
  assert.match((await voice.json()).error, /ELEVENLABS/);
  const diagnostics = await (await post('/api/diagnostics', {})).json();
  assert.equal(diagnostics.narration.authenticated, null);
});

test('worker 404s a missing asset instead of serving the SPA shell as JS', async () => {
  // A browser holding a stale bundle hash must not receive index.html for a
  // module request: HTML parsed as JS leaves the page blank.
  const stale = await call('/assets/index-STALEHASH.js', {}, env());
  assert.equal(stale.status, 404);
  assert.match(stale.headers.get('content-type'), /text\/plain/);
  assert.match(await stale.text(), /Not found/);

  const staleCss = await call('/assets/index-STALEHASH.css', {}, env());
  assert.equal(staleCss.status, 404);

  // Client-side routes still fall back to the shell.
  const deep = await call('/some/deep/route', {}, env());
  assert.equal(deep.status, 200);
  assert.match(await deep.text(), /studio/);
});

test('worker guards mutations, JSON bodies and unknown routes', async () => {
  const foreign = await post('/api/script', { topic: 'A long enough premise for a story', duration: 30 }, env(), { origin: 'https://evil.test' });
  assert.equal(foreign.status, 403);

  const same = await post('/api/script', '{', env(), { origin: 'https://preview.test' });
  assert.equal(same.status, 400);

  const big = await post('/api/script', 'x'.repeat(1024 * 1024 + 10));
  assert.equal(big.status, 413);

  assert.equal((await call('/api/nope')).status, 404);
  const health = await (await call('/api/health')).json();
  assert.equal(health.ok, true);
  assert.equal(health.llm.enabled, false);
});
