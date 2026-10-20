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
    // Local LLM (llama.cpp llama-server running Qwen2.5-0.5B-Instruct Q4 GGUF).
    llmEnabled: env.LLM_ENABLED !== 'false',
    llamaUrl: env.LLAMA_URL || '',
    llmTimeoutMs: num(env.LLM_TIMEOUT_MS, 45000),
    llmCooldownMs: num(env.LLM_COOLDOWN_MS, 120000),
    llmMaxTokens: num(env.LLM_MAX_TOKENS, 700),
    // Narration: 'espeak' (local espeak-ng binary), 'http' (POST {text,language}, returns audio/wav), or 'none'.
    ttsProvider: env.TTS_PROVIDER || 'none',
    espeakBin: env.ESPEAK_BIN || 'espeak-ng',
    ttsUrl: env.TTS_URL || '',
    ttsTimeoutMs: num(env.TTS_TIMEOUT_MS, 30000),
  };
}
