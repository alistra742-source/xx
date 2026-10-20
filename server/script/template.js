// Procedural Faceless Story Generator.
//
// Turn any prompt into a vivid, multi-scene animated story with randomized hooks,
// character casts with drip, multi-character choreography, and zero prompt-reading.
import { sceneCountFor, defaultDripFor, inferStoryMeta } from '../../shared/schema.js';
import { CHARACTER_COLORS, ZOMBIE_COLOR, BACKGROUNDS, BACKGROUND_ALIASES } from '../../shared/constants.js';

// Topic words that name a location, so every scene is drawn in the story's setting.
const SETTING_WORDS = {
  desert: 'desert', sand: 'desert', dune: 'desert', dunes: 'desert', sahara: 'desert',
  forest: 'forest', woods: 'forest', jungle: 'forest', swamp: 'forest', camp: 'forest',
  school: 'school', classroom: 'school', college: 'school', university: 'school', campus: 'school',
  office: 'office', workplace: 'office', company: 'office', corporate: 'office',
  city: 'city', downtown: 'city', town: 'city', metro: 'city', subway: 'city',
  street: 'street', road: 'street', highway: 'street', alley: 'street',
  battlefield: 'battlefield', battle: 'battlefield', war: 'battlefield', trench: 'battlefield',
  horror: 'horror', graveyard: 'horror', cemetery: 'horror', haunted: 'horror', crypt: 'horror',
  hills: 'landscape', field: 'landscape', meadow: 'landscape', mountain: 'landscape', countryside: 'landscape', landscape: 'landscape',
  rooftop: 'rooftop', roof: 'rooftop', skyscraper: 'rooftop',
  bunker: 'bunker', shelter: 'bunker', basement: 'bunker', underground: 'bunker', cellar: 'bunker',
  lab: 'lab', laboratory: 'lab', hospital: 'lab', clinic: 'lab',
  bedroom: 'bedroom', house: 'bedroom', home: 'bedroom', apartment: 'bedroom', kitchen: 'bedroom',
  studio: 'white',
  space: 'space', galaxy: 'space', planet: 'space', moon: 'space', alien: 'space', aliens: 'space', astronaut: 'space', spaceship: 'space', mars: 'space',
  beach: 'beach', ocean: 'beach', sea: 'beach', island: 'beach', pirate: 'beach', pirates: 'beach', shark: 'beach', surf: 'beach',
  snow: 'snow', winter: 'snow', arctic: 'snow', ice: 'snow', blizzard: 'snow', antarctica: 'snow', christmas: 'snow',
  castle: 'castle', kingdom: 'castle', medieval: 'castle', knight: 'castle', knights: 'castle', dragon: 'castle', wizard: 'castle', king: 'castle', fantasy: 'castle',
};

/** Returns the first setting named in the topic, or null. */
export function settingFromTopic(topic) {
  const words = String(topic || '').toLowerCase().split(/[^a-z]+/).filter(Boolean);
  for (const w of words) {
    if (SETTING_WORDS[w]) return SETTING_WORDS[w];
    if (BACKGROUNDS.includes(w)) return w;
    if (BACKGROUND_ALIASES[w]) return BACKGROUND_ALIASES[w];
  }
  return null;
}

/** Forces every scene into the setting the topic names; leaves scenes alone when none is named. */
function applyTopicSetting(scenes, topic) {
  const setting = settingFromTopic(topic);
  if (!setting) return scenes;
  return scenes.map((scene) => ({ ...scene, background: setting }));
}

function makeRng(seed) {
  let s = (Number(seed) >>> 0) || (Date.now() >>> 0) || 123456789;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return (s % 100000) / 100000;
  };
}

/**
 * Strip meta-instructions ("create a 45-second funny animation about a stick figure...")
 * so narration NEVER reads the user's raw prompt aloud.
 */
export function extractSubject(rawTopic = '') {
  let s = String(rawTopic || '').trim();
  // Strip command prefixes repeatedly
  for (let i = 0; i < 3; i++) {
    s = s
      .replace(/^(please\s+)?(can\s+you\s+|could\s+you\s+)?(create|make|generate|write|build|tell|give\s+me|do|animate|show)\s+/i, '')
      .replace(/^(a|an|the)\s+/i, '')
      .replace(/^(\d+\s*[- ]?\s*(second|sec|s|minute|min)\s+)/i, '')
      .replace(/^(funny|scary|dramatic|educational|motivational|action|epic|cool|random|realistic|short|viral|faceless)\s+/i, '')
      .replace(/^(stick\s*[- ]?figure|stickman|stick\s*men|animated|animation|video|story|movie|clip|short)\s+/i, '')
      .replace(/^(about|where|of|on|for|showing|with)\s+/i, '')
      .replace(/^(a|an)\s+(stick\s*[- ]?figure|stickman|guy|man|boy|girl|person|dude|bro)\s+(who\s+is\s+|trying\s+to\s+|that\s+)/i, '')
      .trim();
  }
  s = s.replace(/[.!?]+$/, '').trim();
  if (!s || s.length < 3) return 'the unexpected night';
  // Keep it concise (max 6 words) so it never sounds like a prompt
  const words = s.split(/\s+/);
  return words.slice(0, 6).join(' ');
}

const HERO_NAMES = ['Jay', 'Kai', 'Leo', 'Max', 'Zack', 'Cole', 'Nate', 'jax'];
const FRIEND_NAMES = ['Milo', 'Sam', 'Toby', 'Rex', 'fin', 'Dre'];

function pick(list, rng) {
  return list[Math.floor(rng() * list.length)];
}

