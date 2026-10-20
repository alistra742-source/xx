// Narration provider adapters. Each adapter either produces a real audio file or
// returns null. Audio is never fabricated: when no provider is available or
// TTS_PROVIDER=none, the video is rendered with subtitles only.
//
// In 'auto' mode we prefer a configured ElevenLabs neural voice, then local
// eSpeak NG, then Google TTS. All adapters return real audio bytes/files only.
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
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
  };
  if (map[s]) return map[s];
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
    await run(bin, ['-v', v === 'en' ? 'en-us+m3' : v, '-s', '148', '-p', '42', '-w', outPath, text], timeoutMs);
    return outPath;
  },
});

const gtts = (timeoutMs) => ({
  name: 'google-tts',
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
        buffers.push(buf);
      } finally {
        clearTimeout(timer);
      }
    }
    const mp3Path = `${outPath}.mp3`;
    await writeFile(mp3Path, Buffer.concat(buffers));
    // Re-open and validate the provider's returned bytes before exposing an audio file.
    const mp3 = await readFile(mp3Path);
    if (mp3.length < 128 || mp3[0] !== 0xff || (mp3[1] & 0xe0) !== 0xe0) {
      throw new Error('Google TTS response was not a valid MP3 stream');
    }
    return mp3Path;
  },
});

const elevenLabs = (config, timeoutMs) => ({
  name: 'elevenlabs-neural-male',
  async available() { return Boolean(config.elevenLabsApiKey); },
  async synth(text, outPath, lang) {
    const voiceId = config.elevenLabsVoiceId || 'pNInz6obpgDQGcFmaJgB';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'xi-api-key': config.elevenLabsApiKey,
          'content-type': 'application/json',
          accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: config.elevenLabsModelId || 'eleven_multilingual_v2',
          voice_settings: { stability: 0.48, similarity_boost: 0.78, style: 0.18, use_speaker_boost: true, speed: 0.94 },
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const message = (await res.text()).slice(0, 240);
        throw new Error(`ElevenLabs responded ${res.status}: ${message}`);
      }
      const type = res.headers.get('content-type') || '';
      if (!type.toLowerCase().includes('audio')) throw new Error(`ElevenLabs returned ${type || 'no content type'}, expected audio`);
      const audio = Buffer.from(await res.arrayBuffer());
      if (audio.length < 128 || audio[0] !== 0xff || (audio[1] & 0xe0) !== 0xe0) throw new Error('ElevenLabs returned an invalid MP3 stream');
      const mp3Path = `${outPath}.mp3`;
      await writeFile(mp3Path, audio);
      return mp3Path;
    } finally {
      clearTimeout(timer);
    }
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
  const neural = elevenLabs(config, timeout);

  if (mode === 'none') {
    return { name: 'none', enabled: false, synth: async () => null };
  }

  if (mode === 'espeak') {
    const p = espeak(espeakBin, timeout);
    const ok = await p.available();
    if (!ok) throw new Error(`TTS_PROVIDER=espeak requested but ${espeakBin} was not found.`);
    return { name: p.name, enabled: true, synth: (t, o, l) => p.synth(t, o, l) };
  }

  if (mode === 'elevenlabs') {
    if (!config.elevenLabsApiKey) throw new Error('TTS_PROVIDER=elevenlabs requires ELEVENLABS_API.');
    return { name: neural.name, enabled: true, synth: (t, o, l) => neural.synth(t, o, l) };
  }

  if (mode === 'http') {
    if (!config.ttsUrl) throw new Error('TTS_PROVIDER=http requires TTS_URL.');
    const p = http(config.ttsUrl, timeout);
    return { name: 'http', enabled: true, synth: (t, o, l) => p.synth(t, o, l) };
  }

  if (mode === 'gtts') {
    const p = gtts(timeout);
    return { name: p.name, enabled: true, synth: (t, o, l) => p.synth(t, o, l) };
  }

  // 'auto': paid/keyed neural voice first; offline eSpeak NG next; network Google TTS last.
  const esp = espeak(espeakBin, timeout);
  const hasEsp = await esp.available();
  const gt = gtts(timeout);
  const useNeural = await neural.available();

  // Free voices are the fallback: a failing ElevenLabs call (bad key, quota, network)
  // must never stop narration, so the user still gets voiced output.
  return {
    name: useNeural ? neural.name : (hasEsp ? 'espeak-ng' : 'google-tts'),
    enabled: true,
    async synth(text, outPath, lang) {
      if (useNeural) {
        try {
          return await neural.synth(text, outPath, lang);
        } catch (err) {
          console.warn(`ElevenLabs narration failed, falling back to free voice: ${err.message}`);
        }
      }
      if (hasEsp) {
        try { return await esp.synth(text, outPath, lang); } catch { /* fall through to gtts */ }
      }
      return gt.synth(text, outPath, lang);
    },
  };
}
