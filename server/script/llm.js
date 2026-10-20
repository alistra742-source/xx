// Client for a local llama.cpp server (llama-server) running Qwen2.5-0.5B-Instruct GGUF.
// The model is never loaded in this process: llama-server owns it, so the app
// stays small. If the server is unreachable, slow, or returns bad JSON we fall
// back to the template generator, and a cooldown avoids hammering a dead server.
import { ACTIONS, BACKGROUNDS, EFFECTS, EMOTIONS, TONES, HATS, TOPS, ACCESSORIES } from '../../shared/constants.js';
import { parseJsonLoose, normalizeProject, sceneCountFor } from '../../shared/schema.js';
import { extractSubject } from './template.js';

export function createLlm(config) {
  let cooldownUntil = 0;
  let lastError = null;

  const enabled = () => Boolean(config.llamaUrl) && config.llmEnabled;

  function buildPrompt(req) {
    const n = sceneCountFor(req.duration);
    const system = 'You write short animated stick-figure video scripts. Reply with ONE valid JSON object only, no prose, no markdown.';
    const user = [
      `User request (interpret the intent; DO NOT repeat or quote these words in narration): ${req.topic}`,
      `Story subject (not a script prompt): ${extractSubject(req.topic)}`,
      `Language for narration: ${req.language}. Tone: ${req.autoTone ? 'choose the best tone for the story' : req.tone}. Duration: ${req.duration} seconds.`,
      `Choose the appropriate cast size from 2 to 8 characters; do not be limited to a fixed cast. Give each character a distinctive name, role, color, drip outfit (hat/top/accessory), and isZombie boolean.`,
      `This is a cinematic faceless story. Narration must describe story events as a narrator; NEVER say "create a video", "make an animation", or read the topic verbatim.`,
      `If the topic is a zombie/virus/apocalypse story, follow a coherent outbreak arc: an ordinary survivor sleeps at night; alarms wake him; he turns on the TV and hears an emergency broadcast; he looks out a window and sees green zombies chasing normal people; show a zombie chase and a bite/infection transformation; the survivor barricades or escapes. Make each scene have distinct actions and dialogue/narration.`,
      `Every scene MUST explicitly list all visible characters from the top-level cast that are relevant in that scene. Zombie entities must have id/name/role identifying them as zombies, isZombie:true, zombie-green color, and actions zombie_walk/zombie_chase/infect/turn_zombie. Humans must use human actions and normal colors; infected victims may switch to isZombie:true only after the bite scene. Do not use zombie IDs for humans.`,
      `Write exactly ${n} scenes. Scene 1 is a strong cinematic hook. Last scene is a satisfying ending. Each scene changes something; use 2-5 short sentences of plot progression.`,
      `Allowed actions: ${ACTIONS.join(', ')}.`,
      `Allowed backgrounds: ${BACKGROUNDS.join(', ')}.`,
      `Allowed effects: ${EFFECTS.join(', ')}.`,
      `Allowed emotions: ${EMOTIONS.join(', ')}.`,
      `Allowed tones: ${TONES.join(', ')}. Allowed hats: ${HATS.join(', ')}. Allowed tops: ${TOPS.join(', ')}. Allowed accessories: ${ACCESSORIES.join(', ')}.`,
      `Narration must be original voiceover narration, never the user's prompt read back, and should describe only the scene's actual story beat. Max 24 words per scene. Narration enabled: ${req.narration}.`,
      'JSON shape: {"title": string, "tone": one of allowed tones, "characters": [{"id":string,"name":string,"role":string,"color":"#rrggbb","isZombie":boolean,"drip":{"hat":string,"top":string,"accessory":string,"outfitColor":"#rrggbb","accentColor":"#rrggbb"}}], "scenes": [{"duration":number,"background":string,"narration":string,"effects":[string],"textOverlay":string,"characters":[{"id":string,"action":string,"emotion":string,"isZombie":boolean,"position":{"x":number 0-1,"y":number 0-1},"targetX":number 0-1}]}]}',
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
      if (!parsed || !Array.isArray(parsed.scenes) || parsed.scenes.length === 0) throw new Error('Model returned no valid story scenes.');
      const { inferStoryMeta } = await import('../../shared/schema.js');
      const storyMeta = inferStoryMeta(req.topic);
      const project = normalizeProject(
        { ...parsed, tone: req.autoTone ? (parsed.tone || storyMeta.tone) : req.tone, style: req.style, aspectRatio: req.aspectRatio, duration: req.duration, topic: req.topic, language: req.language, narration: req.narration, subtitles: { enabled: req.subtitles }, characters: parsed.characters || characterList(storyMeta.characterCount), seed: req.seed },
        { duration: req.duration, tone: req.tone, style: req.style, aspectRatio: req.aspectRatio, narration: req.narration, subtitles: req.subtitles, topic: req.topic, language: req.language, seed: req.seed },
      );
      if (req.narration && project.scenes.some((scene) => promptEcho(scene.narration, req.topic))) {
        throw new Error('Model echoed the user prompt instead of writing story narration.');
      }
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

function promptEcho(narration, topic) {
  const normalize = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const n = normalize(narration);
  const t = normalize(topic);
  if (!n || !t) return false;
  if (/^(please )?(create|make|generate|write|build) (a |an )?(video|animation|story)/.test(n)) return true;
  // A narrator may reuse the story's subject, but repeating most of a long request
  // verbatim is the prompt-reading bug we explicitly want to reject.
  const tokens = t.split(' ').filter((word) => word.length > 2);
  if (tokens.length < 8) return false;
  const matched = tokens.filter((word) => n.includes(word)).length;
  return matched / tokens.length >= 0.78;
}

function characterList(count) {
  const names = ['hero', 'friend', 'rival', 'helper', 'villain', 'bystander', 'backup', 'walker'];
  return Array.from({ length: Math.min(8, Math.max(1, count || 3)) }, (_, i) => ({
    id: names[i] ?? `char${i + 1}`,
    name: i === 0 ? 'Hero' : `Character ${i + 1}`,
    role: i === 0 ? 'protagonist' : 'supporting',
  }));
}