function remixOpening(beats, rng, subject, heroName) {
  const opening = pick([
    { background: 'city', textOverlay: 'THE FIRST WARNING', effects: ['night', 'zoom'], action: 'look_window', emotion: 'confused', line: `Everyone missed the first warning about ${subject}. ${heroName} did not.` },
    { background: 'street', textOverlay: 'NO TURNING BACK', effects: ['rain', 'motion_lines'], action: 'run', emotion: 'scared', line: `${heroName} was already running when the truth about ${subject} finally hit.` },
    { background: 'bedroom', textOverlay: '3:07 AM', effects: ['night', 'tv_glow'], action: 'phone_scroll', emotion: 'surprised', line: `At 3:07 AM, one message about ${subject} changed everything for ${heroName}.` },
    { background: 'rooftop', textOverlay: 'AFTER THE FALL', effects: ['night', 'vignette'], action: 'look_right', emotion: 'determined', line: `By sunrise, ${heroName} would understand what ${subject} had cost. This was the moment it began.` },
    { background: 'office', textOverlay: 'THE WRONG DOOR', effects: ['zoom', 'alarm_flash'], action: 'sneak', emotion: 'scared', line: `${heroName} pushed open the wrong door, and ${subject} was waiting on the other side.` },
  ], rng);
  const [first, ...rest] = beats;
  const lead = first?.characters?.[0];
  if (!first || !lead) return beats;
  const { targetX: _targetX, ...leadWithoutTarget } = lead;
  return [{
    ...first,
    background: opening.background,
    textOverlay: opening.textOverlay,
    effects: opening.effects,
    narration: opening.line,
    characters: [{ ...leadWithoutTarget, action: opening.action, emotion: opening.emotion, position: { x: 0.38, y: 0.81 }, facing: 1 }, ...first.characters.slice(1)],
  }, ...rest];
}

/**
 * Build a full zombie outbreak story:
 * sleep -> wake up to sirens -> turn on TV news warning -> look out window at green zombies ->
 * zombies chase & infect pedestrians on the street -> barricade / final escape.
 */
