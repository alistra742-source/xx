// Built-in story writer — the studio's no-model, no-key fallback.
//
// It reads the prompt, keeps the actor and goal it names, and writes a short
// scene-by-scene storyboard that follows the idea from setup to resolution.
// Every line is a complete sentence, so the storyboard renders and narrates even
// on a deployment with no language model configured.
import { sceneCountFor } from '../../shared/schema.js';
import { CHARACTER_COLORS } from '../../shared/constants.js';

const STOP = new Set(('a an the and or but of to in on at for with from by into over under about who that which is are was were be ' +
  'during after before when while his her their its my your our this these those it he she they we you i as so then than ' +
  'very really just up down out off again more most some any all one three new old small big young little every each another ' +
  'while there here what where why how can will would could should do does did has have had').split(' '));

// Agent nouns people actually put in prompts. Preferred over the first word so
// "a lighthouse keeper befriends a storm" is named after the keeper, not the tower.
const AGENTS = new Set(('keeper cat dog puppy kitten friends friend kid kids boy girl man woman robot astronaut chef botanist ' +
  'violinist detective teacher student hero heroine dragon knight thief alien scientist pilot doctor farmer artist musician ' +
  'traveler explorer ninja pirate wizard witch vampire zombie monster bear fox bird fish horse lion wolf princess prince ' +
  'king queen soldier survivor firefighter nurse baker painter dancer singer writer gamer athlete coach captain crew team ' +
  'brothers sisters family couple gardener mechanic engineer diver sailor fisherman hunter ranger scout').split(' '));

const VERBS = new Set(('learns learn builds build repairs repair befriends befriend escapes escape fights fight finds find opens open ' +
  'cooks cook bakes bake flies fly explores explore saves save tries try travels travel crosses cross solves solve hunts hunt ' +
  'follows follow breaks break wins win loses lose starts start makes make draws draw paints paint plays play sings sing ' +
  'dances dance searches search protects protect hides hide discovers discover challenges challenge survives survive plants ' +
  'plant cleans clean fixes fix steals steal chases chase rescues rescue trains train delivers deliver writes write reads read ' +
  'grows grow catches catch digs dig sails sail drives drive climbs climb races race performs perform invents invent plans plan ' +
  'wants want needs need dreams dream hopes hope misses miss loves love fears fear leaves leave joins join quits quit').split(' '));

const SETTINGS = [
  [/\b(desert|sand|dune|sahara)\b/, 'desert', 'in the desert'],
  [/\b(forest|woods|jungle|camp|trees)\b/, 'forest', 'in the forest'],
  [/\b(school|classroom|college|campus|university|exam|class)\b/, 'school', 'at school'],
  [/\b(office|workplace|company|corporate|meeting|job|desk)\b/, 'office', 'at the office'],
  [/\b(city|downtown|town|street|road|alley|subway|traffic|bridge)\b/, 'street', 'across the city'],
  [/\b(battlefield|battle|war|trench|army|fight)\b/, 'battlefield', 'on the battlefield'],
  [/\b(horror|graveyard|cemetery|haunted|crypt|ghost|dark)\b/, 'horror', 'in the dark'],
  [/\b(mountain|meadow|field|hills|countryside|valley|garden|farm)\b/, 'landscape', 'out in the open'],
  [/\b(rooftop|roof|skyscraper|tower|lighthouse|cliff|storm|sea|ocean|beach|boat|ship|river|rain)\b/, 'rooftop', 'in the open weather'],
  [/\b(bunker|basement|cellar|shelter|underground)\b/, 'bunker', 'underground'],
  [/\b(lab|laboratory|hospital|clinic|experiment|space|moon|rocket|planet|orbit|star|mars|galaxy)\b/, 'lab', 'among the machines'],
  [/\b(bedroom|home|house|apartment|kitchen|couch|cook|chef|pasta|food|bake|bakery|bread|recipe|cafe)\b/, 'bedroom', 'at home'],
];

const clean = (text) => String(text || '').replace(/\s+/g, ' ').trim();
const cap = (word) => (word ? word[0].toUpperCase() + word.slice(1) : word);
const wordCount = (text) => clean(text).split(' ').filter(Boolean).length;
const v = (plural, singular, pluralForm) => (plural ? pluralForm : singular);

/** Drop command wrappers ("make a 30 second video about ...") so only the idea remains. */
export function ideaText(raw) {
  let s = clean(raw);
  for (let i = 0; i < 2; i++) {
    s = s.replace(/^(please\s+)?(make|create|write|generate|build|animate|show|give me|do)\b[\s\S]*?\b(about|of|where|showing|with)\s+/i, '');
    s = s.replace(/^(a|an|the)?\s*(\d+\s*[- ]?)?(second|sec|minute|min)?\s*(stick\s*[- ]?figure|stickman|animated|animation|video|story|movie|clip|short)\s+(about|of|where|showing)?\s*/i, '');
  }
  return s.replace(/[.!?]+$/, '').trim();
}

