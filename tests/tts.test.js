import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/index.js';
import { normalizeProject } from '../shared/schema.js';
import { buildNarration, renderMp4 } from '../server/exporter.js';

const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg';

async function listen(app) {
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${app.server.address().port}`;
}

function close(app) {
  app.server.closeAllConnections?.();
  return new Promise((resolve, reject) => app.server.close((err) => err ? reject(err) : resolve()));
}

test('voice endpoint returns non-empty audio and does not echo request metadata', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'voice-endpoint-'));
  const app = await createApp({
    staticDir: temp,
    outputDir: join(temp, 'out'),
    ttsProvider: 'http',
    ttsUrl: 'https://test.invalid/tts',
    ffmpegBin: ffmpeg,
  });
  const originalFetch = globalThis.fetch;
  try {
    const base = await listen(app);
    globalThis.fetch = async (url, options) => {
      if (String(url).startsWith(base)) return originalFetch(url, options);
      assert.match(String(url), /test\.invalid\/tts/);
      assert.match(options.body, /The alarms woke him/);
      return new Response(Buffer.from('RIFF' + 'x'.repeat(48)), { status: 200, headers: { 'content-type': 'audio/wav' } });
    };
    const response = await fetch(`${base}/api/voice`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'The alarms woke him at midnight.', language: 'English' }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'audio/wav');
    assert.ok((await response.arrayBuffer()).byteLength > 44);
  } finally {
    globalThis.fetch = originalFetch;
    await close(app);
    await rm(temp, { recursive: true, force: true });
  }
});

test('Google TTS adapter returns real MP3 data when network TTS responds with audio', async () => {
  const { createTts } = await import('../server/tts.js');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /translate_tts/);
    return new Response(Buffer.from([0xff, 0xfb, ...new Array(256).fill(0x55)]), {
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
    });
  };
  const temp = await mkdtemp(join(tmpdir(), 'gtts-'));
  try {
    const tts = await createTts({ ttsProvider: 'gtts', ttsTimeoutMs: 1000 });
    const path = await tts.synth('Real words spoken aloud.', join(temp, 'voice.wav'), 'English');
    assert.equal(tts.enabled, true);
    assert.equal(path.endsWith('.mp3'), true);
    const { readFile } = await import('node:fs/promises');
    const bytes = await readFile(path);
    assert.ok(bytes.length > 128);
    assert.equal(bytes[0], 0xff);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(temp, { recursive: true, force: true });
  }
});

test('narration-enabled export fails loudly if a TTS adapter returns no voice', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'voice-export-'));
  try {
    const project = normalizeProject({
      duration: 10,
      narration: true,
      scenes: [{ duration: 10, background: 'bedroom', narration: 'The alarms woke him at midnight.', characters: [{ id: 'hero', action: 'wake_up' }] }],
    });
    await assert.rejects(
      renderMp4({
        project,
        options: { resolution: 240, fps: 12 },
        outPath: join(temp, 'out.mp4'),
        workDir: join(temp, 'work'),
        tts: { enabled: true, async synth() { return null; } },
        ffmpegBin: ffmpeg,
      }),
      /no voice was generated/,
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('narration-disabled export does not call TTS', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'no-voice-export-'));
  try {
    const project = normalizeProject({
      duration: 10,
      narration: false,
      scenes: [{ duration: 10, background: 'bedroom', narration: '', characters: [{ id: 'hero', action: 'wake_up' }] }],
    });
    let called = false;
    const audio = await buildNarration({
      project,
      tts: { enabled: false, async synth() { called = true; return null; } },
      dir: temp,
      lang: 'English',
      bin: 'definitely-not-an-ffmpeg-binary',
    });
    assert.equal(audio, null);
    assert.equal(called, false);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