function buildZombieStory(req, rng, count) {
  const heroName = pick(HERO_NAMES, rng);
  const civName = pick(FRIEND_NAMES, rng);
  const seedStr = `${req.topic}:${req.seed || ''}`;

  const characters = [
    {
      id: 'hero',
      name: heroName,
      role: 'survivor',
      color: CHARACTER_COLORS[0],
      isZombie: false,
      drip: defaultDripFor('hero', 'survivor', 0, `${seedStr}:h`),
    },
    {
      id: 'civilian',
      name: civName,
      role: 'neighbor',
      color: CHARACTER_COLORS[1],
      isZombie: false,
      drip: defaultDripFor('civilian', 'neighbor', 1, `${seedStr}:c`),
    },
    {
      id: 'zombie_alpha',
      name: 'Patient Zero',
      role: 'zombie',
      color: ZOMBIE_COLOR,
      isZombie: true,
      drip: { ...defaultDripFor('zombie_alpha', 'zombie', 2, `${seedStr}:z1`), isZombie: true },
    },
    {
      id: 'zombie_runner',
      name: 'Walker',
      role: 'zombie',
      color: ZOMBIE_COLOR,
      isZombie: true,
      drip: { ...defaultDripFor('zombie_runner', 'zombie', 3, `${seedStr}:z2`), isZombie: true },
    },
    {
      id: 'zombie_horde',
      name: 'Infected',
      role: 'zombie',
      color: ZOMBIE_COLOR,
      isZombie: true,
      drip: { ...defaultDripFor('zombie_horde', 'zombie', 4, `${seedStr}:z3`), isZombie: true },
    },
  ];

  const storyBeats = [
    {
      background: 'bedroom',
      textOverlay: '3:14 AM',
      effects: ['night'],
      narration: pick([
        `${heroName} was fast asleep in his apartment, completely unaware the world outside was ending.`,
        `It was three in the morning. ${heroName} slept peacefully while something deadly spread through the city.`,
        `At midnight, the streets were quiet, and ${heroName} was knocked out cold in his bed.`,
      ], rng),
      characters: [
        { id: 'hero', action: 'sleep', emotion: 'neutral', position: { x: 0.24, y: 0.72 }, facing: 1 },
      ],
    },
    {
      background: 'bedroom',
      textOverlay: 'EMERGENCY SIRENS',
      effects: ['alarm_flash', 'shake', 'float_text'],
      narration: pick([
        `Suddenly, deafening sirens shattered the silence and jolted him straight out of bed!`,
        `Without warning, emergency alarms echoed across every block, waking ${heroName} in a cold sweat!`,
        `Red sirens flashed through the blinds as ${heroName} bolted awake in total confusion.`,
      ], rng),
      characters: [
        { id: 'hero', action: 'wake_up', emotion: 'surprised', position: { x: 0.30, y: 0.80 }, facing: 1 },
      ],
    },
    {
      background: 'bedroom',
      textOverlay: 'BREAKING NEWS',
      effects: ['tv_glow', 'alarm_flash'],
      narration: pick([
        `He switched on the TV. Breaking news flashed across the screen: an unknown virus had hit—lock all doors and windows immediately!`,
        `On the television, a panicked anchor warned that a lethal mutation was spreading fast: stay inside and bolt every door!`,
        `The emergency broadcast blared from the TV: a contagious outbreak was loose in the city. Do not go outside!`,
      ], rng),
      characters: [
        { id: 'hero', action: 'watch_tv', emotion: 'scared', position: { x: 0.44, y: 0.82 }, facing: 1 },
      ],
    },
    {
      background: 'bedroom',
      textOverlay: 'OUTSIDE THE WINDOW',
      effects: ['alarm_flash', 'zoom'],
      narration: pick([
        `${heroName} rushed to the window and looked down at the street. His blood ran cold.`,
        `Heart pounding, he peered down through the apartment window at the road below.`,
        `He crept to the glass and looked down. What he saw on the pavement made him freeze.`,
      ], rng),
      characters: [
        { id: 'hero', action: 'look_window', emotion: 'scared', position: { x: 0.56, y: 0.81 }, facing: 1 },
      ],
    },
    {
      background: 'street',
      textOverlay: 'THE OUTBREAK',
      effects: ['infection_spores', 'speed_lines', 'motion_lines'],
      narration: pick([
        `Down on the street, glowing green zombies were sprinting after terrified neighbors in the dark!`,
        `Below his building, ravenous green infected were chasing people down the middle of the road!`,
        `A pack of glowing green undead swarmed the asphalt, hunting down anyone still outside!`,
      ], rng),
      characters: [
        { id: 'zombie_alpha', action: 'zombie_chase', emotion: 'infected', position: { x: 0.14, y: 0.82 }, targetX: 0.54, facing: 1, isZombie: true },
        { id: 'zombie_runner', action: 'zombie_walk', emotion: 'infected', position: { x: 0.06, y: 0.84 }, targetX: 0.42, facing: 1, isZombie: true },
        { id: 'civilian', action: 'run', emotion: 'scared', position: { x: 0.46, y: 0.82 }, targetX: 0.86, facing: 1 },
      ],
    },
    {
      background: 'street',
      textOverlay: 'INFECTION SPREADS',
      effects: ['infection_spores', 'impact_flash', 'shake'],
      narration: pick([
        `One zombie lunged and bit ${civName}—within seconds, his skin turned toxic green as he joined the horde!`,
        `The lead creature tackled ${civName} under the streetlight. Green venom coursed through him as he mutated into one of them!`,
        `${civName} stumbled and got cornered. In a flash of green spores, the virus took over and turned him undead!`,
      ], rng),
      characters: [
        { id: 'zombie_alpha', action: 'infect', emotion: 'infected', position: { x: 0.36, y: 0.82 }, facing: 1, isZombie: true },
        { id: 'civilian', action: 'turn_zombie', emotion: 'scared', position: { x: 0.52, y: 0.82 }, facing: -1 },
        { id: 'zombie_runner', action: 'zombie_walk', emotion: 'infected', position: { x: 0.18, y: 0.84 }, targetX: 0.30, facing: 1, isZombie: true },
      ],
    },
    {
      background: 'bedroom',
      textOverlay: 'LOCKDOWN',
      effects: ['alarm_flash', 'shake'],
      narration: pick([
        `Heavy footsteps slammed against the hallway stairs. ${heroName} grabbed wooden planks and barricaded the door!`,
        `They were inside the building! ${heroName} bolted the deadbolt and nailed heavy boards across the entrance!`,
        `Scratching echoed right outside his apartment. ${heroName} braced the door with everything he had!`,
      ], rng),
      characters: [
        { id: 'hero', action: 'barricade', emotion: 'determined', position: { x: 0.48, y: 0.82 }, facing: -1 },
      ],
    },
    {
      background: 'rooftop',
      textOverlay: 'NIGHT ONE SURVIVED',
      effects: ['infection_spores', 'zoom', 'fade'],
      narration: pick([
        `${heroName} climbed onto the rooftop as the infected swarmed the streets below. Night one had only just begun.`,
        `Escaping to the roof under a toxic moon, ${heroName} watched the glowing horde take the city. Would you survive?`,
        `Out on the rooftop, ${heroName} caught his breath while sirens faded into the night. Drop a follow for Part 2!`,
      ], rng),
      characters: [
        { id: 'hero', action: 'stand', emotion: 'determined', position: { x: 0.28, y: 0.78 }, facing: 1 },
        { id: 'zombie_alpha', action: 'zombie_walk', emotion: 'infected', position: { x: 0.72, y: 0.80 }, targetX: 0.56, facing: -1, isZombie: true },
        { id: 'zombie_horde', action: 'zombie_walk', emotion: 'infected', position: { x: 0.86, y: 0.81 }, targetX: 0.68, facing: -1, isZombie: true },
      ],
    },
  ];

  // Combine the street chase and bite/transformation into one animated beat at
  // common short durations so the 30-second version still includes every key plot point.
  const chase = storyBeats[4];
  const bite = storyBeats[5];
  const outbreakScene = {
    background: 'street',
    textOverlay: 'CHASE → INFECTION',
    effects: [...new Set([...(chase.effects || []), ...(bite.effects || [])])].slice(0, 5),
    narration: pick([
      `Below, green zombies sprinted after terrified neighbors. One caught ${civName}, and toxic green veins spread as he transformed!`,
      `The infected swarmed the street, chasing everyone in sight. A zombie bit ${civName}, who turned green and joined the horde!`,
      `A glowing walker lunged at ${civName} during the chase. Green spores burst as the virus took over his body!`,
    ], rng),
    characters: [
      { id: 'zombie_alpha', action: 'zombie_chase', emotion: 'infected', position: { x: 0.12, y: 0.82 }, targetX: 0.38, facing: 1, isZombie: true },
      { id: 'zombie_runner', action: 'zombie_walk', emotion: 'infected', position: { x: 0.08, y: 0.84 }, targetX: 0.32, facing: 1, isZombie: true },
      { id: 'civilian', action: 'turn_zombie', emotion: 'scared', position: { x: 0.45, y: 0.82 }, facing: -1 },
    ],
  };
  const wakeUp = {
    ...storyBeats[1],
    narration: pick([
      `${heroName} was asleep when emergency sirens exploded outside. He jolted awake as red light flashed across the room!`,
      `At 3 AM, ${heroName} was knocked out cold—until citywide alarms ripped him out of bed.`,
      `The world was quiet. Then sirens screamed. ${heroName} snapped awake as the city went red.`,
    ], rng),
    characters: [
      { id: 'hero', action: 'wake_up', emotion: 'surprised', position: { x: 0.3, y: 0.8 }, facing: 1 },
    ],
  };
  const finalEscape = {
    background: 'rooftop',
    textOverlay: 'NIGHT ONE SURVIVED',
    effects: ['infection_spores', 'zoom', 'fade'],
    narration: pick([
      `${heroName} barricaded the door, escaped to the rooftop, and watched the infected swarm below. Night one had only begun.`,
      `He locked the apartment and climbed to the roof as the green horde took the streets. Would you survive night one?`,
      `${heroName} reached the rooftop while sirens faded into the night. Follow for part two—if he makes it!`,
    ], rng),
    characters: [
      { id: 'hero', action: 'run', emotion: 'determined', position: { x: 0.18, y: 0.78 }, targetX: 0.44, facing: 1 },
      { id: 'zombie_alpha', action: 'zombie_walk', emotion: 'infected', position: { x: 0.78, y: 0.80 }, targetX: 0.62, facing: -1, isZombie: true },
      { id: 'zombie_horde', action: 'zombie_walk', emotion: 'infected', position: { x: 0.90, y: 0.81 }, targetX: 0.70, facing: -1, isZombie: true },
    ],
  };
  // A compact 30-second cut still has every requested beat: sleep/wake to sirens ->
  // TV warning -> window reveal -> chase + visible infection -> barricade -> escape.
  // The chase and bite play as simultaneous action in one animated street scene.
  const compactBeats = [wakeUp, storyBeats[2], storyBeats[3], outbreakScene, storyBeats[6], finalEscape];
  const selected = selectScenesForCount(compactBeats, count, rng, extractSubject(req.topic));
  // Keep the user's own opening when the prompt describes one (waking to alarms at 3 AM);
  // otherwise vary the hook so repeated runs don't open identically.
  const userSpecifiesOpening = /\b(wake|woke|waking|alarm|asleep|sleep|bed|3\s?am|2\s?am)\b/i.test(req.topic || '');
  const opened = userSpecifiesOpening ? selected : remixOpening(selected, rng, extractSubject(req.topic), heroName);
  const titles = [
    '3:14 AM: The Green Outbreak',
    'Don’t Look Out The Window',
    'Night Zero: Virus Alert',
    'When The Sirens Started',
    'Last Apartment Standing',
  ];
  return {
    title: req.title || pick(titles, rng),
    tone: 'scary',
    characters,
    scenes: opened.map((s) => ({
      ...s,
      duration: req.duration / opened.length,
      narration: req.narration ? s.narration : '',
    })),
  };
}

