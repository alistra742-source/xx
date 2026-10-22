// Provider settings shared by the Node server and the Cloudflare Worker build.
// Kept free of Node built-ins so workerd can import the same defaults.
export const cleanEnv = (value) => String(value ?? '').trim().replace(/^(['"])([\s\S]*)\1$/, '$2').trim();
export const num = (v, d) => (!cleanEnv(v) || !Number.isFinite(Number(cleanEnv(v))) ? d : Number(cleanEnv(v)));
export const bounded = (v, d, lo, hi) => Math.max(lo, Math.min(hi, num(v, d)));

/** LLM + narration configuration. Reads only string environment values. */
export function providerConfig(env = {}) {
  // Worker bindings (D1/R2/ASSETS) and process.env share this map, so only
  // string and numeric entries are treated as configuration values.
  const e = Object.fromEntries(Object.entries(env).map(([key, value]) => [key, typeof value === 'string' || typeof value === 'number' ? cleanEnv(value) : '']));
  return {
    // LLM writes every story from the user's prompt. The app talks to a local
    // OpenAI-compatible server (llama.cpp llama-server, Ollama, LM Studio): set
    // LLAMA_URL (or LLM_BASE_URL) to its /v1 base. No hosted provider keys.
    llmEnabled: e.LLM_ENABLED !== 'false',
    llamaUrl: e.LLM_BASE_URL || e.LLAMA_URL || '',
    llmApiKey: e.LLM_API_KEY || '',
    // Empty means "use whatever model the local server serves"; set LLM_MODEL
    // only when that server exposes more than one model.
    llmModel: e.LLM_MODEL || '',
    llmTimeoutMs: num(e.LLM_TIMEOUT_MS, 45000),
    llmCooldownMs: num(e.LLM_COOLDOWN_MS, 120000),
    llmMaxTokens: bounded(e.LLM_MAX_TOKENS, 6000, 1024, 8192),
    // Narration: auto prefers the free Edge-TTS voice when its CLI is installed,
    // then ElevenLabs when a key is present. Explicit modes never switch silently.
    ttsProvider: e.TTS_PROVIDER || 'auto',
    edgeTtsBin: e.EDGE_TTS_BIN || 'edge-tts',
    edgeTtsVoice: e.EDGE_TTS_VOICE || '',
    edgeTtsRate: e.EDGE_TTS_RATE || '-4%',
    espeakBin: e.ESPEAK_BIN || 'espeak-ng',
    ttsUrl: e.TTS_URL || '',
    elevenLabsApiKey: e.ELEVENLABS_API_KEY || e.ELEVENLABS_API || '',
    elevenLabsVoiceId: e.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB',
    elevenLabsModelId: e.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2',
    elevenLabsStability: bounded(e.ELEVENLABS_STABILITY, 0.4, 0, 1),
    elevenLabsSimilarityBoost: bounded(e.ELEVENLABS_SIMILARITY_BOOST, 0.78, 0, 1),
    elevenLabsStyle: bounded(e.ELEVENLABS_STYLE, 0.25, 0, 1),
    elevenLabsUseSpeakerBoost: e.ELEVENLABS_USE_SPEAKER_BOOST !== 'false',
    elevenLabsSpeed: bounded(e.ELEVENLABS_SPEED, 1, 0.7, 1.2),
    ttsTimeoutMs: num(e.TTS_TIMEOUT_MS, 30000),
  };
}
