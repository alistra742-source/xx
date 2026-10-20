// Client for a local llama.cpp server (llama-server) running Qwen2.5-0.5B-Instruct GGUF.
// The model is never loaded in this process: llama-server owns it, so the app
// stays small. If the server is unreachable, slow, or returns bad JSON we fall
// back to the template generator, and a cooldown avoids hammering a dead server.
import { ACTIONS, BACKGROUNDS, EFFECTS, EMOTIONS, TONES, HATS, TOPS, ACCESSORIES } from '../../shared/constants.js';
import { parseJsonLoose, normalizeProject, sceneCountFor } from '../../shared/schema.js';
import { extractSubject } from './template.js';

/**
 * Offline prompt expander used when no language model is configured, so the
 * "Improve prompt" button always works. It keeps the user's premise and adds
 * structure (goal, obstacle, escalation, payoff) without forcing a genre.
 */
export function improvePromptLocally(topic) {
  // Without a configured model there is no real expansion to offer, so keep the
  // user's own words. Appending fixed text would add the same lines to every story.
  return String(topic || '').trim().replace(/\s+/g, ' ');
}

export function createLlm(config) {
  let cooldownUntil = 0;
  let lastError = null;

  const enabled = () => Boolean(config.llamaUrl) && config.llmEnabled;

  // Every request goes to the configured OpenAI-compatible endpoint. The API key
  // (if any) is only sent in the Authorization header and never logged.
  function chatRequest(messages, { maxTokens, temperature, topP, signal, jsonMode = false }) {
    const headers = { 'content-type': 'application/json' };
    if (config.llmApiKey) headers.authorization = `Bearer ${config.llmApiKey}`;
    return fetch(`${config.llamaUrl.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.llmModel,
        messages,
        max_tokens: maxTokens,
        temperature,
        top_p: topP,
        stream: false,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal,
    });
  }

  function buildPrompt(req) {
    const n = sceneCountFor(req.duration);
    const system = 'You write short animated stick-figure video scripts. Reply with ONE valid JSON object only, no prose, no markdown.';
    const user = [
      `Variation id: ${req.seed || Date.now()}. Invent a fresh, original scene sequence; never reuse a generic plot or a previous answer.`,
      `User request (interpret the intent; DO NOT repeat or quote these words in narration): ${req.topic}`,
      `Story subject (not a script prompt): ${extractSubject(req.topic)}`,
      `Language for narration: ${req.language}. Tone: ${req.autoTone ? 'choose the best tone for the story' : req.tone}. Duration: ${req.duration} seconds.`,
      `Choose the appropriate cast size from 2 to 8 characters; do not be limited to a fixed cast. Give each character a distinctive name, role, color, drip outfit (hat/top/accessory), and isZombie boolean.`,
      `This is a cinematic faceless story for a broad short-video channel. Interpret the exact premise and genre of this topic; do not force it into zombies, heists, or another unrelated template. Build a beginning, escalation, decisive climax and satisfying payoff that specifically develops the user's idea.`,
      `Vary the opening approach based on this topic: use an in-medias-res action, a striking reveal, an ominous detail, a surprising message, or another fitting hook. Do not default to a sleeping hero, 3 AM, alarms, bedroom, or TV unless explicitly requested.`,
      `Never narrate the user's instructions or repeat the prompt. Describe concrete story events in natural voiceover. Every scene must have distinct, visually playable actions and a different story beat.`,
      `When the premise is genuinely a zombie/virus/apocalypse story, use a coherent outbreak arc, but only then.`,
      `Every scene MUST explicitly list all visible characters from the top-level cast that are relevant in that scene. Zombie entities must have id/name/role identifying them as zombies, isZombie:true, zombie-green color, and actions zombie_walk/zombie_chase/infect/turn_zombie. Humans must use human actions and normal colors; infected victims may switch to isZombie:true only after the bite scene. Do not use zombie IDs for humans.`,
      `Write exactly ${n} scenes. Scene 1 is a strong cinematic hook. Last scene is a satisfying ending. Each scene changes something; use 2-5 short sentences of plot progression.`,
      `Allowed actions: ${ACTIONS.join(', ')}.`,
      `Backgrounds are DRAWN BY YOU, not picked from a list. Invent 1-3 backdrops that fit exactly where THIS story takes place (a pirate cove, a moonlit castle, a neon arcade, a space station, a farm...). Each backdrop: {"name":string,"sky":[topHex,bottomHex],"ground":[topHex,bottomHex],"horizon":number 0.65-0.85 (where ground starts, as a fraction of height),"shapes":[...]} with 12-35 shapes drawn back-to-front in 0-1 coordinates (x,y = fractions of width/height; keep shapes behind the characters, mostly near the edges and horizon). Shape types: {"t":"rect","c":hex,"x":,"y":,"w":,"h":} {"t":"circle","c":hex,"x":,"y":,"r":} (r = fraction of the shorter side) {"t":"ellipse","c":hex,"x":,"y":,"rx":,"ry":} {"t":"poly","c":hex,"p":[[x,y],[x,y],[x,y],...]} and optional "a" opacity 0.1-1. Build recognizable scenery from layers (sun/moon, clouds, far hills, buildings, trees, props, windows as small rects). Use a consistent color palette per backdrop. Put them in the top-level "backdrops" array and set each scene's "backdropIndex" to the one it uses (change backdrop only when the story moves location).`,
      `Allowed effects: ${EFFECTS.join(', ')}.`,
      `Allowed emotions: ${EMOTIONS.join(', ')}.`,
      `Allowed tones: ${TONES.join(', ')}. Allowed hats: ${HATS.join(', ')}. Allowed tops: ${TOPS.join(', ')}. Allowed accessories: ${ACCESSORIES.join(', ')}.`,
      `Narration must be original voiceover narration, never prompt instructions, and should describe only the scene's actual story beat. Max 30 words per scene. Narration enabled: ${req.narration}.`,
      'JSON shape: {"title": string, "tone": one of allowed tones, "characters": [{"id":string,"name":string,"role":string,"color":"#rrggbb","isZombie":boolean,"drip":{"hat":string,"top":string,"accessory":string,"outfitColor":"#rrggbb","accentColor":"#rrggbb"}}], "backdrops": [{"name":string,"sky":["#rrggbb","#rrggbb"],"ground":["#rrggbb","#rrggbb"],"horizon":number,"shapes":[{"t":"rect|circle|ellipse|poly",...}]}], "scenes": [{"duration":number,"backdropIndex":number,"narration":string,"effects":[string],"textOverlay":string,"characters":[{"id":string,"action":string,"emotion":string,"isZombie":boolean,"position":{"x":number 0-1,"y":number 0-1},"targetX":number 0-1}]}]}',
    ].join('\n');
    return [{ role: 'system', content: system }, { role: 'user', content: user }];
  }

  async function improvePrompt(topic, { duration = 30 } = {}) {
    if (!enabled()) throw new Error('Prompt improvement needs a configured local language model (LLAMA_URL).');
    const controller = new AbortController();
    const timeoutMs = Math.min(config.llmTimeoutMs || 45000, 30000);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await chatRequest([
        { role: 'system', content: 'You are a short-form film story editor. Expand an idea into one vivid, production-ready faceless-animation prompt. Return only the improved prompt, no labels or commentary.' },
        { role: 'user', content: `Improve this idea for a roughly ${Math.max(10, Math.min(90, Number(duration) || 30))}-second faceless animated short. Keep the original premise and genre; do not force zombies or a default bedroom/alarm opening. Add a protagonist goal, specific setting and stakes, escalating obstacle, visual action, and satisfying twist or payoff. Aim for 80-130 words. Preserve names and facts the user supplied. Idea: ${String(topic).slice(0, 600)}` },
      ], {
        maxTokens: Math.min(config.llmMaxTokens || 500, 320),
        temperature: 0.8,
        topP: 0.92,
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Language model responded ${res.status}`);
      const body = await res.json();
      const improved = String(body?.choices?.[0]?.message?.content || '').trim().replace(/^```(?:text)?\s*|\s*```$/gi, '').replace(/^Improved prompt:\s*/i, '').trim();
      if (improved.length < 40) throw new Error('Language model returned an incomplete prompt.');
      return improved.slice(0, 600).trim();
    } catch (err) {
      const reason = err.name === 'AbortError' ? `timed out after ${timeoutMs} ms` : err.message;
      throw new Error(`Prompt improvement failed: ${reason}`);
    } finally {
      clearTimeout(timer);
    }
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
      const res = await chatRequest(buildPrompt(req), {
        maxTokens: config.llmMaxTokens,
        // High temperature + a fresh nonce per request so the same prompt gives a new story each time.
        temperature: 1.0,
        topP: 0.95,
        signal: controller.signal,
        jsonMode: true,
      });
      if (!res.ok) throw new Error(`language model responded ${res.status}`);
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

  return { generateScript, improvePrompt, enabled, status: () => ({ enabled: enabled(), cooldownUntil, lastError }) };
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