function buildHeistStory(req, rng, count) {
  const leader = pick(HERO_NAMES, rng);
  const hacker = pick(FRIEND_NAMES, rng);
  const seedStr = `${req.topic}:${req.seed || ''}`;
  const characters = [
    { id: 'hero', name: leader, role: 'mastermind', color: CHARACTER_COLORS[0], drip: { hat: 'hood_up', top: 'tactical', accessory: 'mask', outfitColor: '#1e293b', accentColor: '#ef4444', isZombie: false } },
    { id: 'hacker', name: hacker, role: 'partner', color: CHARACTER_COLORS[1], drip: { hat: 'beanie', top: 'hoodie', accessory: 'shades', outfitColor: '#3b82f6', accentColor: '#facc15', isZombie: false } },
    { id: 'guard', name: 'Chief Guard', role: 'security', color: CHARACTER_COLORS[2], drip: { hat: 'cap', top: 'suit', accessory: 'shades', outfitColor: '#0f172a', accentColor: '#38bdf8', isZombie: false } },
    { id: 'backup', name: 'SWAT Unit', role: 'security', color: CHARACTER_COLORS[3], drip: { hat: 'helmet', top: 'tactical', accessory: 'none', outfitColor: '#334155', accentColor: '#ef4444', isZombie: false } },
  ];
  const beats = [
    {
      background: 'bunker', textOverlay: 'THE PLAN', effects: ['night'],
      narration: `At midnight, ${leader} and ${hacker} reviewed the blueprints one last time. One mistake meant prison.`,
      characters: [
        { id: 'hero', action: 'point', emotion: 'determined', position: { x: 0.34, y: 0.82 }, facing: 1 },
        { id: 'hacker', action: 'think', emotion: 'neutral', position: { x: 0.66, y: 0.82 }, facing: -1 },
      ],
    },
    {
      background: 'office', textOverlay: 'INFILTRATION', effects: ['night'],
      narration: `They slipped past the front desk in dead silence, creeping toward the laser-guarded vault.`,
      characters: [
        { id: 'hero', action: 'sneak', emotion: 'determined', position: { x: 0.16, y: 0.81 }, targetX: 0.56, facing: 1 },
        { id: 'hacker', action: 'sneak', emotion: 'scared', position: { x: 0.06, y: 0.82 }, targetX: 0.38, facing: 1 },
      ],
    },
    {
      background: 'lab', textOverlay: 'ALARM TRIGGERED', effects: ['alarm_flash', 'shake', 'float_text'],
      narration: `Then ${hacker} tripped a hidden sensor! Red lasers locked the room and the sirens went wild!`,
      characters: [
        { id: 'hero', action: 'surprised', emotion: 'surprised', position: { x: 0.42, y: 0.82 }, facing: 1 },
        { id: 'hacker', action: 'panic', emotion: 'scared', position: { x: 0.68, y: 0.82 }, facing: -1 },
      ],
    },
    {
      background: 'office', textOverlay: 'CONFRONTATION', effects: ['alarm_flash', 'speed_lines', 'impact_flash'],
      narration: `Armed security burst through the doors! ${leader} dodged a tackle and fought his way to the exit!`,
      characters: [
        { id: 'hero', action: 'fight', emotion: 'determined', position: { x: 0.42, y: 0.81 }, facing: 1 },
        { id: 'guard', action: 'fight', emotion: 'angry', position: { x: 0.58, y: 0.81 }, facing: -1 },
        { id: 'backup', action: 'run', emotion: 'angry', position: { x: 0.86, y: 0.82 }, targetX: 0.68, facing: -1 },
      ],
    },
    {
      background: 'rooftop', textOverlay: 'ROOFTOP ESCAPE', effects: ['speed_lines', 'zoom'],
      narration: `Cornered on the high-rise roof, they sprinted full speed toward the ledge and made the jump!`,
      characters: [
        { id: 'hero', action: 'jump', emotion: 'determined', position: { x: 0.52, y: 0.78 }, targetX: 0.84, facing: 1 },
        { id: 'hacker', action: 'run', emotion: 'scared', position: { x: 0.28, y: 0.78 }, targetX: 0.65, facing: 1 },
        { id: 'guard', action: 'point', emotion: 'angry', position: { x: 0.12, y: 0.78 }, facing: 1 },
      ],
    },
    {
      background: 'city', textOverlay: 'CLEAN GETAWAY', effects: ['zoom', 'fade'],
      narration: `By sunrise, the crew vanished into the neon city with the prize. Nobody ever caught them.`,
      characters: [
        { id: 'hero', action: 'celebrate', emotion: 'happy', position: { x: 0.38, y: 0.80 }, facing: 1 },
        { id: 'hacker', action: 'laugh', emotion: 'happy', position: { x: 0.62, y: 0.80 }, facing: -1 },
      ],
    },
  ];
  const selected = selectScenesForCount(beats, count, rng, extractSubject(req.topic));
  const opened = remixOpening(selected, rng, extractSubject(req.topic), leader);
  return {
    title: req.title || pick(['The Midnight Vault Job', 'Zero Trace Heist', 'Red Laser Escape'], rng),
    tone: 'action',
    characters,
    scenes: opened.map((s) => ({ ...s, duration: req.duration / opened.length, narration: req.narration ? s.narration : '' })),
  };
}

