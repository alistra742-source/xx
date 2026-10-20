// Narration provider adapters. Each adapter either produces a real WAV file or
// returns null. Audio is never fabricated: when no provider is available the
// video is rendered with subtitles only.
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

function run(cmd, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stderr.on('data', (d) => { if (err.length < 2000) err += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}: ${err.trim().slice(0, 200)}`));
    });
  });
}

const espeak = (bin, timeoutMs) => ({
  name: 'espeak',
  async available() {
    try { await run(bin, ['--version'], 5000); return true; } catch { return false; }
  },
  async synth(text, outPath, lang) {
    await run(bin, ['-v', lang || 'en', '-s', '150', '-w', outPath, text], timeoutMs);
    return outPath;
  },
});

const http = (url, timeoutMs) => ({
  name: 'http',
  async available() { return true; },
  async synth(text, outPath, lang) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, language: lang }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`TTS endpoint responded ${res.status}`);
      const type = res.headers.get('content-type') || '';
      if (!type.includes('audio')) throw new Error(`TTS endpoint returned ${type || 'no content type'}, expected audio`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 44) throw new Error('TTS endpoint returned an empty audio file');
      await writeFile(outPath, buf);
      return outPath;
    } finally {
      clearTimeout(timer);
    }
  },
});

const none = { name: 'none', async available() { return false; }, async synth() { return null; } };

/** Pick a provider from config. Resolves availability once at startup. */
export async function createTts(config) {
  let provider = none;
  if (config.ttsProvider === 'espeak') provider = espeak(config.espeakBin, config.ttsTimeoutMs);
  if (config.ttsProvider === 'http' && config.ttsUrl) provider = http(config.ttsUrl, config.ttsTimeoutMs);
  const ok = await provider.available();
  return {
    name: ok ? provider.name : 'none',
    enabled: ok,
    synth: (text, outPath, lang) => (ok ? provider.synth(text, outPath, lang) : Promise.resolve(null)),
  };
}
