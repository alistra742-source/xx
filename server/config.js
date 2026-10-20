// Runtime configuration from environment variables. Defaults are tuned for a
// ~512 MB Railway container; every value can be overridden in .env / the host.
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

export function loadConfig(env = process.env) {
  return {
    port: num(env.PORT, 3000),
    host: env.HOST || '0.0.0.0',
    ffmpegBin: env.FFMPEG_BIN || 'ffmpeg',
    outputDir: resolve(env.OUTPUT_DIR || join(tmpdir(), 'stick-videos')),
    jobTtlMs: num(env.JOB_TTL_MINUTES, 30) * 60 * 1000,
    maxQueue: num(env.MAX_EXPORT_QUEUE, 3),
    staticDir: resolve(env.STATIC_DIR || 'dist'),
    // LLM writes every story from the user's prompt. Any OpenAI-compatible
    // /v1/chat/completions endpoint works: a hosted API (Groq, OpenRouter, ...)
    // via LLM_BASE_URL + LLM_API_KEY, or a self-hosted llama-server via LLAMA_URL.
    llmEnabled: env.LLM_ENABLED !== 'false',
    // GROQ_API alone is enough: it selects Groq's OpenAI-compatible endpoint.
    llamaUrl: env.LLM_BASE_URL || env.LLAMA_URL || (env.GROQ_API ? 'https://api.groq.com/openai/v1' : ''),
    llmApiKey: env.LLM_API_KEY || env.GROQ_API || '',
    llmModel: env.LLM_MODEL || 'llama-3.1-8b-instant',
    llmTimeoutMs: num(env.LLM_TIMEOUT_MS, 45000),
    llmCooldownMs: num(env.LLM_COOLDOWN_MS, 120000),
    llmMaxTokens: num(env.LLM_MAX_TOKENS, 3500),
    // Narration: ElevenLabs neural voice when ELEVENLABS_API is configured; otherwise auto fallback.
    ttsProvider: env.TTS_PROVIDER || 'auto',
    espeakBin: env.ESPEAK_BIN || 'espeak-ng',
    ttsUrl: env.TTS_URL || '',
    elevenLabsApiKey: env.ELEVENLABS_API || '',
    elevenLabsVoiceId: env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB',
    elevenLabsModelId: env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2',
    ttsTimeoutMs: num(env.TTS_TIMEOUT_MS, 30000),
  };
}
