// Client for a local llama.cpp server (llama-server) running Qwen2.5-0.5B-Instruct GGUF.
// The model is never loaded in this process: llama-server owns it, so the app
// stays small. If the server is unreachable, slow, or returns bad JSON we fall
// back to the template generator, and a cooldown avoids hammering a dead server.
import { ACTIONS, BACKGROUNDS, EFFECTS, EMOTIONS } from '../../shared/constants.js';
import { parseJsonLoose, normalizeProject, sceneCountFor } from '../../shared/schema.js';

export function createLlm(config) {
  let cooldownUntil = 0;
  let lastError = null;

  const enabled = () => Boolean(config.llamaUrl) && config.llmEnabled;

  function buildPrompt(req) {
    const n = sceneCountFor(req.duration);
    const system = 'You write short animated stick-figure video scripts. Reply with ONE valid JSON object only, no prose, no markdown.';
    const user = [
      `Topic: ${req.topic}`,
      `Language for narration: ${req.language}. Tone: ${req.tone}. Duration: ${req.duration} seconds.`,
      `Characters: ${req.characterCount} (ids: hero, friend, rival, helper, villain; first id is "hero").`,
      `Write exactly ${n} scenes. Scene 1 is a strong hook. Last scene is a satisfying ending.`,
      `Allowed actions: ${ACTIONS.join(', ')}.`,
      `Allowed backgrounds: ${BACKGROUNDS.join(', ')}.`,
      `Allowed effects: ${EFFECTS.join(', ')}.`,
      `Allowed emotions: ${EMOTIONS.join(', ')}.`,
      `Narration must be short sentences (max 15 words each). Narration enabled: ${req.narration}.`,
      'JSON shape: {"title": string, "scenes": [{"background": string, "narration": string, "effects": [string], "characters": [{"id": string, "action": string, "emotion": string, "position": {"x": number 0-1, "y": number 0-1}}]}]}',
    ].join('\n');
    return [{ role: 'system', content: system }, { role: 'user', content: user }];
  }

  /**
   * Returns { project, source: 'llm' } or throws. Callers must catch and fall back.
   */
  async function generateScript(req) {
    if (!enabled()) throw new Error('Local language model is disabled.');
    if (Date.now() < cooldownUntil) throw new Error(`Language model cooling down after an error: ${lastError}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.llmTimeoutMs);
    try {
      const res = await fetch(`${config.llamaUrl.replace(/\/$/, '')}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: buildPrompt(req),
          max_tokens: config.llmMaxTokens,
          temperature: 0.7,
          top_p: 0.9,
          stream: false,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`llama-server responded ${res.status}`);
      const body = await res.json();
      const text = body?.choices?.[0]?.message?.content ?? '';
      const parsed = parseJsonLoose(text);
      const project = normalizeProject(
        { ...parsed, tone: req.tone, style: req.style, aspectRatio: req.aspectRatio, duration: req.duration, topic: req.topic, language: req.language, narration: req.narration, subtitles: { enabled: req.subtitles }, characters: characterList(req.characterCount) },
        { duration: req.duration, tone: req.tone, style: req.style, aspectRatio: req.aspectRatio, narration: req.narration, subtitles: req.subtitles, topic: req.topic, language: req.language },
      );
      lastError = null;
      return { project, source: 'llm' };
    } catch (err) {
      lastError = err.name === 'AbortError' ? `timed out after ${config.llmTimeoutMs} ms` : err.message;
      cooldownUntil = Date.now() + config.llmCooldownMs;
      throw new Error(`Language model unavailable: ${lastError}`);
    } finally {
      clearTimeout(timer);
    }
  }

  return { generateScript, enabled, status: () => ({ enabled: enabled(), cooldownUntil, lastError }) };
}

function characterList(count) {
  const names = ['hero', 'friend', 'rival', 'helper', 'villain'];
  return Array.from({ length: count }, (_, i) => ({ id: names[i] ?? `char${i + 1}`, name: i === 0 ? 'Hero' : `Character ${i + 1}` }));
}