function buildDynamicStory(req, rng, count) {
  const subject = extractSubject(req.topic);
  const inferred = inferStoryMeta(req.topic);
  const tone = req.autoTone === true ? inferred.tone : (req.tone || inferred.tone);
  const castCount = req.autoCharacters === true ? inferred.characterCount : (req.characterCount || inferred.characterCount);
  const seedStr = `${req.topic}:${req.seed || ''}`;

  const heroName = pick(HERO_NAMES, rng);
  const friendName = pick(FRIEND_NAMES, rng);
  const roleNames = [heroName, friendName, 'Rival', 'Boss', 'Stranger', 'Backup'];
  const roles = ['protagonist', 'best friend', 'rival', 'challenger', 'bystander', 'ally'];

  const characters = Array.from({ length: Math.max(2, Math.min(6, castCount)) }, (_, i) => ({
    id: i === 0 ? 'hero' : `char${i + 1}`,
    name: roleNames[i] || `Stick ${i + 1}`,
    role: roles[i] || 'supporting',
    color: CHARACTER_COLORS[i % CHARACTER_COLORS.length],
    isZombie: false,
    drip: defaultDripFor(i === 0 ? 'hero' : `char${i + 1}`, roles[i], i, `${seedStr}:${i}`),
  }));

  const fId = characters[1]?.id || 'hero';
  const rId = characters[2]?.id || fId;

  const scenariosByTone = {
    scary: [
      {
        background: 'bedroom', textOverlay: '2:47 AM', effects: ['night'],
        narration: `${heroName} was dead asleep when a strange noise downstairs broke the silence.`,
        characters: [{ id: 'hero', action: 'sleep', emotion: 'neutral', position: { x: 0.25, y: 0.72 }, facing: 1 }],
      },
      {
        background: 'bedroom', textOverlay: 'SOMETHING WOKE HIM', effects: ['shake', 'float_text'],
        narration: `His eyes snapped open. The floorboards outside his bedroom door were creaking.`,
        characters: [{ id: 'hero', action: 'wake_up', emotion: 'scared', position: { x: 0.34, y: 0.82 }, facing: 1 }],
      },
      {
        background: 'bedroom', textOverlay: 'STRANGE BROADCAST', effects: ['tv_glow'],
        narration: `The TV turned itself on in a burst of static, flashing a single warning: do not make a sound.`,
        characters: [{ id: 'hero', action: 'watch_tv', emotion: 'scared', position: { x: 0.45, y: 0.82 }, facing: 1 }],
      },
      {
        background: 'bedroom', textOverlay: 'OUTSIDE THE GLASS', effects: ['zoom'],
        narration: `He peeked through the bedroom window and saw dark figures standing motionless under the streetlamp.`,
        characters: [{ id: 'hero', action: 'look_window', emotion: 'scared', position: { x: 0.56, y: 0.81 }, facing: 1 }],
      },
      {
        background: 'street', textOverlay: 'THE CHASE', effects: ['speed_lines', 'rain'],
        narration: `One of them looked straight up at him and bolted toward the front door! ${heroName} ran for his life!`,
        characters: [
          { id: 'hero', action: 'run', emotion: 'scared', position: { x: 0.38, y: 0.82 }, targetX: 0.84, facing: 1 },
          { id: fId, action: 'run', emotion: 'angry', position: { x: 0.12, y: 0.82 }, targetX: 0.56, facing: 1 },
        ],
      },
      {
        background: 'horror', textOverlay: 'NO ESCAPE?', effects: ['alarm_flash', 'fade'],
        narration: `${heroName} ducked into the shadows as footsteps echoed past. Then his phone rang in the dark.`,
        characters: [
          { id: 'hero', action: 'hide', emotion: 'scared', position: { x: 0.28, y: 0.82 }, facing: 1 },
          { id: fId, action: 'look_left', emotion: 'angry', position: { x: 0.72, y: 0.82 }, facing: -1 },
        ],
      },
    ],
    funny: [
      {
        background: 'bedroom', textOverlay: 'OVERSLEPT!', effects: ['float_text'],
        narration: `${heroName} was supposed to be ready an hour ago, but he was still snoring in bed.`,
        characters: [{ id: 'hero', action: 'sleep', emotion: 'neutral', position: { x: 0.24, y: 0.72 }, facing: 1 }],
      },
      {
        background: 'bedroom', textOverlay: 'PURE PANIC', effects: ['shake', 'float_text'],
        narration: `He checked the clock, realized what time it was, and launched out of bed in total panic!`,
        characters: [{ id: 'hero', action: 'wake_up', emotion: 'surprised', position: { x: 0.35, y: 0.82 }, facing: 1 }],
      },
      {
        background: 'street', textOverlay: 'FULL SPRINT', effects: ['speed_lines', 'dust'],
        narration: `Throwing on his freshest drip, ${heroName} sprinted down the block like an Olympic track star.`,
        characters: [
          { id: 'hero', action: 'run', emotion: 'determined', position: { x: 0.15, y: 0.82 }, targetX: 0.78, facing: 1 },
          { id: fId, action: 'surprised', emotion: 'surprised', position: { x: 0.82, y: 0.82 }, facing: -1 },
        ],
      },
      {
        background: 'school', textOverlay: 'CAUGHT ON THE SPOT', effects: ['impact_flash'],
        narration: `He slid through the door trying to act smooth, right as everyone turned and stared at him.`,
        characters: [
          { id: 'hero', action: 'wave', emotion: 'happy', position: { x: 0.28, y: 0.82 }, facing: 1 },
          { id: fId, action: 'point', emotion: 'surprised', position: { x: 0.62, y: 0.82 }, facing: -1 },
          { id: rId, action: 'laugh', emotion: 'happy', position: { x: 0.82, y: 0.82 }, facing: -1 },
        ],
      },
      {
        background: 'school', textOverlay: 'EPIC FAIL', effects: ['shake'],
        narration: `He tried to explain himself with a wild story about ${subject}, then tripped over his own shoes!`,
        characters: [
          { id: 'hero', action: 'fall', emotion: 'surprised', position: { x: 0.42, y: 0.82 }, facing: 1 },
          { id: fId, action: 'laugh', emotion: 'happy', position: { x: 0.72, y: 0.82 }, facing: -1 },
        ],
      },
      {
        background: 'street', textOverlay: 'LEGENDARY RECOVERY', effects: ['zoom', 'fade'],
        narration: `Somehow he played it off like a boss and walked away victorious. Tag a friend who does this!`,
        characters: [
          { id: 'hero', action: 'celebrate', emotion: 'happy', position: { x: 0.40, y: 0.82 }, facing: 1 },
          { id: fId, action: 'celebrate', emotion: 'happy', position: { x: 0.66, y: 0.82 }, facing: -1 },
        ],
      },
    ],
    action: [
      {
        background: 'city', textOverlay: 'THE STANDOFF', effects: ['night', 'rain'],
        narration: `Under the neon city lights, ${heroName} stepped out alone when ${subject} turned into a trap.`,
        characters: [
          { id: 'hero', action: 'stand', emotion: 'determined', position: { x: 0.25, y: 0.82 }, facing: 1 },
          { id: fId, action: 'point', emotion: 'angry', position: { x: 0.72, y: 0.82 }, facing: -1 },
          { id: rId, action: 'walk', emotion: 'angry', position: { x: 0.88, y: 0.82 }, targetX: 0.62, facing: -1 },
        ],
      },
      {
        background: 'street', textOverlay: 'AMBUSH!', effects: ['speed_lines', 'impact_flash'],
        narration: `Two rivals charged at once! ${heroName} ducked the first swing and countered in a flash!`,
        characters: [
          { id: 'hero', action: 'dodge', emotion: 'determined', position: { x: 0.40, y: 0.82 }, facing: 1 },
          { id: fId, action: 'fight', emotion: 'angry', position: { x: 0.58, y: 0.82 }, facing: -1 },
        ],
      },
      {
        background: 'battlefield', textOverlay: 'ALL-OUT CLASH', effects: ['shake', 'speed_lines', 'dust'],
        narration: `Sparks flew across the pavement as ${heroName} unleashed a relentless combo against the crew!`,
        characters: [
          { id: 'hero', action: 'fight', emotion: 'determined', position: { x: 0.44, y: 0.82 }, facing: 1 },
          { id: fId, action: 'fight', emotion: 'angry', position: { x: 0.60, y: 0.82 }, facing: -1 },
          { id: rId, action: 'fall', emotion: 'scared', position: { x: 0.78, y: 0.82 }, facing: -1 },
        ],
      },
      {
        background: 'rooftop', textOverlay: 'FINAL STRIKE', effects: ['explosion', 'shake'],
        narration: `Taking the fight to the rooftop, ${heroName} leaped high into the air for one decisive strike!`,
        characters: [
          { id: 'hero', action: 'jump', emotion: 'determined', position: { x: 0.35, y: 0.78 }, targetX: 0.60, facing: 1 },
          { id: fId, action: 'defeated', emotion: 'sad', position: { x: 0.68, y: 0.78 }, facing: -1 },
        ],
      },
      {
        background: 'rooftop', textOverlay: 'UNDEFEATED', effects: ['zoom', 'fade'],
        narration: `When the dust cleared, only ${heroName} was left standing over the skyline.`,
        characters: [
          { id: 'hero', action: 'celebrate', emotion: 'determined', position: { x: 0.42, y: 0.78 }, facing: 1 },
          { id: fId, action: 'defeated', emotion: 'sad', position: { x: 0.72, y: 0.78 }, facing: -1 },
        ],
      },
    ],
    educational: [
      {
        background: 'school', textOverlay: 'THE BIG QUESTION', effects: ['zoom'],
        narration: `${heroName} thought they understood ${subject}, until one simple question changed the whole lesson.`,
        characters: [{ id: 'hero', action: 'think', emotion: 'confused', position: { x: 0.35, y: 0.82 }, facing: 1 }],
      },
      {
        background: 'lab', textOverlay: 'TEST ONE', effects: ['tv_glow'],
        narration: `A quick experiment gave ${heroName} an answer, but it raised an even bigger question about ${subject}.`,
        characters: [{ id: 'hero', action: 'point', emotion: 'determined', position: { x: 0.32, y: 0.82 }, facing: 1 }, { id: fId, action: 'think', emotion: 'confused', position: { x: 0.68, y: 0.82 }, facing: -1 }],
      },
      {
        background: 'office', textOverlay: 'LOOK CLOSER', effects: ['zoom', 'float_text'],
        narration: `The first result looked obvious. Then ${heroName} checked the evidence behind it.`,
        characters: [{ id: 'hero', action: 'look_window', emotion: 'confused', position: { x: 0.5, y: 0.82 }, facing: 1 }],
      },
      {
        background: 'lab', textOverlay: 'THE BREAKTHROUGH', effects: ['impact_flash'],
        narration: `One missing detail connected the clues and made ${subject} finally click.`,
        characters: [{ id: 'hero', action: 'wake_up', emotion: 'surprised', position: { x: 0.38, y: 0.82 }, facing: 1 }, { id: fId, action: 'celebrate', emotion: 'happy', position: { x: 0.68, y: 0.82 }, facing: -1 }],
      },
      {
        background: 'school', textOverlay: 'PASS IT ON', effects: ['zoom', 'fade'],
        narration: `Now ${heroName} could explain ${subject} clearly—and show why the small details matter.`,
        characters: [{ id: 'hero', action: 'talk', emotion: 'happy', position: { x: 0.4, y: 0.82 }, facing: 1 }],
      },
    ],
    motivational: [
      {
        background: 'bedroom', textOverlay: 'DAY ONE', effects: ['night'],
        narration: `${heroName} kept putting off one goal. Tonight, ${subject} became the reason to finally begin.`,
        characters: [{ id: 'hero', action: 'phone_scroll', emotion: 'sad', position: { x: 0.4, y: 0.82 }, facing: 1 }],
      },
      {
        background: 'street', textOverlay: 'FIRST STEP', effects: ['rain', 'motion_lines'],
        narration: `The first attempt went badly. ${heroName} wanted to quit before anyone noticed.`,
        characters: [{ id: 'hero', action: 'fall', emotion: 'sad', position: { x: 0.35, y: 0.82 }, facing: 1 }],
      },
      {
        background: 'school', textOverlay: 'SHOW UP AGAIN', effects: ['day'],
        narration: `But ${subject} mattered more than looking perfect, so ${heroName} showed up again the next day.`,
        characters: [{ id: 'hero', action: 'wake_up', emotion: 'determined', position: { x: 0.35, y: 0.82 }, facing: 1 }],
      },
      {
        background: 'battlefield', textOverlay: 'THE GRIND', effects: ['motion_lines', 'dust'],
        narration: `Small wins stacked into real progress. Each setback taught ${heroName} a better move.`,
        characters: [{ id: 'hero', action: 'run', emotion: 'determined', position: { x: 0.18, y: 0.82 }, targetX: 0.82, facing: 1 }],
      },
      {
        background: 'rooftop', textOverlay: 'THE PAYOFF', effects: ['day', 'zoom', 'fade'],
        narration: `${heroName} reached the goal—not because it was easy, but because quitting stopped being the plan.`,
        characters: [{ id: 'hero', action: 'celebrate', emotion: 'happy', position: { x: 0.44, y: 0.78 }, facing: 1 }, { id: fId, action: 'celebrate', emotion: 'happy', position: { x: 0.7, y: 0.78 }, facing: -1 }],
      },
    ],
    dramatic: [
      {
        background: 'bedroom', textOverlay: 'LATE NIGHT', effects: ['night', 'rain'],
        narration: `At 2 AM, ${heroName} stared at his phone, knowing everything about ${subject} was about to change.`,
        characters: [{ id: 'hero', action: 'phone_scroll', emotion: 'sad', position: { x: 0.42, y: 0.82 }, facing: 1 }],
      },
      {
        background: 'street', textOverlay: 'THE WALK', effects: ['rain'],
        narration: `He walked out into the pouring rain to face ${friendName} before it was too late.`,
        characters: [
          { id: 'hero', action: 'walk', emotion: 'determined', position: { x: 0.16, y: 0.82 }, targetX: 0.52, facing: 1 },
          { id: fId, action: 'stand', emotion: 'neutral', position: { x: 0.76, y: 0.82 }, facing: -1 },
        ],
      },
      {
        background: 'street', textOverlay: 'THE TRUTH', effects: ['impact_flash', 'zoom'],
        narration: `Under the streetlight, ${friendName} revealed the truth nobody else dared to say out loud.`,
        characters: [
          { id: 'hero', action: 'surprised', emotion: 'surprised', position: { x: 0.36, y: 0.82 }, facing: 1 },
          { id: fId, action: 'talk', emotion: 'sad', position: { x: 0.66, y: 0.82 }, facing: -1 },
        ],
      },
      {
        background: 'city', textOverlay: 'WALKING AWAY', effects: ['rain'],
        narration: `Words turned into a heated argument, and ${heroName} had to make the hardest choice of his life.`,
        characters: [
          { id: 'hero', action: 'talk', emotion: 'angry', position: { x: 0.38, y: 0.80 }, facing: 1 },
          { id: fId, action: 'cry', emotion: 'sad', position: { x: 0.66, y: 0.80 }, facing: -1 },
        ],
      },
      {
        background: 'rooftop', textOverlay: 'A NEW CHAPTER', effects: ['zoom', 'fade'],
        narration: `Watching the city lights from the roof, ${heroName} realized some endings are really new beginnings.`,
        characters: [
          { id: 'hero', action: 'look_right', emotion: 'determined', position: { x: 0.48, y: 0.78 }, facing: 1 },
        ],
      },
    ],
  };

  const chosenArc = scenariosByTone[tone] || scenariosByTone.dramatic;
  const selected = selectScenesForCount(chosenArc, count, rng, subject);
  const opened = remixOpening(selected, rng, subject, heroName);

  const titlePrefix = {
    scary: 'The Night It Changed:',
    action: 'Zero Mercy:',
    funny: 'When Everything Went Wrong:',
    dramatic: 'The Untold Story:',
    motivational: 'Against All Odds:',
    educational: 'Inside:',
  }[tone] || 'Story:';

  return {
    title: req.title || `${titlePrefix} ${subject.charAt(0).toUpperCase() + subject.slice(1)}`.slice(0, 75),
    tone,
    characters,
    scenes: opened.map((s) => ({
      ...s,
      duration: req.duration / opened.length,
      narration: req.narration ? s.narration : '',
    })),
  };
}

