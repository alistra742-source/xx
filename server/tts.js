// Narration provider adapters. Each adapter either produces a real audio file or
// returns null. Audio is never fabricated: when no provider is available or
// TTS_PROVIDER=none, the video is rendered with subtitles only.
//
// In 'auto' mode (the default), we first check for local `espeak-ng` (installed in
// the Railway Dockerfile) and fall back to free Google Translate TTS (`gtts`),
// which returns spoken MP3 audio that ffmpeg converts/pads into the scene WAV.
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

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

function langCode(lang = 'English') {
  const s = String(lang || 'en').toLowerCase().trim();
  const map = {
    english: 'en', en: 'en', spanish: 'es', es: 'es', french: 'fr', fr: 'fr',
    german: 'de', de: 'de', portuguese: 'pt', pt: 'pt', italian: 'it', it: 'it',
    japanese: 'ja', ja: 'ja', korean: 'ko', ko: 'ko', hindi: 'hi', hi: 'hi',
    arabic: 'ar', ar: 'ar', russian: 'ru', ru: 'ru', turkish: 'tr', tr: 'tr',
  };    if (map[s]) return map[s];
    const match = /^([a-z]{2})(?:[-_][a-z]{2})?$/i.exec(s);
    return match ? match[1].toLowerCase() : 'en';
}

const espeak = (bin, timeoutMs) => ({
  name: 'espeak-ng',
  async available() {
    try { await run(bin, ['--version'], 4000); return true; } catch { return false; }
  },
  async synth(text, outPath, lang) {
    const v = langCode(lang);
    // espeak-ng accepts voice names (en, es, etc.) via -v; `v` stays as safe, two-letter locale.
    await run(bin, ['-v', v, '-s', '158', '-p', '48', '-w', outPath, text], timeoutMs);
    return outPath;
  },
});

const gtts = (timeoutMs) => ({
  name: 'neural-tts',
  async available() { return true; },
  async synth(text, outPath, lang) {
    const tl = langCode(lang);
    // Split text into <= 180 char chunks so the endpoint never truncates
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    const chunks = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (next.length > 180 && cur) { chunks.push(cur); cur = w; }
      else cur = next;
    }
    if (cur) chunks.push(cur);
    if (!chunks.length) return null;

    const buffers = [];
    for (const chunk of chunks) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const u = `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(chunk)}`;
        const res = await fetch(u, {
          headers: { 'user-agent': 'Mozilla/5.0' },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`gtts responded ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 128) throw new Error('gtts returned empty audio');
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.startsWith('audio/')) throw new Error(`gtts returned ${contentType || 'no content-type'} instead of audio`);
        // Google's endpoint returns MP3; convert each response into a PCM WAV segment
        // through ffmpeg? No binary/temp path is passed here, so retain real MP3 bytes
        // and let the exporter decode them in its next ffmpeg normalization step.
        buffers.push(buf);
      } finally {
        clearTimeout(timer);
      }
    }
    const mp3Path = `${outPath}.mp3`;
    await writeFile(mp3Path, Buffer.concat(buffers));
    return mp3Path;
  },
});

const http = (url, timeoutMs) => ({
  name: 'http',
  async available() { return Boolean(url); },
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

/** Pick a provider from config. Resolves availability once at startup, with fallback in auto mode. */
export async function createTts(config = {}) {
  const mode = config.ttsProvider || 'auto';
  const timeout = config.ttsTimeoutMs || 30000;
  const espeakBin = config.espeakBin || 'espeak-ng';

  if (mode === 'none') {
    return { name: 'none', enabled: false, synth: async () => null };
  }

  if (mode === 'espeak') {
    const p = espeak(espeakBin, timeout);
    const ok = await p.available();
    return { name: ok ? p.name : 'none', enabled: ok, synth: (t, o, l) => (ok ? p.synth(t, o, l) : Promise.resolve(null)) };
  }

  if (mode === 'http' && config.ttsUrl) {
    const p = http(config.ttsUrl, timeout);
    return { name: 'http', enabled: true, synth: (t, o, l) => p.synth(t, o, l) };
  }

  if (mode === 'gtts') {
    const p = gtts(timeout);
    return { name: p.name, enabled: true, synth: (t, o, l) => p.synth(t, o, l) };
  }

  // 'auto': try espeak-ng first (offline & fast in Docker), otherwise fall back to gtts, and if espeak fails on a call, fall back to gtts.
  const esp = espeak(espeakBin, timeout);
  const hasEsp = await esp.available();
  const gt = gtts(timeout);

  return {
    name: hasEsp ? 'espeak-ng' : 'online-tts-fallback',
    enabled: true,
    async synth(text, outPath, lang) {
      if (hasEsp) {
        try { return await esp.synth(text, outPath, lang); } catch { /* fall through to gtts */ }
      }
      return gt.synth(text, outPath, lang);
    },
  };
}
