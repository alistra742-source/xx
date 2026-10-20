// Validation + normalization of project JSON. Input may come from an LLM, the
// template generator, or the user's edits. Output is always safe to render:
// unknown actions/backgrounds/effects are mapped or dropped, numbers are clamped,
// and durations are rescaled to match the requested total.
import {
  ACTIONS, ACTION_ALIASES, BACKGROUNDS, BACKGROUND_ALIASES, EFFECTS, EMOTIONS, TONES,
  ANIMATION_STYLES, ASPECT_RATIOS, SUBTITLE_POSITIONS, LIMITS, DEFAULT_SUBTITLES, CHARACTER_COLORS,
} from './constants.js';

export class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, fallback) => {
  const n = typeof v === 'string' ? Number.parseFloat(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
};
const str = (v, max, fallback = '') => {
  if (typeof v !== 'string') return fallback;
  const s = v.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : fallback;
};
const hexColor = (v, fallback) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback);

export function normalizeAction(value) {
  const key = String(value ?? '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (ACTIONS.includes(key)) return { action: key, known: true };
  if (ACTION_ALIASES[key]) return { action: ACTION_ALIASES[key], known: true };
  return { action: 'idle', known: false };
}

export function normalizeBackground(value) {
  const key = String(value ?? '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (BACKGROUNDS.includes(key)) return key;
  if (BACKGROUND_ALIASES[key]) return BACKGROUND_ALIASES[key];
  return 'street';
}

export function normalizeEffect(value) {
  const key = String(value ?? '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (EFFECTS.includes(key)) return key;
  if (key === 'flash' || key === 'impact') return 'impact_flash';
  if (key === 'shaking' || key === 'screen_shake') return 'shake';
  if (key === 'explode' || key === 'boom') return 'explosion';
  return null;
}

function slugId(v, fallback) {
  const s = String(v ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24);
  return s || fallback;
}

/** Parse JSON that may be wrapped in prose or ```json fences. Returns null on failure. */
export function parseJsonLoose(text) {
  if (typeof text !== 'string') return null;
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const value = JSON.parse(cleaned.slice(start, end + 1));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function normalizeCharacters(raw, warnings) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const c of list.slice(0, LIMITS.maxCharacters)) {
    const fallbackId = out.length === 0 ? 'hero' : `char${out.length + 1}`;
    let id = slugId(c?.id, fallbackId);
    while (seen.has(id)) id = `${id}_${out.length + 1}`;
    seen.add(id);
    out.push({
      id,
      name: str(c?.name, 24, id === 'hero' ? 'Hero' : `Character ${out.length + 1}`),
      color: hexColor(c?.color, CHARACTER_COLORS[out.length % CHARACTER_COLORS.length]),
      role: str(c?.role, 40, out.length === 0 ? 'protagonist' : 'supporting'),
    });
  }
  if (out.length === 0) {
    warnings.push('No characters supplied; added a default hero.');
    out.push({ id: 'hero', name: 'Hero', color: CHARACTER_COLORS[0], role: 'protagonist' });
  }
  return out;
}

function normalizeSubtitles(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    enabled: typeof s.enabled === 'boolean' ? s.enabled : DEFAULT_SUBTITLES.enabled,
    size: Math.round(clamp(num(s.size, DEFAULT_SUBTITLES.size), 14, 64)),
    position: SUBTITLE_POSITIONS.includes(s.position) ? s.position : DEFAULT_SUBTITLES.position,
    color: hexColor(s.color, DEFAULT_SUBTITLES.color),
    outlineColor: hexColor(s.outlineColor, DEFAULT_SUBTITLES.outlineColor),
    outlineWidth: Math.round(clamp(num(s.outlineWidth, DEFAULT_SUBTITLES.outlineWidth), 0, 12)),
  };
}

function normalizeScene(raw, index, characters, warnings) {
  const scene = raw && typeof raw === 'object' ? raw : {};
  const ids = characters.map((c) => c.id);
  const sceneCharsRaw = Array.isArray(scene.characters) ? scene.characters : [];
  const chars = [];
  sceneCharsRaw.slice(0, LIMITS.maxCharacters).forEach((c, i) => {
    const wanted = slugId(c?.id, '');
    const id = ids.includes(wanted) ? wanted : ids[i % ids.length];
    const { action, known } = normalizeAction(c?.action);
    if (!known && c?.action !== undefined) warnings.push(`Scene ${index + 1}: unknown action "${c.action}" -> idle.`);
    const pos = c?.position && typeof c.position === 'object' ? c.position : {};
    const emotion = EMOTIONS.includes(c?.emotion) ? c.emotion : 'neutral';
    chars.push({
      id,
      action,
      position: {
        x: clamp(num(pos.x, 0.5), 0.08, 0.92),
        y: clamp(num(pos.y, 0.5), 0, 1),
      },
      emotion,
      facing: c?.facing === -1 ? -1 : 1,
    });
  });
  if (chars.length === 0) chars.push({ id: ids[0], action: 'idle', position: { x: 0.5, y: 0.5 }, emotion: 'neutral', facing: 1 });

  // Spread characters evenly when positions are missing or overlapping.
  if (chars.length > 1) {
    const xs = chars.map((c) => c.position.x);
    if (new Set(xs.map((x) => x.toFixed(1))).size < chars.length) {
      chars.forEach((c, i) => { c.position.x = clamp(0.2 + (0.6 * i) / (chars.length - 1), 0.08, 0.92); });
    }
  }
  // Figures on the left face right; figures on the right face left (unless the AI said otherwise).
  chars.forEach((c) => {
    if (c.facing === 1 && c.position.x > 0.6 && chars.length > 1) c.facing = -1;
  });

  const effects = (Array.isArray(scene.effects) ? scene.effects : [])
    .map(normalizeEffect)
    .filter((e, i, arr) => e && arr.indexOf(e) === i)
    .slice(0, LIMITS.maxEffects);

  return {
    id: `s${index + 1}`,
    duration: clamp(num(scene.duration, 5), LIMITS.minSceneSeconds, LIMITS.maxSceneSeconds),
    background: normalizeBackground(scene.background),
    narration: str(scene.narration, LIMITS.maxNarrationChars, ''),
    characters: chars,
    effects,
    textOverlay: str(scene.textOverlay, 40, ''),
  };
}

/** Rescale scene durations so they sum to the target (keeping per-scene minimums). */
export function fitDurations(scenes, target) {
  const total = scenes.reduce((s, sc) => s + sc.duration, 0);
  if (total <= 0 || Math.abs(total - target) < 0.5) return;
  const k = target / total;
  scenes.forEach((sc) => {
    sc.duration = clamp(Math.round(sc.duration * k * 2) / 2, LIMITS.minSceneSeconds, LIMITS.maxSceneSeconds);
  });
}

/**
 * Normalize arbitrary project-like JSON into a safe project.
 * Throws ValidationError only when no usable scenes exist (callers then fall back).
 */
export function normalizeProject(raw, defaults = {}) {
  const warnings = [];
  const src = raw && typeof raw === 'object' ? raw : {};
  const duration = clamp(Math.round(num(src.duration ?? defaults.duration, LIMITS.defaultDuration)), LIMITS.minDuration, LIMITS.maxDuration);
  const aspectRatio = ASPECT_RATIOS[src.aspectRatio] ? src.aspectRatio : (ASPECT_RATIOS[defaults.aspectRatio] ? defaults.aspectRatio : '9:16');
  const tone = TONES.includes(src.tone) ? src.tone : (TONES.includes(defaults.tone) ? defaults.tone : 'funny');
  const style = ANIMATION_STYLES.includes(src.style) ? src.style : (ANIMATION_STYLES.includes(defaults.style) ? defaults.style : 'classic');
  const characters = normalizeCharacters(src.characters, warnings);

  const rawScenes = Array.isArray(src.scenes) ? src.scenes : [];
  if (rawScenes.length === 0) throw new ValidationError('The script has no scenes.', 'scenes');
  const scenes = rawScenes.slice(0, LIMITS.maxScenes).map((s, i) => normalizeScene(s, i, characters, warnings));
  if (rawScenes.length > LIMITS.maxScenes) warnings.push(`Trimmed to ${LIMITS.maxScenes} scenes.`);

  fitDurations(scenes, duration);

  return {
    title: str(src.title, 80, str(defaults.title, 80, 'Untitled Stick Story')),
    topic: str(src.topic, LIMITS.maxTopicChars, str(defaults.topic, LIMITS.maxTopicChars, '')),
    language: str(src.language, 40, str(defaults.language, 40, 'English')),
    duration,
    aspectRatio,
    tone,
    style,
    narration: typeof src.narration === 'boolean' ? src.narration : (typeof defaults.narration === 'boolean' ? defaults.narration : true),
    subtitles: normalizeSubtitles(src.subtitles ?? { enabled: defaults.subtitles }),
    characters,
    scenes,
  };
}

/** Validate a script-generation request from the UI/API. */
export function validateGenerateRequest(body) {
  const b = body && typeof body === 'object' ? body : {};
  const topic = str(b.topic, LIMITS.maxTopicChars, '');
  if (topic.length < 3) throw new ValidationError('Please describe your video topic (at least 3 characters).', 'topic');
  const duration = Number(b.duration ?? LIMITS.defaultDuration);
  if (!Number.isFinite(duration) || duration < LIMITS.minDuration || duration > LIMITS.maxDuration) {
    throw new ValidationError(`Duration must be between ${LIMITS.minDuration} and ${LIMITS.maxDuration} seconds.`, 'duration');
  }
  const characterCount = clamp(Math.round(num(b.characterCount, 1)), 1, LIMITS.maxCharacters);
  return {
    topic,
    title: str(b.title, 80, ''),
    language: str(b.language, 40, 'English'),
    duration: Math.round(duration),
    aspectRatio: ASPECT_RATIOS[b.aspectRatio] ? b.aspectRatio : '9:16',
    tone: TONES.includes(b.tone) ? b.tone : 'funny',
    style: ANIMATION_STYLES.includes(b.style) ? b.style : 'classic',
    characterCount,
    narration: b.narration !== false,
    subtitles: b.subtitles !== false,
  };
}

/** Target number of scenes for a duration (30s -> ~5, 60s -> ~9). */
export function sceneCountFor(duration) {
  return clamp(Math.round(duration / 6.5), 4, LIMITS.maxScenes);
}