function selectScenesForCount(beats, count, rng = Math.random, subject = 'the plan') {
  if (beats.length === count) return [...beats];
  if (count < beats.length) {
    // Always retain both hook and ending while prioritizing plot beats in the middle.
    if (count <= 2) return [beats[0], beats[beats.length - 1]].slice(0, count);
    const interior = beats.slice(1, -1);
    const slots = count - 2;
    const out = [beats[0]];
    for (let i = 0; i < slots; i++) {
      const idx = Math.round((i * (interior.length - 1)) / Math.max(1, slots - 1));
      out.push(interior[idx]);
    }
    out.push(beats[beats.length - 1]);
    return out;
  }
  // Longer cuts need new story beats, not repeated copies of the same shot.
  const extraBeats = [
    { background: 'office', textOverlay: 'THE CLUE', effects: ['zoom'], action: 'think', emotion: 'confused', narration: `A detail about ${subject} did not add up, and the first plan began to unravel.` },
    { background: 'street', textOverlay: 'PLAN B', effects: ['motion_lines', 'dust'], action: 'sneak', emotion: 'determined', narration: `With the easy route gone, a riskier move was the only way forward.` },
    { background: 'city', textOverlay: 'TRUST NO ONE', effects: ['night', 'vignette'], action: 'look_left', emotion: 'scared', narration: `An unexpected discovery changed who could be trusted.` },
    { background: 'forest', textOverlay: 'THE SETBACK', effects: ['rain', 'shake'], action: 'fall', emotion: 'surprised', narration: `Just when success seemed close, one mistake raised the stakes again.` },
    { background: 'battlefield', textOverlay: 'LAST CHANCE', effects: ['speed_lines', 'impact_flash'], action: 'run', emotion: 'determined', narration: `There was no time left to wait. The final attempt began.` },
    { background: 'rooftop', textOverlay: 'THE CHOICE', effects: ['zoom', 'night'], action: 'point', emotion: 'determined', narration: `One hard choice separated the lead from the ending they wanted.` },
    { background: 'city', textOverlay: 'AFTERMATH', effects: ['fade'], action: 'look_right', emotion: 'sad', narration: `After everything, the consequences of ${subject} were only beginning.` },
  ];
  const out = [...beats];
  let insertIdx = 1;
  let extraIndex = 0;
  const requiredExtras = count - beats.length;
  while (out.length < count) {
    const base = beats[Math.min(beats.length - 2, Math.floor((extraIndex + 1) * (beats.length - 1) / (requiredExtras + 1)))];
    const extra = extraBeats[extraIndex % extraBeats.length];
    const lead = base.characters?.[0];
    const characters = lead ? [{
      ...lead,
      action: extra.action,
      emotion: extra.emotion,
      position: { x: 0.25 + ((extraIndex * 0.19) % 0.5), y: 0.81 },
      facing: extraIndex % 2 ? -1 : 1,
      ...(extra.action === 'run' ? { targetX: extraIndex % 2 ? 0.18 : 0.82 } : { targetX: undefined }),
    }, ...(base.characters || []).slice(1)] : (base.characters || []);
    out.splice(insertIdx, 0, { ...extra, characters });
    insertIdx += 2;
    extraIndex++;
  }
  return out;
}

/** Build a raw (un-normalized) project from a validated request. */
export function templateProject(req) {
  const rng = makeRng(req.seed || Date.now());
  const count = sceneCountFor(req.duration);
  const t = String(req.topic || '').toLowerCase();

  let built;
  if (/zombie|virus|outbreak|apocalyp|infect|undead|walker/i.test(t)) {
    built = buildZombieStory(req, rng, count);
  } else if (/heist|robbery|bank|vault|steal|thief|agent|spy/i.test(t)) {
    built = buildHeistStory(req, rng, count);
  } else {
    built = buildDynamicStory(req, rng, count);
  }

  const finalTone = req.autoTone === true ? built.tone : (req.tone || built.tone);

  return {
    title: built.title,
    topic: req.topic,
    language: req.language || 'English',
    duration: req.duration,
    aspectRatio: req.aspectRatio || '9:16',
    tone: finalTone,
    style: req.style || 'classic',
    narration: req.narration !== false,
    subtitles: { enabled: req.subtitles !== false },
    characters: built.characters,
    scenes: applyTopicSetting(built.scenes, req.topic),
    seed: req.seed,
  };
}
