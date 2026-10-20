// Server-only narration adapters. Lower-quality voices require explicit opt-in;
// a neural-provider failure must never silently change the narrator.
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

export class TtsError extends Error {
  constructor(message, { status = 503, code = 'TTS_UNAVAILABLE', retryable = false } = {}) {
    super(message); this.name = 'TtsError'; this.status = status; this.code = code; this.retryable = retryable;
  }
}
const missingKey = 'Natural male narration is unavailable: set ELEVENLABS_API or ELEVENLABS_API_KEY on the server, then restart. Or explicitly select TTS_PROVIDER=espeak/gtts for a lower-quality voice.';
const MAX_BYTES = 10 * 1024 * 1024;
const clean = (value) => String(value || '').trim();
const clamp = (value, fallback, min, max) => Number.isFinite(Number(value)) && value !== undefined ? Math.max(min, Math.min(max, Number(value))) : fallback;

function validMp3(bytes) {
  if (bytes.length < 128) return false;
  if (bytes.subarray(0, 3).toString() === 'ID3') return true;
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 && (bytes[1] & 6) !== 0 && (bytes[2] & 0xf0) !== 0xf0 && (bytes[2] & 0x0c) !== 0x0c;
}
async function boundedBody(res, limit) {
  const length = Number(res.headers.get('content-length'));
  if (length > limit) { await res.body?.cancel().catch(() => {}); throw new TtsError('Voice response exceeded the safe audio size limit.', { code: 'TTS_AUDIO_TOO_LARGE' }); }
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader(); const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new TtsError('Voice response exceeded the safe audio size limit.', { code: 'TTS_AUDIO_TOO_LARGE' }); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
function upstreamError(status, bytes, provider) {
  // Only classify allowlisted status codes; never expose the upstream body,
  // which can contain credentials, request text, or other private metadata.
  let reason = '';
  try { const json = JSON.parse(bytes.toString()); reason = json?.detail?.status || json?.error?.code || ''; } catch { /* arbitrary upstream text is private */ }
  if (reason === 'quota_exceeded' || reason === 'insufficient_credits') return new TtsError(`${provider} quota exhausted. Add credits or check the account plan.`, { code: 'TTS_QUOTA_EXCEEDED' });
  if (status === 401 || reason === 'invalid_api_key') return new TtsError(`${provider} responded 401: API key rejected. Check the server key and text-to-speech permission.`, { code: 'TTS_BAD_KEY' });
  if (status === 404 || reason === 'voice_not_found') return new TtsError(`${provider} voice was not found. Check ELEVENLABS_VOICE_ID and account voice access.`, { code: 'TTS_VOICE_NOT_FOUND' });
  if (status === 403) return new TtsError(`${provider} denied voice access. Check key permissions, voice access, and account plan.`, { code: 'TTS_ACCESS_DENIED' });
  if (status === 429) return new TtsError(`${provider} is rate limited or out of credits. Check account quota and retry shortly.`, { code: 'TTS_RATE_LIMITED', retryable: true });
  return new TtsError(`${provider} responded ${status}. Check voice/model configuration or retry later.`, { code: 'TTS_PROVIDER_ERROR', retryable: status >= 500 });
}
async function requestAudio(url, options, timeoutMs, provider, mp3 = true) {
  const controller = new AbortController(); let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new TtsError(`${provider} narration timed out. Please retry.`, { code: 'TTS_TIMEOUT', retryable: true })); }, timeoutMs); });
  try {
    return await Promise.race([timeout, (async () => {
      const res = await fetch(url, { ...options, signal: controller.signal });
      if (!res.ok) {
        let body = Buffer.alloc(0);
        try { body = await boundedBody(res, 8192); } catch { /* status alone is sufficient */ }
        throw upstreamError(res.status, body, provider);
      }
      const bytes = await boundedBody(res, MAX_BYTES);
      const type = res.headers.get('content-type') || '';
      const wav = bytes.length >= 44 && bytes.subarray(0, 4).toString() === 'RIFF';
      if (!/^audio\//i.test(type) || (mp3 ? !validMp3(bytes) : !(wav || validMp3(bytes)))) throw new TtsError(`${provider} returned invalid audio. Please retry or check provider configuration.`, { code: 'TTS_INVALID_AUDIO' });
      return bytes;
    })()]);
  } catch (err) {
    if (err instanceof TtsError) throw err;
    throw new TtsError(`${provider} could not be reached. Please retry.`, { code: 'TTS_NETWORK_ERROR', retryable: true });
  } finally { clearTimeout(timer); controller.abort(); }
}
function run(bin, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: 'ignore' });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', () => { clearTimeout(timer); reject(new TtsError('Explicit eSpeak voice is unavailable. Install espeak-ng or configure ElevenLabs.')); });
    child.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new TtsError('Explicit eSpeak voice failed to generate narration.')); });
  });
}
function langCode(lang) {
  const value = clean(lang || 'en').toLowerCase();
  return ({ english: 'en', spanish: 'es', french: 'fr', german: 'de', portuguese: 'pt', italian: 'it', japanese: 'ja', korean: 'ko', hindi: 'hi', arabic: 'ar', russian: 'ru', turkish: 'tr' })[value] || (/^[a-z]{2}(?:[-_][a-z]{2})?$/.test(value) ? value.slice(0, 2) : 'en');
}

