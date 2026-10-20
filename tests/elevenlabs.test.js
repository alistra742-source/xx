import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTts } from '../server/tts.js';

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
