import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { withVoiceCache } from '../server/voice-cache.js';

test('voice cache shares concurrent synthesis and preview/export audio', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'voice-cache-test-'));
  let calls = 0;
  const provider = { name: 'mock-neural', enabled: true, status: () => ({ authenticated: true }), async synth(text, path) {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 10));
    await writeFile(`${path}.mp3`, Buffer.alloc(128, 7));
    return `${path}.mp3`;
  } };
  try {
    const cached = withVoiceCache(provider);
    const paths = await Promise.all([cached.synth('hello', join(dir, 'a')), cached.synth('hello', join(dir, 'b'))]);
    assert.equal(calls, 1);
    assert.deepEqual(await readFile(paths[0]), await readFile(paths[1]));
    await cached.synth('hello', join(dir, 'c'));
    assert.equal(calls, 1);
    await cached.synth('hello', join(dir, 'd'), 'Arabic');
    assert.equal(calls, 2);
    assert.equal(cached.status().authenticated, true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('voice cache never caches failures or exceeds pending request limit', async () => {
  let calls = 0;
  const cached = withVoiceCache({ name: 'mock', async synth() {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 15));
    throw Object.assign(new Error('Provider rate limited'), { code: 'TTS_RATE_LIMITED', status: 503 });
  } }, { maxPending: 1 });
  const pending = cached.synth('one', '/unused');
  await assert.rejects(cached.synth('two', '/unused'), { code: 'VOICE_BUSY' });
  await assert.rejects(pending, { code: 'TTS_RATE_LIMITED' });
  await assert.rejects(cached.synth('one', '/unused'), { code: 'TTS_RATE_LIMITED' });
  assert.equal(calls, 2);
});
