// Validation + normalization of project JSON. Input may come from an LLM, the
// template generator, or the user's edits. Output is always safe to render:
// unknown actions/backgrounds/effects are mapped or dropped, numbers are clamped,
// and durations are rescaled to match the requested total.
import {
  ACTIONS, ACTION_ALIASES, BACKGROUNDS, BACKGROUND_ALIASES, EFFECTS, EMOTIONS, TONES,
  ANIMATION_STYLES, ASPECT_RATIOS, SUBTITLE_POSITIONS, LIMITS, DEFAULT_SUBTITLES,
  CHARACTER_COLORS, DRIP_COLORS, HATS, TOPS, ACCESSORIES, ZOMBIE_COLOR,
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
  if (key === 'alarm' || key === 'siren' || key === 'red_alert') return 'alarm_flash';
  if (key === 'tv' || key === 'screen_glow') return 'tv_glow';
  if (key === 'spores' || key === 'virus' || key === 'biohazard') return 'infection_spores';
  return null;
}

function slugId(v, fallback) {
  const s = String(v ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24);
  return s || fallback;
}

/** Deterministic hash from a string seed for consistent outfit picks when omitted. */
function hashStr(s) {
  let h = 2166136261 >>> 0;
  const text = String(s || 'seed');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Generate a stylish drip/outfit for a character based on role or seed. */
export function defaultDripFor(id, role = '', index = 0, seedStr = '') {
  const isZombie = /zombie|infected|undead|walker|ghoul/i.test(`${id} ${role}`);
  const h = hashStr(`${id}:${role}:${index}:${seedStr}`);
  if (isZombie) {
    const zHats = ['none', 'none', 'beanie', 'backwards_cap', 'helmet', 'bandana'];
    const zTops = ['tattered', 'hoodie', 'tshirt', 'vest', 'tracksuit'];
    const zAcc = ['none', 'none', 'chain', 'backpack'];
    return {
      hat: zHats[h % zHats.length],
      top: zTops[(h >>> 3) % zTops.length],
      accessory: zAcc[(h >>> 6) % zAcc.length],
      outfitColor: '#365314',
      accentColor: '#84cc16',
      isZombie: true,
    };
  }
  const hats = ['none', 'none', 'none', 'cap', 'beanie', 'hood_up', 'headband', 'bandana'];
  const tops = ['tshirt', 'tshirt', 'hoodie', 'puff_jacket', 'vest', 'tracksuit', 'tactical'];
  const accs = ['none', 'none', 'none', 'scarf', 'backpack', 'glasses', 'headphones'];
  return {
    hat: hats[h % hats.length],
    top: tops[(h >>> 4) % tops.length],
    accessory: accs[(h >>> 8) % accs.length],
    outfitColor: DRIP_COLORS[(h >>> 12) % DRIP_COLORS.length],
    accentColor: DRIP_COLORS[(h >>> 16) % DRIP_COLORS.length],
    isZombie: false,
  };
}

export function normalizeDrip(rawDrip, id, role, index, seedStr = '') {
  const def = defaultDripFor(id, role, index, seedStr);
  const d = rawDrip && typeof rawDrip === 'object' ? rawDrip : {};
  const isZombie = typeof d.isZombie === 'boolean' ? d.isZombie : def.isZombie;
  return {
    hat: HATS.includes(d.hat) ? d.hat : def.hat,
    top: TOPS.includes(d.top) ? d.top : def.top,
    accessory: ACCESSORIES.includes(d.accessory) ? d.accessory : def.accessory,
    outfitColor: hexColor(d.outfitColor, def.outfitColor),
    accentColor: hexColor(d.accentColor, def.accentColor),
    isZombie,
  };
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

function normalizeCharacters(raw, warnings, seedStr = '') {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const c of list.slice(0, LIMITS.maxCharacters)) {
    const idx = out.length;
    const fallbackId = idx === 0 ? 'hero' : `char${idx + 1}`;
    let id = slugId(c?.id, fallbackId);
    while (seen.has(id)) id = `${id}_${idx + 1}`;
    seen.add(id);
    const role = str(c?.role, 40, idx === 0 ? 'protagonist' : 'supporting');
    const drip = normalizeDrip(c?.drip, id, role, idx, seedStr);
    const isZombie = Boolean(c?.isZombie || drip.isZombie || /zombie|infected|undead/i.test(`${id} ${role} ${c?.name || ''}`));
    drip.isZombie = isZombie;
    const defaultCol = isZombie ? ZOMBIE_COLOR : CHARACTER_COLORS[idx % CHARACTER_COLORS.length];
    out.push({
      id,
      name: str(c?.name, 28, id === 'hero' ? 'Hero' : `Character ${idx + 1}`),
      color: hexColor(c?.color, defaultCol),
      role,
      isZombie,
      drip,
    });
  }
  if (out.length === 0) {
    warnings.push('No characters supplied; added a default hero.');
    const drip = defaultDripFor('hero', 'protagonist', 0, seedStr);
    out.push({
      id: 'hero',
      name: 'Hero',
      color: CHARACTER_COLORS[0],
      role: 'protagonist',
      isZombie: false,
      drip,
    });
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
    const charMeta = characters.find((ch) => ch.id === id);
    const { action, known } = normalizeAction(c?.action);
    if (!known && c?.action !== undefined) warnings.push(`Scene ${index + 1}: unknown action "${c.action}" -> idle.`);
    const pos = c?.position && typeof c.position === 'object' ? c.position : {};
    const emotion = EMOTIONS.includes(c?.emotion) ? c.emotion : (charMeta?.isZombie ? 'infected' : 'neutral');
    const isZombieNow = Boolean(
      c?.isZombie === true || charMeta?.isZombie === true ||
      action === 'zombie_walk' || action === 'zombie_chase' || action === 'infect' || emotion === 'infected'
    );
    const item = {
      id,
      action,
      position: {
        x: clamp(num(pos.x, 0.5), 0.06, 0.94),
        y: clamp(num(pos.y, 0.8), 0.2, 0.95),
      },
      emotion,
      facing: c?.facing === -1 ? -1 : 1,
      scale: clamp(num(c?.scale, 1), 0.45, 1.4),
      isZombie: isZombieNow,
    };
    if (c?.targetX !== undefined && Number.isFinite(Number(c.targetX))) {
      item.targetX = clamp(Number(c.targetX), 0.04, 0.96);
    }
    chars.push(item);
  });
  if (chars.length === 0) {
    chars.push({ id: ids[0], action: 'idle', position: { x: 0.5, y: 0.8 }, emotion: 'neutral', facing: 1, scale: 1, isZombie: false });
  }

  // Spread characters evenly when positions are missing or identical.
  if (chars.length > 1) {
    const xs = chars.map((c) => c.position.x);
    if (new Set(xs.map((x) => x.toFixed(2))).size < chars.length) {
      chars.forEach((c, i) => { c.position.x = clamp(0.16 + (0.68 * i) / (chars.length - 1), 0.08, 0.92); });
    }
  }
  // Figures on the right face left unless facing or targetX already directs them.
  chars.forEach((c) => {
    if (c.targetX !== undefined) {
      c.facing = c.targetX >= c.position.x ? 1 : -1;
    } else if (c.facing === 1 && c.position.x > 0.62 && chars.length > 1) {
      c.facing = -1;
    }
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
    textOverlay: str(scene.textOverlay, 48, ''),
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
 * Automatically infer the best tone and cast size from a topic when the user or AI
 * lets the story decide.
 */
export function inferStoryMeta(topic = '') {
  const t = String(topic).toLowerCase();
  let tone = 'dramatic';
  if (/zombie|virus|outbreak|apocalyp|infect|undead/i.test(t)) tone = 'scary';
  else if (/ghost|haunt|creepy|nightmare|monster|demon|stalker|3\s*am|alone|dark/i.test(t)) tone = 'scary';
  else if (/fight|war|battle|heist|robbery|ninja|assassin|chase|escape|police|agent/i.test(t)) tone = 'action';
  else if (/funny|meme|fail|silly|prank|clown|awkward|fart|bro|school/i.test(t)) tone = 'funny';
  else if (/learn|explain|how\s+to|history|science|quantum|fact|guide/i.test(t)) tone = 'educational';
  else if (/gym|grind|rich|success|discipline|dream|win|hustle|motivat/i.test(t)) tone = 'motivational';

  // Pick a dynamic cast count based on story scale
  let characterCount = 3;
  if (/zombie|apocalyp|outbreak|infect|crowd|army|war|school|party/i.test(t)) characterCount = 5;
  else if (/heist|gang|squad|team|bank|family/i.test(t)) characterCount = 4;
  else if (/duel|rival|friend|couple|boss|date/i.test(t)) characterCount = 2;
  else if (/alone|last\s+man|solitary|island/i.test(t)) characterCount = 2;

  return { tone, characterCount };
}

/**
 * Normalize arbitrary project-like JSON into a safe project.
 * Throws ValidationError only when no usable scenes exist (callers then fall back).
 */
export function normalizeProject(raw, defaults = {}) {
  const warnings = [];
  const src = raw && typeof raw === 'object' ? raw : {};
  const topicStr = str(src.topic, LIMITS.maxTopicChars, str(defaults.topic, LIMITS.maxTopicChars, ''));
  const inferred = inferStoryMeta(topicStr);
  const duration = clamp(Math.round(num(src.duration ?? defaults.duration, LIMITS.defaultDuration)), LIMITS.minDuration, LIMITS.maxDuration);
  const aspectRatio = ASPECT_RATIOS[src.aspectRatio] ? src.aspectRatio : (ASPECT_RATIOS[defaults.aspectRatio] ? defaults.aspectRatio : '9:16');
  const tone = TONES.includes(src.tone) ? src.tone : (TONES.includes(defaults.tone) ? defaults.tone : inferred.tone);
  const style = ANIMATION_STYLES.includes(src.style) ? src.style : (ANIMATION_STYLES.includes(defaults.style) ? defaults.style : 'classic');
  const seedStr = `${topicStr}:${src.title || defaults.title || ''}:${ src.seed || defaults.seed || ''}`;
  const characters = normalizeCharacters(src.characters, warnings, seedStr);

  const rawScenes = Array.isArray(src.scenes) ? src.scenes : [];
  if (rawScenes.length === 0) throw new ValidationError('The script has no scenes.', 'scenes');
  const scenes = rawScenes.slice(0, LIMITS.maxScenes).map((s, i) => normalizeScene(s, i, characters, warnings));
  if (rawScenes.length > LIMITS.maxScenes) warnings.push(`Trimmed to ${LIMITS.maxScenes} scenes.`);

  fitDurations(scenes, duration);

  return {
    title: str(src.title, 80, str(defaults.title, 80, 'Untitled Stick Story')),
    topic: topicStr,
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
  const inferred = inferStoryMeta(topic);
  const hasExplicitTone = typeof b.tone === 'string' && b.tone !== 'auto' && TONES.includes(b.tone);
  const tone = hasExplicitTone ? b.tone : (b.tone === 'auto' || b.tone === undefined ? inferred.tone : 'funny');

  const hasExplicitCount = b.characterCount !== undefined && b.characterCount !== null && b.characterCount !== 'auto' && b.characterCount !== '';
  const characterCount = hasExplicitCount
    ? clamp(Math.round(num(b.characterCount, inferred.characterCount)), 1, LIMITS.maxCharacters)
    : inferred.characterCount;

  return {
    topic,
    title: str(b.title, 80, ''),
    language: str(b.language, 40, 'English'),
    duration: Math.round(duration),
    aspectRatio: ASPECT_RATIOS[b.aspectRatio] ? b.aspectRatio : '9:16',
    tone,
    autoTone: !hasExplicitTone,
    style: ANIMATION_STYLES.includes(b.style) ? b.style : 'classic',
    characterCount,
    autoCharacters: !hasExplicitCount,
    narration: b.narration !== false,
    subtitles: b.subtitles !== false,
    seed: Number.isFinite(Number(b.seed)) ? Number(b.seed) : Math.floor(Math.random() * 1e9),
  };
}

/** Target number of scenes for a duration (30s -> ~6, 60s -> ~10). */
export function sceneCountFor(duration) {
  return clamp(Math.round(duration / 5.2), 5, LIMITS.maxScenes);
}