export async function createTts(config = {}) {
  const mode = clean(config.ttsProvider || 'auto').toLowerCase();
  const key = clean(config.elevenLabsApiKey) || clean(config.ELEVENLABS_API_KEY) || clean(config.ELEVENLABS_API);
  const voiceId = clean(config.elevenLabsVoiceId) || 'pNInz6obpgDQGcFmaJgB';
  const model = clean(config.elevenLabsModelId) || 'eleven_multilingual_v2';
  const timeout = clamp(config.ttsTimeoutMs, 30000, 1, 120000);
  let provider = mode === 'auto' ? 'elevenlabs' : mode;
  let configured = false, quality = 'unavailable', synth;
  let authenticated = null, lastError = null;
  if (provider === 'elevenlabs') {
    configured = Boolean(key); quality = 'neural';
    if (!configured && mode === 'elevenlabs') throw new TtsError(`TTS_PROVIDER=elevenlabs requires ELEVENLABS_API or ELEVENLABS_API_KEY. ${missingKey}`);
    synth = async (text, outPath) => {
      if (!configured) throw new TtsError(missingKey, { code: 'TTS_NOT_CONFIGURED' });
      const audio = await requestAudio(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
        method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: model, voice_settings: {
          stability: clamp(config.elevenLabsStability, 0.4, 0, 1), similarity_boost: clamp(config.elevenLabsSimilarityBoost, 0.78, 0, 1),
          style: clamp(config.elevenLabsStyle, 0.25, 0, 1), use_speaker_boost: config.elevenLabsUseSpeakerBoost !== false,
          speed: clamp(config.elevenLabsSpeed, 1, 0.7, 1.2),
        } }),
      }, timeout, 'ElevenLabs');
      authenticated = true;
      const path = `${outPath}.mp3`; await writeFile(path, audio); return path;
    };
  } else if (provider === 'none') {
    quality = 'disabled'; synth = async () => null;
  } else if (provider === 'espeak') {
    quality = 'robotic-explicit';
    await run(config.espeakBin || 'espeak-ng', ['--version'], 4000); configured = true;
    synth = async (text, path, lang) => { await run(config.espeakBin || 'espeak-ng', ['-v', langCode(lang) === 'en' ? 'en-us+m3' : langCode(lang), '-s', '148', '-p', '42', '-w', path, text], timeout); return path; };
  } else if (provider === 'gtts') {
    configured = true; quality = 'basic-explicit';
    synth = async (text, path, lang) => {
      const words = clean(text).split(/\s+/).filter(Boolean); const chunks = []; let chunk = '';
      for (const word of words) { if (`${chunk} ${word}`.length > 180 && chunk) { chunks.push(chunk); chunk = ''; } chunk = chunk ? `${chunk} ${word}` : word; }
      if (chunk) chunks.push(chunk);
      const audio = []; let size = 0;
      for (const part of chunks) {
        const bytes = await requestAudio(`https://translate.googleapis.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${langCode(lang)}&q=${encodeURIComponent(part)}`, { headers: { 'user-agent': 'Mozilla/5.0' } }, timeout, 'Google TTS');
        size += bytes.length; if (size > MAX_BYTES) throw new TtsError('Narration exceeds safe audio size limit.'); audio.push(bytes);
      }
      if (!size) throw new TtsError('Narration text is empty.');
      const out = `${path}.mp3`; await writeFile(out, Buffer.concat(audio)); return out;
    };
  } else if (provider === 'http') {
    if (!clean(config.ttsUrl)) throw new TtsError('TTS_PROVIDER=http requires TTS_URL.');
    configured = true; quality = 'custom';
    synth = async (text, path, language) => {
      const bytes = await requestAudio(config.ttsUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, language }) }, timeout, 'Custom TTS', false);
      const out = validMp3(bytes) ? `${path}.mp3` : path; await writeFile(out, bytes); return out;
    };
  } else throw new TtsError('Unknown TTS_PROVIDER. Use auto, elevenlabs, none, espeak, gtts, or http.');
  const enabled = configured && provider !== 'none';
  return {
    name: provider === 'elevenlabs' ? 'elevenlabs-neural-male' : provider === 'espeak' ? 'espeak-ng' : provider === 'gtts' ? 'google-tts' : provider,
    enabled, error: !enabled && provider !== 'none' ? missingKey : null,
    status() { return { provider, configured, enabled, quality, voiceId: provider === 'elevenlabs' ? voiceId : null, model: provider === 'elevenlabs' ? model : null, authenticated, lastError }; },
    async synth(...args) {
      try { const result = await synth(...args); lastError = null; return result; }
      catch (err) {
        const safe = err instanceof TtsError ? err : new TtsError('Voice generation failed. Check server/provider configuration.');
        if (safe.code === 'TTS_BAD_KEY') authenticated = false;
        lastError = { message: safe.message, code: safe.code, retryable: safe.retryable }; throw safe;
      }
    },
  };
}
