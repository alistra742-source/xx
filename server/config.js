// Runtime configuration from environment variables. Defaults are tuned for a
// ~512 MB Railway container; every value can be overridden in .env / the host.
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const cleanEnv = (value) => String(value ?? '').trim().replace(/^(['"])([\s\S]*)\1$/, '$2').trim();
const num = (v, d) => (!cleanEnv(v) || !Number.isFinite(Number(cleanEnv(v))) ? d : Number(cleanEnv(v)));
const bounded = (v, d, lo, hi) => Math.max(lo, Math.min(hi, num(v, d)));

export function loadConfig(env = process.env) {
  env = Object.fromEntries(Object.entries(env).map(([key, value]) => [key, cleanEnv(value)]));
  return {
    port: num(env.PORT, 3000),
    host: env.HOST || '0.0.0.0',
    ffmpegBin: env.FFMPEG_BIN || 'ffmpeg',
    outputDir: resolve(env.OUTPUT_DIR || join(tmpdir(), 'stick-videos')),
    jobTtlMs: num(env.JOB_TTL_MINUTES, 30) * 60 * 1000,
    maxQueue: num(env.MAX_EXPORT_QUEUE, 3),
    staticDir: resolve(env.STATIC_DIR || 'dist'),
    // LLM writes every story from the user's prompt. The app talks to a local
    // OpenAI-compatible server (llama.cpp llama-server, Ollama, LM Studio): set
    // LLAMA_URL (or LLM_BASE_URL) to its /v1 base. No hosted provider keys.
    llmEnabled: env.LLM_ENABLED !== 'false',
    llamaUrl: env.LLM_BASE_URL || env.LLAMA_URL || '',
    llmApiKey: env.LLM_API_KEY || '',
    // Empty means "use whatever model the local server serves"; set LLM_MODEL
    // only when that server exposes more than one model.
    llmModel: env.LLM_MODEL || '',
    llmTimeoutMs: num(env.LLM_TIMEOUT_MS, 45000),
    llmCooldownMs: num(env.LLM_COOLDOWN_MS, 120000),
    llmMaxTokens: bounded(env.LLM_MAX_TOKENS, 6000, 1024, 8192),
    // Narration requires ElevenLabs credentials unless a lower-quality provider is explicitly selected.
    ttsProvider: env.TTS_PROVIDER || 'auto',
    espeakBin: env.ESPEAK_BIN || 'espeak-ng',
    ttsUrl: env.TTS_URL || '',
    elevenLabsApiKey: env.ELEVENLABS_API_KEY || env.ELEVENLABS_API || '',
    elevenLabsVoiceId: env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB',
    elevenLabsModelId: env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2',
    elevenLabsStability: bounded(env.ELEVENLABS_STABILITY, 0.4, 0, 1),
    elevenLabsSimilarityBoost: bounded(env.ELEVENLABS_SIMILARITY_BOOST, 0.78, 0, 1),
    elevenLabsStyle: bounded(env.ELEVENLABS_STYLE, 0.25, 0, 1),
    elevenLabsUseSpeakerBoost: env.ELEVENLABS_USE_SPEAKER_BOOST !== 'false',
    elevenLabsSpeed: bounded(env.ELEVENLABS_SPEED, 1, 0.7, 1.2),
    ttsTimeoutMs: num(env.TTS_TIMEOUT_MS, 30000),
  };
}
