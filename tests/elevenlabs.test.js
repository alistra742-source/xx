import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTts } from '../server/tts.js';
import { loadConfig } from '../server/config.js';

const fakeMp3 = () => Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x64]), Buffer.alloc(200, 1)]);

async function withFetch(impl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try { return await fn(); } finally { globalThis.fetch = original; }
}

test('auto mode selects ElevenLabs when ELEVENLABS_API is set and writes a real MP3', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'eleven-'));
  try {
    let seen;
    await withFetch(async (url, options) => {
      seen = { url: String(url), options };
      return new Response(fakeMp3(), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
    }, async () => {
      const tts = await createTts({ ttsProvider: 'auto', elevenLabsApiKey: 'test-key', elevenLabsVoiceId: 'voice123', ttsTimeoutMs: 5000 });
      assert.equal(tts.name, 'elevenlabs-neural-male');
      const out = await tts.synth('Hello narrator', join(dir, 'line'), 'English');
      assert.ok(out.endsWith('.mp3'));
      const bytes = await readFile(out);
      assert.equal(bytes[0], 0xff);
    });
    assert.match(seen.url, /api\.elevenlabs\.io\/v1\/text-to-speech\/voice123/);
    assert.equal(seen.options.headers['xi-api-key'], 'test-key');
    assert.match(seen.options.body, /Hello narrator/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('ElevenLabs errors surface instead of producing silent audio', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'eleven-'));
  try {
    await withFetch(async () => new Response('quota exceeded', { status: 401 }), async () => {
      const tts = await createTts({ ttsProvider: 'elevenlabs', elevenLabsApiKey: 'bad', ttsTimeoutMs: 5000 });
      await assert.rejects(() => tts.synth('x', join(dir, 'line'), 'English'), /ElevenLabs responded 401/);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('TTS_PROVIDER=elevenlabs without a key fails loudly', async () => {
  await assert.rejects(() => createTts({ ttsProvider: 'elevenlabs', elevenLabsApiKey: '' }), /requires ELEVENLABS_API/);
});

test('both trimmed environment aliases configure neural voice; standard alias wins', async () => {
  assert.equal(loadConfig({ ELEVENLABS_API: ' alias ' }).elevenLabsApiKey, 'alias');
  assert.equal(loadConfig({ ELEVENLABS_API_KEY: ' standard ', ELEVENLABS_API: 'alias' }).elevenLabsApiKey, 'standard');
  assert.equal(loadConfig({ ELEVENLABS_API_KEY: ' ', ELEVENLABS_API: ' alias ' }).elevenLabsApiKey, 'alias');
});

test('auto without key is actionable and never probes robotic providers', async () => {
  const tts = await createTts({ ttsProvider: 'auto', espeakBin: 'not-installed' });
  assert.equal(tts.enabled, false);
  assert.equal(tts.status().provider, 'elevenlabs');
  assert.equal(tts.status().authenticated, null);
  await assert.rejects(tts.synth('hello', '/unused'), /set ELEVENLABS_API or ELEVENLABS_API_KEY/);
});

test('male defaults, natural settings, ID3 audio, and explicit setting overrides', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'eleven-defaults-'));
  try {
    let calls = 0;
    await withFetch(async (url, options) => {
      const body = JSON.parse(options.body);
      assert.match(String(url), /pNInz6obpgDQGcFmaJgB/);
      assert.equal(options.headers['xi-api-key'], 'secret');
      assert.equal(body.model_id, 'eleven_multilingual_v2');
      assert.equal(body.voice_settings.stability, calls++ ? 0.6 : 0.4);
      assert.equal(body.voice_settings.speed, 1);
      return new Response(Buffer.concat([Buffer.from('ID3'), Buffer.alloc(200)]), { headers: { 'content-type': 'audio/mpeg' } });
    }, async () => {
      const tts = await createTts({ elevenLabsApiKey: ' secret ' });
      await tts.synth('hello', join(dir, 'a'));
      assert.equal(tts.status().authenticated, true);
      assert.doesNotMatch(JSON.stringify(tts.status()), /secret/);
      const custom = await createTts({ elevenLabsApiKey: 'secret', elevenLabsStability: 0.6 });
      await custom.synth('hello', join(dir, 'b'));
    });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('auto bad key never falls back and sanitized errors retain selected provider', async () => {
  let calls = 0;
  await withFetch(async () => { calls++; return new Response('secret-key private narration', { status: 401 }); }, async () => {
    const tts = await createTts({ elevenLabsApiKey: 'secret-key', espeakBin: 'never-run' });
    await assert.rejects(tts.synth('private narration', '/unused'), (error) => {
      assert.equal(error.code, 'TTS_BAD_KEY'); assert.doesNotMatch(error.message, /secret-key|private narration/); return true;
    });
    assert.equal(calls, 1);
    assert.equal(tts.status().provider, 'elevenlabs');
    assert.equal(tts.status().configured, true);
    assert.equal(tts.status().authenticated, false);
    assert.doesNotMatch(JSON.stringify(tts.status()), /secret-key|private narration/);
  });
});

test('upstream quota and voice statuses become actionable typed errors, not body echoes', async () => {
  for (const [status, reason, code] of [[401, 'quota_exceeded', 'TTS_QUOTA_EXCEEDED'], [404, 'voice_not_found', 'TTS_VOICE_NOT_FOUND'], [429, '', 'TTS_RATE_LIMITED']]) {
    await withFetch(async () => new Response(JSON.stringify({ detail: { status: reason, message: 'private-key' } }), { status }), async () => {
      const tts = await createTts({ elevenLabsApiKey: 'private-key' });
      await assert.rejects(tts.synth('hello', '/unused'), (error) => error.code === code && !error.message.includes('private-key'));
    });
  }
});

test('timeout covers stalled fetch and entire response body; rejects oversized and fake audio', async () => {
  const responses = [
    () => new Promise(() => {}),
    () => new Response(new ReadableStream({ start() {} }), { headers: { 'content-type': 'audio/mpeg' } }),
    () => new Response('small', { headers: { 'content-type': 'audio/mpeg', 'content-length': '10485761' } }),
    () => new Response(Buffer.alloc(200, 1), { headers: { 'content-type': 'audio/mpeg' } }),
  ];
  for (let i = 0; i < responses.length; i++) {
    await withFetch(responses[i], async () => {
      const tts = await createTts({ elevenLabsApiKey: 'secret', ttsTimeoutMs: 15 });
      await assert.rejects(tts.synth('hello', '/unused'), (error) => error.code === (i < 2 ? 'TTS_TIMEOUT' : i === 2 ? 'TTS_AUDIO_TOO_LARGE' : 'TTS_INVALID_AUDIO'));
    });
  }
});

test('none explicitly disables narration even when neural key configured', async () => {
  const tts = await createTts({ ttsProvider: 'none', elevenLabsApiKey: 'secret' });
  assert.equal(tts.enabled, false); assert.equal(tts.status().quality, 'disabled');
  assert.equal(await tts.synth('hello', '/unused'), null);
  await assert.rejects(createTts({ ttsProvider: 'http' }), /TTS_URL/);
  await assert.rejects(createTts({ ttsProvider: 'typo' }), /Unknown TTS_PROVIDER/);
});
