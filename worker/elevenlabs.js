// ElevenLabs narration for the Workers build. The Node server writes the audio
// to disk before serving it; workerd cannot, so the bytes are returned directly.
import { cleanEnv } from '../shared/provider-config.js';

const MAX_BYTES = 10 * 1024 * 1024;
const MISSING_KEY = 'Natural male narration is unavailable: set ELEVENLABS_API or ELEVENLABS_API_KEY for this site, then redeploy. Or turn narration off in the studio.';

function validMp3(bytes) {
  if (bytes.length < 128) return false;
  if (String.fromCharCode(...bytes.subarray(0, 3)) === 'ID3') return true;
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 && (bytes[1] & 6) !== 0 && (bytes[2] & 0xf0) !== 0xf0 && (bytes[2] & 0x0c) !== 0x0c;
}

const clamp = (value, fallback, min, max) => (Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback);

const fail = (message, code, status = 503, retryable = false) => Object.assign(new Error(message), { code, status, retryable });

// Only allowlisted status codes are mapped; the upstream body may contain the
// request text or account details and is never returned to the browser.
function upstreamError(status) {
  if (status === 401) return fail('ElevenLabs rejected the API key. Check the site secret and text-to-speech permission.', 'TTS_BAD_KEY', 503);
  if (status === 403) return fail('ElevenLabs denied voice access. Check key permissions, voice access, and account plan.', 'TTS_ACCESS_DENIED', 503);
  if (status === 404) return fail('ElevenLabs voice was not found. Check ELEVENLABS_VOICE_ID and account voice access.', 'TTS_VOICE_NOT_FOUND', 503);
  if (status === 429) return fail('ElevenLabs is rate limited or out of credits. Check account quota and retry shortly.', 'TTS_RATE_LIMITED', 429, true);
  return fail(`ElevenLabs responded ${status}. Check voice/model configuration or retry later.`, 'TTS_PROVIDER_ERROR', 502, status >= 500);
}

export function createVoice(config) {
  const key = cleanEnv(config.elevenLabsApiKey);
  const voiceId = cleanEnv(config.elevenLabsVoiceId) || 'pNInz6obpgDQGcFmaJgB';
  const model = cleanEnv(config.elevenLabsModelId) || 'eleven_multilingual_v2';
  const timeout = Math.max(1000, Math.min(120000, Number(config.ttsTimeoutMs) || 30000));
  const configured = Boolean(key);
  let authenticated = null;
  let lastError = null;

  async function synth(text) {
    if (!configured) throw fail(MISSING_KEY, 'TTS_NOT_CONFIGURED', 503);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
        body: JSON.stringify({
          text, model_id: model,
          voice_settings: {
            stability: clamp(config.elevenLabsStability, 0.4, 0, 1),
            similarity_boost: clamp(config.elevenLabsSimilarityBoost, 0.78, 0, 1),
            style: clamp(config.elevenLabsStyle, 0.25, 0, 1),
            use_speaker_boost: config.elevenLabsUseSpeakerBoost !== false,
            speed: clamp(config.elevenLabsSpeed, 1, 0.7, 1.2),
          },
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw upstreamError(res.status);
      const declared = Number(res.headers.get('content-length') || 0);
      if (declared > MAX_BYTES) throw fail('Voice response exceeded the safe audio size limit.', 'TTS_AUDIO_TOO_LARGE', 502);
      const type = res.headers.get('content-type') || '';
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length > MAX_BYTES) throw fail('Voice response exceeded the safe audio size limit.', 'TTS_AUDIO_TOO_LARGE', 502);
      if (!/^audio\//i.test(type) || !validMp3(bytes)) throw fail('ElevenLabs returned invalid audio. Please retry or check voice configuration.', 'TTS_INVALID_AUDIO', 502);
      authenticated = true; lastError = null;
      return bytes;
    } catch (error) {
      const safe = error?.code ? error : fail(error?.name === 'AbortError' ? 'ElevenLabs narration timed out. Please retry.' : 'ElevenLabs could not be reached. Please retry.', error?.name === 'AbortError' ? 'TTS_TIMEOUT' : 'TTS_NETWORK_ERROR', 504, true);
      if (safe.code === 'TTS_BAD_KEY') authenticated = false;
      lastError = { message: safe.message, code: safe.code, retryable: Boolean(safe.retryable) };
      throw safe;
    } finally { clearTimeout(timer); }
  }

  function status() {
    return {
      provider: 'elevenlabs',
      configured,
      enabled: configured,
      quality: 'neural',
      voiceId: configured ? voiceId : null,
      model: configured ? model : null,
      authenticated,
      lastError,
    };
  }

  return { status, synth, get enabled() { return configured; }, get error() { return configured ? null : MISSING_KEY; } };
}