/** Actor, goal and setting named by the prompt. */
export function readPremise(topic) {
  const idea = ideaText(topic) || 'one unexpected night';
  const lower = idea.toLowerCase();
  const words = lower.split(/[^a-z0-9'’-]+/).filter(Boolean);
  const content = words.filter((w) => !STOP.has(w) && !VERBS.has(w) && w.length > 1);

  const plural = /^(two|three|four|five|several|many|friends|kids|brothers|sisters|siblings|family|couple|team|crew|group)\b/.test(lower)
    || /\b(friends|kids|brothers|sisters|siblings|team|crew|group|couple)\b/.test(lower);

  const agent = content.find((w) => AGENTS.has(w)) || content[0] || 'hero';
  const verbIndex = words.findIndex((w) => VERBS.has(w));
  const goal = verbIndex >= 0 ? clean(words.slice(verbIndex + 1).join(' ')) : '';
  const setting = SETTINGS.find(([re]) => re.test(lower)) || [null, plural ? 'street' : 'landscape', plural ? 'across the city' : 'out in the open'];

  return {
    idea,
    actor: plural ? `The ${agent}` : cap(agent),
    plural,
    goal: goal.length > 2 ? goal : '',
    companion: content.filter((w) => w !== agent && AGENTS.has(w)).map(cap)[0] || '',
    background: setting[1],
    place: setting[2],
  };
}

// Nine story beats, each with alternative wordings so a longer video never
// repeats a line.
function beatLines({ actor, plural, goal, place }) {
  const actorTries = v(plural, 'tries', 'try');
  const actorKeeps = v(plural, 'keeps', 'keep');
  const actorTakes = v(plural, 'takes', 'take');
  const actorGets = v(plural, 'gets', 'get');
  const actorWants = v(plural, 'wants', 'want');
  const actorLooks = v(plural, 'looks', 'look');
  const actorStarts = v(plural, 'starts', 'start');
  const actorIs = v(plural, 'is', 'are');
  const actorDoes = v(plural, 'does not', 'do not');
  return [
    [goal ? `${actor} ${actorWants} one thing: ${goal}.` : `${actor} ${actorWants} a better day than this one.`,
      goal ? `All ${actor} ${v(plural, 'needs', 'need')} is ${goal}.` : `${actor} ${v(plural, 'needs', 'need')} one good idea.`],
    [`The first attempt starts well, then falls apart.`,
      `${actor} ${actorTries} ${place}, and it goes wrong fast.`],
    [`Nothing works ${place}, but ${actor} ${actorKeeps} going anyway.`,
      `The setback lands hard. ${actor} ${actorDoes} stop.`],
    [`A small win lands, and ${actor} ${actorStarts} to believe it.`,
      `One piece finally works, so ${actor} pushes harder.`],
    [`Then the whole plan collapses at once.`,
      `Everything ${actor} built starts to slip away.`],
    [`${actor} ${actorTakes} a breath and ${actorLooks} at what is left.`,
      `${actor} sits with the mess and thinks it through.`],
    [`${actor} ${actorTries} once more, with nothing left to lose.`,
      `One more attempt, and this time ${actor} ${actorIs} ready.`],
    [goal ? `${actor} ${actorGets} ${goal} at last.` : `${actor} ${actorGets} there at last.`,
      goal ? `${actor} ${actorGets} ${goal}, and it holds.` : `The plan holds, at last.`],
    [`It was worth every failed try.`,
      `${actor} walks out taller than before.`],
  ];
}

const BEAT_ACTION = ['stand', 'walk', 'think', 'point', 'fall', 'think', 'run', 'celebrate', 'wave'];
const BEAT_EMOTION = ['determined', 'determined', 'sad', 'surprised', 'scared', 'confused', 'determined', 'happy', 'happy'];
const BEAT_PURPOSE = ['Meet the hero', 'First attempt', 'Setback', 'Small win', 'Crisis', 'Regroup', 'Last try', 'Payoff', 'Closing image'];
const BEAT_CAMERA = ['wide', 'medium', 'close', 'medium', 'close', 'medium', 'medium', 'wide', 'wide'];
const BEAT_X = [0.4, 0.26, 0.36, 0.46, 0.32, 0.4, 0.24, 0.44, 0.5];
const BEAT_EFFECTS = [['day'], ['zoom'], ['rain'], ['zoom'], ['impact_flash'], ['night'], ['motion_lines'], ['fade'], ['day']];

const ACTION_TEXT = {
  stand: 'Holds still and looks at the problem.',
  walk: 'Moves toward the goal.',
  think: 'Pauses to work out a better plan.',
  point: 'Spots the opening and points at it.',
  fall: 'Gets knocked back by the setback.',
  run: 'Runs the last plan before time drains away.',
  celebrate: 'Wins, and finally lets go.',
  wave: 'Turns back to the horizon, changed.',
};

const wordBudget = (duration) => Math.max(3, Math.floor(Number(duration || 5) * 2.2));

/** Keep narration to a complete sentence that fits the scene's speaking time. */
function fit(text, duration) {
  const budget = wordBudget(duration);
  const words = clean(text).split(' ');
  if (words.length <= budget) return clean(text);
  const sentences = clean(text).match(/[^.!?]+[.!?]/g) || [];
  const kept = sentences.filter((s) => wordCount(s) <= budget);
  if (kept.length) return kept.join(' ').trim();
  let clipped = words.slice(0, budget).join(' ').replace(/[,;:]+$/, '');
  while (/\s(and|but|the|a|an|of|to|in|on|with|then|at|once|is|was|one)$/i.test(clipped)) clipped = clipped.replace(/\s+\w+$/, '');
  return `${clipped}.`;
}

/** Strictly increasing beat numbers for a video shorter than the beat list. */
function spread(count, total) {
  const picks = [];
  let last = -1;
  for (let i = 0; i < count; i++) {
    const remaining = count - i - 1;
    const ceiling = total - 1 - remaining;
    const target = Math.round((i * (total - 1)) / Math.max(1, count - 1));
    const index = Math.min(ceiling, Math.max(last + 1, target));
    picks.push(index);
    last = index;
  }
  return picks;
}

// Short videos keep the beats that carry the story: setup, attempt, crisis, payoff.
const ESSENTIAL = [
  [0, 4, 7], [0, 1, 4, 7], [0, 1, 3, 4, 7], [0, 1, 2, 3, 4, 7], [0, 1, 2, 3, 4, 5, 7],
  [0, 1, 2, 3, 4, 5, 6, 7], [0, 1, 2, 3, 4, 5, 6, 7, 8],
];

/** Beat number per scene; longer videos repeat beats with different wording. */
export function beatPlan(count) {
  const total = BEAT_ACTION.length;
  if (count <= total) return ESSENTIAL[Math.max(0, count - 3)] ?? spread(count, total);
  return Array.from({ length: count }, (_, i) => Math.min(total - 1, Math.floor((i * total) / count)));
}

/** Builds a complete project from the prompt with no model and no network. */
export function writeInstantStory(req) {
  const premise = readPremise(req.topic);
  const count = sceneCountFor(req.duration);
  const lines = beatLines(premise);
  const plan = beatPlan(count);
  const sceneSeconds = Math.round((Number(req.duration) / count) * 1000) / 1000;

  const cast = [{ id: 'lead', name: premise.actor, role: premise.plural ? 'friends' : 'protagonist', color: CHARACTER_COLORS[0] }];
  if (premise.companion) cast.push({ id: 'mate', name: premise.companion, role: 'companion', color: CHARACTER_COLORS[1] });
  const hasMate = cast.length > 1;

  const used = new Map();
  const scenes = plan.map((beat, i) => {
    const seen = used.get(beat) || 0;
    used.set(beat, seen + 1);
    const variants = lines[beat];
    const narration = fit(variants[seen % variants.length], sceneSeconds);
    const action = BEAT_ACTION[beat];
    const facing = i % 2 ? -1 : 1;
    const x = BEAT_X[beat];
    return {
      duration: sceneSeconds,
      background: premise.background,
      purpose: BEAT_PURPOSE[beat],
      action: ACTION_TEXT[action],
      camera: BEAT_CAMERA[beat],
      cameraMotion: beat === 4 ? 'push_in' : 'static',
      shotDescription: `Keep ${premise.actor}${hasMate ? ` and ${premise.companion}` : ''} readable ${premise.place}.`,
      continuity: `Same look and setting through scene ${i + 1}.`,
      effects: BEAT_EFFECTS[beat],
      textOverlay: '',
      narration,
      characters: [
        { id: 'lead', action, emotion: BEAT_EMOTION[beat], position: { x, y: 0.81 }, facing, ...(action === 'walk' || action === 'run' ? { targetX: facing > 0 ? 0.76 : 0.22 } : {}) },
        ...(hasMate ? [{ id: 'mate', action: beat >= 4 ? 'wake_up' : 'stand', emotion: beat >= 7 ? 'happy' : 'neutral', position: { x: Math.min(0.88, x + 0.3), y: 0.82 }, facing: -1 }] : []),
      ],
    };
  });

  return {
    title: cap(premise.idea).slice(0, 80),
    topic: req.topic,
    language: req.language || 'English',
    duration: req.duration,
    aspectRatio: req.aspectRatio || '9:16',
    tone: req.autoTone === false ? req.tone : 'dramatic',
    style: req.style || 'classic',
    narration: req.narration !== false,
    subtitles: { enabled: req.subtitles !== false },
    characters: cast.map((c, i) => ({ ...c, drip: { hat: 'none', top: i ? 'tshirt' : 'hoodie', accessory: 'none', outfitColor: c.color } })),
    scenes,
    seed: Number(req.seed) || 1,
  };
}
