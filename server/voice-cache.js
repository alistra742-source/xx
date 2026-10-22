// Bounded, process-local audio cache. Preview, replay and export share audio;
// keys are hashes, not narration text, and no files survive a provider failure.
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readWordTimings } from './tts.js';

export function withVoiceCache(provider, { maxBytes = 16 * 1024 * 1024, ttlMs = 10 * 60 * 1000, maxPending = 3 } = {}) {
  const cache = new Map();
  const pending = new Map();
  let bytes = 0;
  const remove = (key) => { const entry = cache.get(key); if (entry) bytes -= entry.bytes.length; cache.delete(key); };
  function put(key, entry) {
    if (entry.bytes.length > maxBytes) return;
    for (const [old, value] of cache) if (Date.now() - value.createdAt > ttlMs) remove(old);
    while (bytes + entry.bytes.length > maxBytes && cache.size) remove(cache.keys().next().value);
    cache.set(key, entry); bytes += entry.bytes.length;
  }
  async function getAudio(text, language) {
    const key = createHash('sha256').update(`${provider.name}\0${language}\0${text}`).digest('hex');
    const entry = cache.get(key);
    if (entry && Date.now() - entry.createdAt <= ttlMs) { cache.delete(key); cache.set(key, entry); return entry; }
    if (entry) remove(key);
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= maxPending) {
      const error = new Error('Voice requests are busy. Wait a moment and retry.');
      Object.assign(error, { status: 429, code: 'VOICE_BUSY', retryable: true }); throw error;
    }
    const promise = (async () => {
      const dir = await mkdtemp(join(tmpdir(), 'story-voice-cache-'));
      try {
        const file = await provider.synth(text, join(dir, 'voice.wav'), language);
        if (!file) return null;
        const audio = await readFile(file);
        if (audio.length < 44 || audio.length > 10 * 1024 * 1024) throw new Error('The voice provider returned invalid audio size.');
        const words = await readWordTimings(file);
        const value = { bytes: audio, extension: file.endsWith('.mp3') ? '.mp3' : '.wav', words, createdAt: Date.now() };
        put(key, value); return value;
      } finally { await rm(dir, { recursive: true, force: true }); }
    })();
    pending.set(key, promise);
    try { return await promise; } finally { pending.delete(key); }
  }
  return {
    ...provider,
    async synth(text, outPath, language) {
      const audio = await getAudio(String(text || ''), String(language || 'English'));
      if (!audio) return null;
      const destination = audio.extension === '.mp3' ? `${outPath}.mp3` : outPath;
      await writeFile(destination, audio.bytes);
      if (audio.words?.length) await writeFile(`${destination}.words.json`, JSON.stringify(audio.words));
      return destination;
    },
  };
}
