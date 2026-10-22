// Built-in story writer — the studio's no-model, no-key fallback.
//
// It reads the prompt, works out what kind of story it is (war, outbreak, heist,
// horror, or a personal challenge) and writes a connected storyboard: a normal
// opening, a thing that goes wrong, an escalation, a twist and a payoff. Every
// line is its own sentence and every scene is a different event, so a storyboard
// renders, narrates and edits even on a deployment with no language model.
import { sceneCountFor } from '../../shared/schema.js';
import { CHARACTER_COLORS } from '../../shared/constants.js';

/* ------------------------------------------------------------------ text ---- */

const clean = (text) => String(text || '').replace(/\s+/g, ' ').trim();
const cap = (word) => (word ? word[0].toUpperCase() + word.slice(1) : word);
const countWords = (text) => clean(text).split(' ').filter(Boolean).length;
const plural = (flag, one, many) => (flag ? many : one);

/** Strip command wrappers ("make a 30 second video about ...") from the idea. */
export function ideaText(raw) {
  let s = clean(raw);
  for (let i = 0; i < 2; i++) {
    s = s.replace(/^(please\s+)?(make|create|write|generate|build|animate|show|give me|do)\b[\s\S]*?\b(about|of|where|showing|with)\s+/i, '');
    s = s.replace(/^(a|an|the)?\s*(\d+\s*[- ]?)?(second|sec|minute|min)?\s*(stick\s*[- ]?figure|stickman|animated|animation|video|story|movie|clip|short)\s+(about|of|where|showing)?\s*/i, '');
  }
  return s.replace(/[.!?]+$/, '').trim();
}

// Words that describe the format or the request, never a person or a plot.
const FORMAT = new Set(('story stories video videos short shorts clip clips animation animated animate ' +
  'stick stickman figure figures faceless tale movie reel episode part seconds second sec minute min ' +
  'funny scary dramatic educational motivational action epic cool random realistic viral please about ' +
  'where showing make create write generate build give show').split(' '));

const STOP = new Set(('a an the and or but of to in on at for with from by into over under about who that which is are was were be ' +
  'during after before when while his her their its my your our this these those it he she they we you i as so then than ' +
  'very really just up down out off again more most some any all one three new old small big young little every each another ' +
  'while there here what where why how can will would could should do does did has have had').split(' '));

// People and roles people actually put in prompts, so "a guy in a house" is
// named after the guy and not after the house.
const AGENTS = new Set(('guy guys man men dude bro person boy girl kid kids child friend friends mate bud neighbor neighbour ' +
  'keeper cat dog puppy kitten robot astronaut chef botanist violinist detective teacher student hero heroine dragon knight ' +
  'thief alien scientist pilot doctor farmer artist musician traveler explorer ninja pirate wizard witch ' +
  'bear fox bird fish horse lion wolf princess prince king queen soldier survivor firefighter nurse baker painter dancer singer ' +
  'writer gamer athlete coach captain crew team brothers sisters family couple gardener mechanic engineer diver sailor ' +
  'fisherman hunter ranger scout roommate dad mom father mother husband wife son daughter').split(' '));

const VERBS = new Set(('learns learn builds build repairs repair befriends befriend escapes escape fights fight finds find opens open ' +
  'cooks cook bakes bake flies fly explores explore saves save tries try travels travel crosses cross solves solve hunts hunt ' +
  'follows follow breaks break wins win loses lose starts start makes make draws draw paints paint plays play sings sing ' +
  'dances dance searches search protects protect hides hide discovers discover challenges challenge survives survive plants ' +
  'plant cleans clean fixes fix steals steal chases chase rescues rescue trains train delivers deliver writes write reads read ' +
  'grows grow catches catch digs dig sails sail drives drive climbs climb races race performs perform invents invent plans plan ' +
  'wants want needs need dreams dream hopes hope misses miss loves love fears fear leaves leave joins join quits quit').split(' '));

const GENRES = [
  { id: 'war', re: /\b(war|warfare|invasion|invaded|air[- ]?raid|siren|sirens|missile|missiles|bombing|bombed|army|soldier|soldiers|draft|frontline|front line|battle|combat|nuke|nuclear|military|enemy)\b/i },
  { id: 'outbreak', re: /\b(zombie|zombies|outbreak|virus|infection|infected|undead|apocalypse|apocalyptic|walker|walkers|plague|contagion)\b/i },
  { id: 'heist', re: /\b(heist|robbery|robber|rob|bank|vault|steal|thief|thieves|spy|agent|prison|jailbreak|getaway)\b/i },
  { id: 'horror', re: /\b(ghost|haunted|horror|monster|demon|nightmare|creepy|stalker|midnight|3\s?am|2\s?am)\b/i },
];

const PLACES = [
  [/\b(desert|sand|dune|sahara)\b/, 'desert', 'in the desert'],
  [/\b(forest|woods|jungle|camp|trees)\b/, 'forest', 'in the forest'],
  [/\b(school|classroom|college|campus|university|exam|class)\b/, 'school', 'at school'],
  [/\b(office|workplace|company|corporate|meeting|job|desk)\b/, 'office', 'at the office'],
  [/\b(city|downtown|town|street|road|alley|subway|traffic|bridge)\b/, 'street', 'across the city'],
  [/\b(battlefield|trench|ruins)\b/, 'battlefield', 'on the battlefield'],
  [/\b(graveyard|cemetery|haunted|crypt)\b/, 'horror', 'in the dark'],
  [/\b(mountain|meadow|field|hills|countryside|valley|garden|farm)\b/, 'landscape', 'out in the open'],
  [/\b(rooftop|roof|skyscraper|tower|lighthouse|cliff|storm|sea|ocean|beach|boat|ship|river|rain)\b/, 'rooftop', 'in the open weather'],
  [/\b(bunker|basement|cellar|shelter|underground)\b/, 'bunker', 'underground'],
  [/\b(lab|laboratory|hospital|clinic|experiment|space|moon|rocket|planet|orbit|star|mars|galaxy)\b/, 'lab', 'among the machines'],
  [/\b(bedroom|home|house|apartment|kitchen|couch|sofa|tv|pasta|food|bake|bakery|bread|recipe|cafe)\b/, 'bedroom', 'at home'],
];

// A dirty prop and a bad break for each set, so a personal-goal story happens
// somewhere instead of floating in abstractions.
const SET_PROPS = {
  bedroom: { prop: 'the kitchen tap', break: 'the tap snaps off' },
  office: { prop: 'the office printer', break: 'the printer jams for good' },
  school: { prop: 'the classroom clock', break: 'the clock dies' },
  street: { prop: 'the bus door', break: 'the bus pulls away' },
  city: { prop: 'the corner store', break: 'the store shuts early' },
  lab: { prop: 'the main machine', break: 'the machine starts smoking' },
  forest: { prop: 'the rope bridge', break: 'the bridge gives out' },
  desert: { prop: 'the water can', break: 'the water can splits' },
  landscape: { prop: 'the old shed door', break: 'the shed door falls off' },
  rooftop: { prop: 'the ladder', break: 'the ladder slips' },
  bunker: { prop: 'the generator', break: 'the generator dies' },
  battlefield: { prop: 'the radio', break: 'the radio goes dead' },
  horror: { prop: 'the hallway light', break: 'the bulb pops' },
  white: { prop: 'the table', break: 'the table leg snaps' },
  black: { prop: 'the switch', break: 'the switch sparks' },
};

const NAMES = ['Guy', 'Ray', 'Nate', 'Moe', 'Kai', 'Jay'];
const MATES = ['Milo', 'Sam', 'Toby', 'Rex', 'Finn', 'Dre'];

function makeRng(seed) {
  const text = String(seed || 'seed');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return () => {
    h ^= h << 13; h >>>= 0;
    h ^= h >>> 17;
    h ^= h << 5; h >>>= 0;
    return (h % 100000) / 100000;
  };
}

const pick = (list, rng) => list[Math.floor(rng() * list.length) % list.length];

/** "repairs" -> "repair", so a goal reads "to repair ..." instead of "to repairs ...". */
function baseVerb(word) {
  const special = { goes: 'go', does: 'do', has: 'have', flies: 'fly', tries: 'try', carries: 'carry', studies: 'study', buys: 'buy', says: 'say', pays: 'pay' };
  if (special[word]) return special[word];
  if (/(ches|shes|sses|xes|zes)$/.test(word)) return word.slice(0, -2);
  if (/ies$/.test(word)) return `${word.slice(0, -3)}y`;
  if (/s$/.test(word) && !/ss$/.test(word)) return word.slice(0, -1);
  return word;
}

/** Actor, goal, setting and genre named by the prompt. */
export function readPremise(topic) {
  const idea = ideaText(topic) || 'one unexpected night';
  const lower = idea.toLowerCase();
  const raw = lower.split(/[^a-z0-9'’-]+/).filter(Boolean);
  const content = raw.filter((w) => w.length > 1 && !STOP.has(w) && !FORMAT.has(w) && !VERBS.has(w));

  const genre = GENRES.find((g) => g.re.test(lower))?.id || 'everyday';
  const agent = content.find((w) => AGENTS.has(w)) || '';
  const isPlural = /\b(two|three|four|five|several|many|friends|kids|brothers|sisters|siblings|family|couple|team|crew|group)\b/.test(lower);
  const verbIndex = raw.findIndex((w) => VERBS.has(w));
  const goalPhrase = verbIndex >= 0
    ? `to ${[baseVerb(raw[verbIndex]), ...raw.slice(verbIndex + 1)].join(' ')}`
    : '';
  const setting = PLACES.find(([re]) => re.test(lower)) || [null, isPlural ? 'street' : 'landscape', isPlural ? 'across the city' : 'out in the open'];

  return {
    idea,
    genre,
    agent,
    isPlural,
    goalPhrase,
    goalLabel: verbIndex >= 0 ? cap(raw.slice(verbIndex).join(' ')) : '',
    name: agent ? cap(agent) : '',
    background: setting[1],
    place: setting[2],
  };
}

/* ------------------------------------------------------------------ arcs ---- */

const setup = (premise, req) => {
  const rng = makeRng(`${req.seed}|${req.topic}|${req.duration}`);
  const name = premise.name || pick(NAMES, rng);
  return { premise, rng, hero: name, mate: pick(MATES, rng) };
};

function warArc(premise, req) {
  const { rng, hero } = setup(premise, req);
  const neighbor = pick(MATES, rng);
  const cast = [
    { id: 'lead', name: hero, role: 'protagonist', color: CHARACTER_COLORS[0] },
    { id: 'mate', name: neighbor, role: 'neighbor', color: CHARACTER_COLORS[1] },
  ];
  const beats = [
    {
      purpose: 'A normal night', background: 'bedroom', overlay: '11:48 PM', effects: ['night', 'tv_glow'],
      action: `${hero} is stretched out on the couch with a phone in one hand and snacks in the other.`,
      cam: 'wide', motion: 'static',
      lines: [
        'Quiet night. He was on the couch, three snacks deep.',
        'Nothing was happening. Just him, the couch, and snacks.',
        'Normal night: couch, phone, and a bowl he was not sharing.',
      ],
      actors: [{ id: 'lead', action: 'watch_tv', emotion: 'happy', x: 0.44 }],
    },
    {
      purpose: 'The sirens start', background: 'bedroom', overlay: 'AIR RAID SIRENS', effects: ['alarm_flash', 'shake'],
      action: `${hero} bolts upright as red light pulses through the blinds and the whole room shakes.`,
      cam: 'medium', motion: 'push_in',
      lines: [
        'Then the air-raid siren screamed and the windows rattled.',
        'Sirens. Not one. All of them. The whole room went red.',
        'The alert siren tore through the street and rattled the glass.',
      ],
      actors: [{ id: 'lead', action: 'wake_up', emotion: 'surprised', x: 0.36 }],
    },
    {
      purpose: 'The phone warning', background: 'bedroom', overlay: 'WAR DECLARED', effects: ['alarm_flash', 'float_text'],
      action: `${hero} grabs his phone. A red emergency alert fills the screen and he reads it twice.`,
      cam: 'close', motion: 'push_in',
      lines: [
        'His phone lit up: WAR DECLARED. STAY INSIDE. DO NOT PANIC.',
        'A red alert filled his screen: the war had officially started.',
        'One message on his phone: war. stay inside. do not panic.',
      ],
      actors: [{ id: 'lead', action: 'phone_scroll', emotion: 'scared', x: 0.42 }],
    },
    {
      purpose: 'Panic packing', background: 'bedroom', overlay: 'PACKING', effects: ['shake', 'motion_lines'],
      action: `${hero} runs in a circle, then shoves random things into a bag.`,
      cam: 'medium', motion: 'pan_right',
      lines: [
        'He panicked anyway. He packed snacks, socks, and one charger.',
        'He grabbed a bag: socks, snacks, and exactly one phone charger.',
        'Panic mode. He stuffed a bag with snacks and pure vibes.',
      ],
      actors: [{ id: 'lead', action: 'panic', emotion: 'scared', x: 0.5 }],
    },
    {
      purpose: 'The street outside', background: 'street', overlay: 'EVERYONE OUTSIDE', effects: ['speed_lines', 'alarm_flash'],
      action: `The whole street is out in pajamas and slippers, running the same direction.`,
      cam: 'wide', motion: 'pan_left',
      lines: [
        'Outside, the whole street was running in their slippers.',
        'The block flooded out in pajamas, sprinting for the shelter.',
        'Half the neighborhood was outside, arguing about which way to run.',
      ],
      actors: [
        { id: 'lead', action: 'run', emotion: 'scared', x: 0.3 },
        { id: 'mate', action: 'run', emotion: 'surprised', x: 0.62, facing: 1 },
      ],
    },
    {
      purpose: 'The shelter', background: 'bunker', overlay: 'SHELTER', effects: ['shake', 'night'],
      action: `${hero} dives through the shelter door and struggles with the lock.`,
      cam: 'medium', motion: 'push_in',
      lines: [
        'He dove into the basement shelter and locked the door.',
        'He made it underground and bolted the door behind him.',
        'Down in the shelter, he barricaded the door with a chair.',
      ],
      actors: [{ id: 'lead', action: 'barricade', emotion: 'determined', x: 0.46 }],
    },
    {
      purpose: 'The twist', background: 'bunker', overlay: 'MOM: CALL ME', effects: ['tv_glow'],
      action: `${hero} checks his phone again and his face drops in a very different way.`,
      cam: 'close', motion: 'static',
      lines: [
        'Then his mom texted: it was just a drill, honey.',
        'His phone buzzed. Mom: that was a drill. Did you panic?',
        'One text from his mom: test drill, sweetie. You okay?',
      ],
      actors: [{ id: 'lead', action: 'phone_scroll', emotion: 'confused', x: 0.4 }],
    },
    {
      purpose: 'The payoff', background: 'bunker', overlay: 'SAFE. SORT OF.', effects: ['fade'],
      action: `${hero} sits on a crate of emergency crackers, opens the snacks and starts laughing.`,
      cam: 'wide', motion: 'static',
      lines: [
        'He sat on the emergency crackers and finished his snacks.',
        'He ate the snacks anyway, sitting on a bucket of crackers.',
        'War or no war, the snacks were not going to waste.',
      ],
      actors: [{ id: 'lead', action: 'laugh', emotion: 'happy', x: 0.44 }],
    },
  ];
  const extras = [
    {
      purpose: 'The neighbor arrives', background: 'bunker', overlay: 'NEIGHBOR', effects: ['shake'],
      action: `The neighbor knocks on the shelter door holding snacks and a charger.`,
      cam: 'medium', motion: 'static',
      lines: ['The neighbor knocked, holding chips and a spare charger.', 'The neighbor turned up with snacks and zero questions.'],
      actors: [
        { id: 'lead', action: 'surprised', emotion: 'surprised', x: 0.34 },
        { id: 'mate', action: 'wave', emotion: 'happy', x: 0.64, facing: -1 },
      ],
    },
    {
      purpose: 'The cat', background: 'bunker', overlay: 'THE CAT', effects: ['zoom'],
      action: `The cat crawls out of the bag, completely unbothered by the war.`,
      cam: 'medium', motion: 'static',
      lines: ['The cat was in his bag the whole time, unbothered.', 'The cat made it into the bag. He did not.'],
      actors: [{ id: 'lead', action: 'surprised', emotion: 'surprised', x: 0.4 }],
    },
    {
      purpose: 'The radio', background: 'bunker', overlay: 'STATIC', effects: ['tv_glow'],
      action: `A dusty radio crackles to life and says something calming.`,
      cam: 'close', motion: 'static',
      lines: ['The radio played static, then someone said to remain calm.', 'A voice on the radio said the army was handling it.'],
      actors: [{ id: 'lead', action: 'think', emotion: 'confused', x: 0.42 }],
    },
    {
      purpose: 'One small win', background: 'bunker', overlay: 'FLASHLIGHT', effects: ['impact_flash'],
      action: `The power dies, and ${hero}'s flashlight clicks on first try.`,
      cam: 'close', motion: 'push_in',
      lines: ['The power cut, and his flashlight clicked on first try.', 'One flashlight, no batteries wasted. He took the win.'],
      actors: [{ id: 'lead', action: 'point', emotion: 'determined', x: 0.46 }],
    },
  ];
  return { tone: 'funny', titles: ['The Night the Sirens Started', 'War Declared (Sort Of)', 'Just a Drill'], cast, beats, extras };
}

function outbreakArc(premise, req) {
  const { rng, hero } = setup(premise, req);
  const neighbor = pick(MATES, rng);
  const cast = [
    { id: 'lead', name: hero, role: 'survivor', color: CHARACTER_COLORS[0] },
    { id: 'mate', name: neighbor, role: 'neighbor', color: CHARACTER_COLORS[1] },
    { id: 'zombie', name: 'Infected', role: 'zombie', color: '#4ade80', isZombie: true },
  ];
  const beats = [
    {
      purpose: 'Late night', background: 'bedroom', overlay: '3:12 AM', effects: ['night'],
      action: `${hero} is dead asleep in a dark room.`,
      cam: 'wide', motion: 'static',
      lines: ['He was asleep when the city sirens started screaming.', 'Three in the morning, and the city alarm ripped him awake.'],
      actors: [{ id: 'lead', action: 'sleep', emotion: 'neutral', x: 0.3 }],
    },
    {
      purpose: 'The alarm', background: 'bedroom', overlay: 'EMERGENCY', effects: ['alarm_flash', 'shake'],
      action: `${hero} jolts upright as red light pulses across the room.`,
      cam: 'medium', motion: 'push_in',
      lines: ['He jolted upright. Red light was flashing through the blinds.', 'The room pulsed red as the siren kept going and going.'],
      actors: [{ id: 'lead', action: 'wake_up', emotion: 'surprised', x: 0.36 }],
    },
    {
      purpose: 'The broadcast', background: 'bedroom', overlay: 'BREAKING NEWS', effects: ['tv_glow', 'alarm_flash'],
      action: `The TV cuts to a panicked anchor reading an emergency notice.`,
      cam: 'close', motion: 'static',
      lines: ['The TV said the outbreak was spreading across the whole city.', 'A panicked anchor said to lock the doors and stay inside.'],
      actors: [{ id: 'lead', action: 'watch_tv', emotion: 'scared', x: 0.46 }],
    },
    {
      purpose: 'Outside the window', background: 'bedroom', overlay: 'OUTSIDE', effects: ['zoom'],
      action: `${hero} peels back the blinds and looks down at the road.`,
      cam: 'medium', motion: 'static',
      lines: ['He looked outside and saw people sprinting down the street.', 'Through the blinds, he watched his neighbors running in the dark.'],
      actors: [{ id: 'lead', action: 'look_window', emotion: 'scared', x: 0.56 }],
    },
    {
      purpose: 'The chase', background: 'street', overlay: 'THE OUTBREAK', effects: ['infection_spores', 'speed_lines'],
      action: `Green infected sprint after the neighbors under the streetlights.`,
      cam: 'wide', motion: 'pan_left',
      lines: ['Green zombies were chasing his neighbors down the road.', 'The infected swarmed the street, hunting anyone still outside.'],
      actors: [
        { id: 'zombie', action: 'zombie_chase', emotion: 'infected', x: 0.16, isZombie: true },
        { id: 'mate', action: 'run', emotion: 'scared', x: 0.48 },
      ],
    },
    {
      purpose: 'The bite', background: 'street', overlay: 'INFECTED', effects: ['infection_spores', 'impact_flash'],
      action: `One infected catches ${neighbor}, and green veins spread through him.`,
      cam: 'close', motion: 'push_in',
      lines: ['One caught his neighbor, and green veins spread fast.', 'The neighbor went down and came back up wrong.'],
      actors: [
        { id: 'zombie', action: 'infect', emotion: 'infected', x: 0.4, isZombie: true },
        { id: 'mate', action: 'turn_zombie', emotion: 'scared', x: 0.58, facing: -1 },
      ],
    },
    {
      purpose: 'Lockdown', background: 'bedroom', overlay: 'LOCKDOWN', effects: ['alarm_flash', 'shake'],
      action: `${hero} bolts the door and drags the couch in front of it.`,
      cam: 'medium', motion: 'static',
      lines: ['He bolted the door and nailed boards across the frame.', 'He shoved the couch against the door and held his breath.'],
      actors: [{ id: 'lead', action: 'barricade', emotion: 'determined', x: 0.48 }],
    },
    {
      purpose: 'The roof', background: 'rooftop', overlay: 'NIGHT ONE', effects: ['infection_spores', 'fade'],
      action: `${hero} stands on the roof while the horde fills the street below.`,
      cam: 'wide', motion: 'static',
      lines: ['On the roof, he watched the horde take the streets below.', 'The city glowed green under him. Night one had begun.'],
      actors: [
        { id: 'lead', action: 'stand', emotion: 'determined', x: 0.36 },
        { id: 'zombie', action: 'zombie_walk', emotion: 'infected', x: 0.76, facing: -1, isZombie: true },
      ],
    },
  ];
  const extras = [
    {
      purpose: 'The power dies', background: 'bedroom', overlay: 'NO POWER', effects: ['night', 'vignette'],
      action: `The lights cut out and the whole apartment goes black.`,
      cam: 'wide', motion: 'static',
      lines: ['The power cut, and the apartment went pitch black.', 'Every light in the building died at once.'],
      actors: [{ id: 'lead', action: 'scared', emotion: 'scared', x: 0.4 }],
    },
    {
      purpose: 'Phone dies', background: 'bedroom', overlay: '9%', effects: ['tv_glow'],
      action: `${hero} watches his phone drop to nine percent.`,
      cam: 'close', motion: 'static',
      lines: ['His phone died at nine percent, which felt personal.', 'Nine percent battery, and no charger anywhere.'],
      actors: [{ id: 'lead', action: 'phone_scroll', emotion: 'sad', x: 0.42 }],
    },
    {
      purpose: 'Scratching', background: 'bedroom', overlay: 'SCRATCHING', effects: ['shake'],
      action: `Something scratches at the door, slow and patient.`,
      cam: 'close', motion: 'push_in',
      lines: ['Something scratched at the door, slow and patient.', 'The scratching stopped. That was somehow worse.'],
      actors: [{ id: 'lead', action: 'hide', emotion: 'scared', x: 0.3 }],
    },
    {
      purpose: 'More of them', background: 'street', overlay: 'THE HORDE', effects: ['infection_spores', 'speed_lines'],
      action: `${hero} looks again and the street is packed with infected.`,
      cam: 'wide', motion: 'pan_right',
      lines: ['He looked again, and the horde had doubled.', 'The road was full of them, and more kept coming.'],
      actors: [
        { id: 'lead', action: 'run', emotion: 'scared', x: 0.24 },
        { id: 'zombie', action: 'zombie_walk', emotion: 'infected', x: 0.6, facing: -1, isZombie: true },
      ],
    },
  ];
  return { tone: 'scary', titles: ['The Night the City Turned', 'Do Not Open the Door', 'Night One'], cast, beats, extras };
}

function heistArc(premise, req) {
  const { rng, hero, mate } = setup(premise, req);
  const cast = [
    { id: 'lead', name: hero, role: 'mastermind', color: CHARACTER_COLORS[0] },
    { id: 'mate', name: mate, role: 'partner', color: CHARACTER_COLORS[1] },
    { id: 'guard', name: 'Security', role: 'guard', color: CHARACTER_COLORS[2] },
  ];
  const beats = [
    {
      purpose: 'The plan', background: 'bunker', overlay: 'THE PLAN', effects: ['night'],
      action: `Blueprints on the table, phones face down, one last run through the plan.`,
      cam: 'wide', motion: 'static',
      lines: ['Midnight. The plan was simple: get in, get rich, get out.', 'They went over the blueprints one last time at midnight.'],
      actors: [
        { id: 'lead', action: 'point', emotion: 'determined', x: 0.36 },
        { id: 'mate', action: 'think', emotion: 'neutral', x: 0.66, facing: -1 },
      ],
    },
    {
      purpose: 'Getting in', background: 'office', overlay: 'GETTING IN', effects: ['night'],
      action: `The pair slip past the empty front desk and into the elevator.`,
      cam: 'medium', motion: 'pan_right',
      lines: ['They slipped past the front desk without a single sound.', 'Two floors up, they crept past the sleeping security desk.'],
      actors: [
        { id: 'lead', action: 'sneak', emotion: 'determined', x: 0.24 },
        { id: 'mate', action: 'sneak', emotion: 'scared', x: 0.5 },
      ],
    },
    {
      purpose: 'The vault', background: 'lab', overlay: 'THE VAULT', effects: ['tv_glow'],
      action: `The vault door is already open, which is the first warning sign.`,
      cam: 'close', motion: 'push_in',
      lines: ['The vault was open. That was way too easy.', 'No guards, no locks. The vault was already open.'],
      actors: [{ id: 'lead', action: 'point', emotion: 'surprised', x: 0.44 }],
    },
    {
      purpose: 'The alarm', background: 'lab', overlay: 'ALARM', effects: ['alarm_flash', 'shake'],
      action: `A hidden sensor trips and the room floods red.`,
      cam: 'medium', motion: 'static',
      lines: ['Then a hidden sensor tripped and every alarm went off.', 'The lights turned red and the alarm started screaming.'],
      actors: [
        { id: 'lead', action: 'panic', emotion: 'surprised', x: 0.4 },
        { id: 'mate', action: 'panic', emotion: 'scared', x: 0.66, facing: -1 },
      ],
    },
    {
      purpose: 'The guards', background: 'office', overlay: 'GUARDS', effects: ['impact_flash', 'speed_lines'],
      action: `Security bursts through the doors and ${hero} fights his way out.`,
      cam: 'medium', motion: 'pan_left',
      lines: ['Guards burst in. He dodged one and shoved another into a plant.', 'Security rushed the door, and he fought his way through.'],
      actors: [
        { id: 'lead', action: 'fight', emotion: 'determined', x: 0.38 },
        { id: 'guard', action: 'fight', emotion: 'angry', x: 0.62, facing: -1 },
      ],
    },
    {
      purpose: 'The rooftop jump', background: 'rooftop', overlay: 'THE JUMP', effects: ['speed_lines', 'zoom'],
      action: `${hero} runs at the ledge and jumps to the next roof.`,
      cam: 'wide', motion: 'pan_right',
      lines: ['Cornered on the roof, he jumped the gap to the next building.', 'They ran the rooftop and jumped before anyone could stop them.'],
      actors: [
        { id: 'lead', action: 'jump', emotion: 'determined', x: 0.42 },
        { id: 'mate', action: 'run', emotion: 'scared', x: 0.2 },
      ],
    },
    {
      purpose: 'The split', background: 'city', overlay: 'THE MONEY', effects: ['zoom'],
      action: `Two bags open on a rooftop table, cash stacked between them.`,
      cam: 'medium', motion: 'static',
      lines: ['On the rooftop, they split the cash and shook hands.', 'They counted it twice, then split it down the middle.'],
      actors: [
        { id: 'lead', action: 'celebrate', emotion: 'happy', x: 0.38 },
        { id: 'mate', action: 'laugh', emotion: 'happy', x: 0.64, facing: -1 },
      ],
    },
    {
      purpose: 'The quiet part', background: 'city', overlay: 'GONE', effects: ['fade'],
      action: `The city wakes up to an empty vault and a lot of questions.`,
      cam: 'wide', motion: 'static',
      lines: ['By sunrise, they were gone and nobody had a name.', 'The city woke up richer in rumors and poorer in cash.'],
      actors: [{ id: 'lead', action: 'wave', emotion: 'happy', x: 0.44 }],
    },
  ];
  const extras = [
    {
      purpose: 'The camera', background: 'lab', overlay: 'SMILE', effects: ['impact_flash'],
      action: `A security camera swivels and looks straight at ${hero}.`,
      cam: 'close', motion: 'push_in',
      lines: ['A camera swivelled and looked straight at him.', 'One camera blinked red. He waved at it anyway.'],
      actors: [{ id: 'lead', action: 'wave', emotion: 'surprised', x: 0.44 }],
    },
    {
      purpose: 'The dog', background: 'office', overlay: 'THE DOG', effects: ['zoom'],
      action: `A guard dog wakes up and stares at them without barking.`,
      cam: 'medium', motion: 'static',
      lines: ['A guard dog woke up and just stared at them.', 'The dog watched them rob the place and did nothing.'],
      actors: [
        { id: 'lead', action: 'stand', emotion: 'surprised', x: 0.3 },
        { id: 'mate', action: 'hide', emotion: 'scared', x: 0.6, facing: -1 },
      ],
    },
    {
      purpose: 'The elevator', background: 'office', overlay: 'FLOOR 12', effects: ['float_text'],
      action: `The elevator stops one floor early and the doors open on nothing.`,
      cam: 'close', motion: 'static',
      lines: ['The elevator stopped a floor early. The doors opened on nothing.', 'The lift dinged, opened, and nobody was there.'],
      actors: [{ id: 'lead', action: 'surprised', emotion: 'confused', x: 0.42 }],
    },
    {
      purpose: 'The news', background: 'city', overlay: 'BREAKING', effects: ['tv_glow'],
      action: `A shop window television reports the robbery with a blurry photo.`,
      cam: 'medium', motion: 'static',
      lines: ['A shop TV reported the robbery with a very blurry photo.', 'The news called them professionals. They laughed at that.'],
      actors: [
        { id: 'lead', action: 'laugh', emotion: 'happy', x: 0.4 },
        { id: 'mate', action: 'celebrate', emotion: 'happy', x: 0.64, facing: -1 },
      ],
    },
  ];
  return { tone: 'action', titles: ['The Midnight Vault Job', 'Zero Trace', 'One Last Job'], cast, beats, extras };
}

function horrorArc(premise, req) {
  const { rng, hero } = setup(premise, req);
  const cast = [
    { id: 'lead', name: hero, role: 'protagonist', color: CHARACTER_COLORS[0] },
    { id: 'figure', name: 'The Figure', role: 'unknown', color: '#111827' },
  ];
  const beats = [
    {
      purpose: 'The noise', background: 'bedroom', overlay: '2:04 AM', effects: ['night'],
      action: `${hero} wakes in a dark bedroom and listens.`,
      cam: 'wide', motion: 'static',
      lines: ['At 2 AM, he woke to a noise downstairs.', 'Two in the morning, and something moved downstairs.'],
      actors: [{ id: 'lead', action: 'sleep', emotion: 'neutral', x: 0.34 }],
    },
    {
      purpose: 'The creak', background: 'bedroom', overlay: 'CREAK', effects: ['shake'],
      action: `${hero} sits up. The floorboards creak again, closer.`,
      cam: 'close', motion: 'push_in',
      lines: ['The floorboards creaked. Then they creaked again.', 'One creak. Then another one, much closer.'],
      actors: [{ id: 'lead', action: 'wake_up', emotion: 'scared', x: 0.36 }],
    },
    {
      purpose: 'The warning', background: 'bedroom', overlay: 'DO NOT OPEN THE DOOR', effects: ['tv_glow', 'alarm_flash'],
      action: `The TV switches itself on and shows one line of white text.`,
      cam: 'close', motion: 'static',
      lines: ['The TV turned on by itself: do not open the door.', 'Static on the TV, then one line: do not open the door.'],
      actors: [{ id: 'lead', action: 'watch_tv', emotion: 'scared', x: 0.46 }],
    },
    {
      purpose: 'The knock', background: 'bedroom', overlay: 'KNOCK KNOCK', effects: ['shake', 'float_text'],
      action: `Three knocks at the front door, then three more.`,
      cam: 'medium', motion: 'static',
      lines: ['Something knocked three times. Then it knocked again.', 'The front door knocked in threes. Nobody was outside.'],
      actors: [{ id: 'lead', action: 'hide', emotion: 'scared', x: 0.3 }],
    },
    {
      purpose: 'The hallway', background: 'horror', overlay: 'THE HALL', effects: ['vignette', 'zoom'],
      action: `A shape stands at the end of the hallway and does not move.`,
      cam: 'wide', motion: 'push_in',
      lines: ['A shape stood at the end of the hall, not moving.', 'Something tall waited in the hallway, perfectly still.'],
      actors: [
        { id: 'lead', action: 'stand', emotion: 'scared', x: 0.34 },
        { id: 'figure', action: 'stand', emotion: 'neutral', x: 0.72, facing: -1 },
      ],
    },
    {
      purpose: 'The run', background: 'street', overlay: 'RUN', effects: ['speed_lines', 'rain'],
      action: `${hero} runs out the back door and does not look back.`,
      cam: 'medium', motion: 'pan_left',
      lines: ['He ran out the back door and did not look back.', 'He ran until the house was small behind him.'],
      actors: [{ id: 'lead', action: 'run', emotion: 'scared', x: 0.3 }],
    },
    {
      purpose: 'Morning', background: 'street', overlay: 'MORNING', effects: ['day'],
      action: `Sunrise. The house is quiet and completely empty.`,
      cam: 'wide', motion: 'static',
      lines: ['In the morning, the house was empty and nothing was taken.', 'Nothing was stolen. That was the part that scared him.'],
      actors: [{ id: 'lead', action: 'stand', emotion: 'confused', x: 0.44 }],
    },
    {
      purpose: 'The photo', background: 'street', overlay: 'ONE NEW PHOTO', effects: ['zoom', 'fade'],
      action: `His phone shows one new photo of his own bedroom, taken tonight.`,
      cam: 'close', motion: 'push_in',
      lines: ['On his phone, one new photo: his bedroom, from tonight.', 'One new photo on his phone. The hallway. From inside.'],
      actors: [{ id: 'lead', action: 'phone_scroll', emotion: 'scared', x: 0.42 }],
    },
  ];
  const extras = [
    {
      purpose: 'The basement', background: 'bedroom', overlay: 'BASEMENT', effects: ['night', 'vignette'],
      action: `The basement door is open. He does not remember opening it.`,
      cam: 'medium', motion: 'static',
      lines: ['The basement door was open. He never opened it.', 'The cellar door stood open, and the dark felt wrong.'],
      actors: [{ id: 'lead', action: 'hide', emotion: 'scared', x: 0.32 }],
    },
    {
      purpose: 'The whisper', background: 'horror', overlay: 'HIS NAME', effects: ['vignette'],
      action: `Something in the hall says his name in his own voice.`,
      cam: 'close', motion: 'static',
      lines: ['Something in the hall said his name in his own voice.', 'A whisper used his voice and got it slightly wrong.'],
      actors: [{ id: 'lead', action: 'surprised', emotion: 'scared', x: 0.4 }],
    },
    {
      purpose: 'The light', background: 'bedroom', overlay: 'FLICKER', effects: ['zoom'],
      action: `The hallway light flickers and dies, leaving one red dot.`,
      cam: 'close', motion: 'static',
      lines: ['The hallway light flickered, then left one red dot.', 'The bulb popped, and something red stared back.'],
      actors: [{ id: 'lead', action: 'point', emotion: 'scared', x: 0.44 }],
    },
    {
      purpose: 'The car', background: 'street', overlay: 'HEADLIGHTS', effects: ['night', 'rain'],
      action: `A car at the end of the street turns its headlights on and waits.`,
      cam: 'wide', motion: 'static',
      lines: ['A car at the end of the street switched its lights on.', 'Headlights came on down the road and did not move.'],
      actors: [{ id: 'lead', action: 'look_left', emotion: 'scared', x: 0.4 }],
    },
  ];
  return { tone: 'scary', titles: ['The Thing Downstairs', 'Do Not Open the Door', 'One New Photo'], cast, beats, extras };
}

function everydayArc(premise, req) {
  const { rng, hero, mate } = setup(premise, req);
  const set = SET_PROPS[premise.background] || SET_PROPS.landscape;
  const cast = [
    { id: 'lead', name: hero, role: premise.agent || 'protagonist', color: CHARACTER_COLORS[0] },
    { id: 'mate', name: mate, role: 'friend', color: CHARACTER_COLORS[1] },
  ];
  const goal = premise.goalPhrase;
  const where = premise.place;
  const goalOverlay = premise.goalLabel ? premise.goalLabel.slice(0, 40) : 'THE GOAL';
  const beats = [
    {
      purpose: 'The goal', background: premise.background, overlay: goalOverlay, effects: ['day'],
      action: `${hero} has one job tonight, ${where}: ${goal || 'get one clean win'}.`,
      cam: 'wide', motion: 'static',
      lines: [
        `${hero} has one goal tonight, and it starts now.`,
        `One goal tonight. ${hero} has a plan for it.`,
        'Tonight there is exactly one thing to do.',
      ],
      actors: [{ id: 'lead', action: 'think', emotion: 'determined', x: 0.4 }],
    },
    {
      purpose: 'The first try', background: premise.background, overlay: 'FIRST TRY', effects: ['zoom'],
      action: `${hero} starts strong, then ${set.break}.`,
      cam: 'medium', motion: 'static',
      lines: [
        `${hero} starts strong. Ten seconds later ${set.break}.`,
        `The first attempt goes fine until ${set.break}.`,
        `It starts well. Then ${set.break}, loudly.`,
      ],
      actors: [{ id: 'lead', action: 'point', emotion: 'determined', x: 0.36 }],
    },
    {
      purpose: 'The fix', background: premise.background, overlay: 'PLAN B', effects: ['dust'],
      action: `${hero} patches ${set.prop} with tape, a spare part and hope.`,
      cam: 'close', motion: 'push_in',
      lines: [
        `${hero} fixes ${set.prop} with tape and pure hope.`,
        `No spare, no help. ${hero} patches ${set.prop} anyway.`,
        `${hero} tapes ${set.prop} together and calls it repaired.`,
      ],
      actors: [{ id: 'lead', action: 'stand', emotion: 'determined', x: 0.44 }],
    },
    {
      purpose: 'The setback', background: premise.background, overlay: 'OF COURSE', effects: ['shake'],
      action: `It works for a moment, then the night gets worse.`,
      cam: 'medium', motion: 'static',
      lines: [
        `It works, briefly. Then ${set.break} again.`,
        `One step forward, and the night takes two back.`,
        `It holds for a second, then it all slips again.`,
      ],
      actors: [{ id: 'lead', action: 'fall', emotion: 'sad', x: 0.4 }],
    },
    {
      purpose: 'The low point', background: premise.background, overlay: 'LOW POINT', effects: ['night'],
      action: `${hero} sits in the middle of the mess and stares at it.`,
      cam: 'close', motion: 'static',
      lines: [
        `${hero} sits in the middle of the mess and nearly quits.`,
        `The mess wins for a while. ${hero} just sits there.`,
        `It is late, it is broken, and ${hero} is done.`,
      ],
      actors: [{ id: 'lead', action: 'sit', emotion: 'sad', x: 0.42 }],
    },
    {
      purpose: 'The idea', background: premise.background, overlay: 'WAIT', effects: ['impact_flash'],
      action: `One small detail catches ${hero}'s eye, and the plan changes.`,
      cam: 'close', motion: 'push_in',
      lines: [
        `Then one small detail clicks, and the plan changes.`,
        `${hero} spots the one thing everyone kept missing.`,
        `One look at the pieces, and a better idea lands.`,
      ],
      actors: [{ id: 'lead', action: 'wake_up', emotion: 'surprised', x: 0.4 }],
    },
    {
      purpose: 'The last try', background: premise.background, overlay: 'ONE MORE', effects: ['motion_lines'],
      action: `${hero} gives it one last run with everything left.`,
      cam: 'medium', motion: 'pan_right',
      lines: [
        `Last try, and this time everything lines up.`,
        `One more attempt, and ${hero} does not hold back.`,
        `${hero} goes all in, hands shaking, and it holds.`,
      ],
      actors: [{ id: 'lead', action: 'run', emotion: 'determined', x: 0.28 }],
    },
    {
      purpose: 'The payoff', background: premise.background, overlay: 'DONE', effects: ['zoom', 'fade'],
      action: `${hero} drops to the floor and laughs at the ceiling.`,
      cam: 'wide', motion: 'static',
      lines: [
        `The job is done. ${hero} drops down and laughs.`,
        `It works. ${hero} laughs at the ceiling, exhausted.`,
        `${hero} falls asleep next to it, still smiling.`,
      ],
      actors: [{ id: 'lead', action: 'celebrate', emotion: 'happy', x: 0.44 }],
    },
  ];
  const extras = [
    {
      purpose: 'The help', background: premise.background, overlay: 'NO QUESTIONS', effects: ['day'],
      action: `${mate} turns up with a spare part and no questions.`,
      cam: 'medium', motion: 'static',
      lines: [`${mate} shows up with a spare and no questions.`, `${mate} arrives late, holding exactly the right part.`],
      actors: [
        { id: 'lead', action: 'surprised', emotion: 'surprised', x: 0.34 },
        { id: 'mate', action: 'wave', emotion: 'happy', x: 0.64, facing: -1 },
      ],
    },
    {
      purpose: 'The clock', background: premise.background, overlay: 'MIDNIGHT', effects: ['night'],
      action: `The clock hits midnight and the work is still not done.`,
      cam: 'close', motion: 'static',
      lines: [`Half the night is gone, and the plan is still a mess.`, `Midnight already. ${hero} keeps working anyway.`],
      actors: [{ id: 'lead', action: 'think', emotion: 'sad', x: 0.4 }],
    },
    {
      purpose: 'The last piece', background: premise.background, overlay: 'FITS', effects: ['impact_flash'],
      action: `The last piece slides in. It should not fit, but it does.`,
      cam: 'close', motion: 'push_in',
      lines: [`The last piece fits. It should not, but it does.`, `One final piece clicks into place first try.`],
      actors: [{ id: 'lead', action: 'point', emotion: 'surprised', x: 0.44 }],
    },
    {
      purpose: 'The cheer', background: premise.background, overlay: 'YES!', effects: ['zoom'],
      action: `${hero} and ${mate} both stare at it working, then cheer.`,
      cam: 'medium', motion: 'static',
      lines: [`${hero} and ${mate} stare at it, then both start cheering.`, `It works. ${mate} cheers before ${hero} does.`],
      actors: [
        { id: 'lead', action: 'celebrate', emotion: 'happy', x: 0.36 },
        { id: 'mate', action: 'celebrate', emotion: 'happy', x: 0.64, facing: -1 },
      ],
    },
  ];
  return { tone: 'dramatic', titles: ['One More Try', 'The Long Night', 'Not Tonight'], cast, beats, extras };
}

const ARCS = { war: warArc, outbreak: outbreakArc, heist: heistArc, horror: horrorArc, everyday: everydayArc };

/* -------------------------------------------------------------- assembly ---- */

/** Longest a scene's narration can be at a natural speaking rate. */
function wordBudget(duration) {
  return Math.max(4, Math.floor(Number(duration || 5) * 2.2));
}

/** Keep narration to complete sentences that fit the scene's speaking time. */
function fit(text, duration) {
  const budget = wordBudget(duration);
  const whole = clean(text);
  if (countWords(whole) <= budget) return whole;
  const sentences = whole.match(/[^.!?]+[.!?]/g) || [];
  let out = '';
  for (const sentence of sentences) {
    if (countWords(`${out} ${sentence}`) > budget) break;
    out = `${out} ${sentence}`.trim();
  }
  if (out) return out;
  let clipped = whole.split(' ').slice(0, budget).join(' ').replace(/[,;:]+$/, '');
  while (/\s(and|but|the|a|an|of|to|in|on|with|then|at|once|is|was|one|his|her)$/i.test(clipped)) clipped = clipped.replace(/\s+\w+$/, '');
  return `${clipped}.`;
}

/**
 * Pick the scenes that carry this arc. Short videos keep the setup, the
 * inciting beat and the payoff; longer ones add the middle in order.
 */
export function composeBeats(beats, extras, count) {
  let list = [...beats];
  if (count > list.length) {
    const needed = count - list.length;
    const at = Math.max(1, list.length - 2);
    list = [...list.slice(0, at), ...extras.slice(0, needed), ...list.slice(at)];
  }
  if (count >= list.length) return list.slice(0, count);
  if (count <= 1) return [list[0]];
  if (count === 2) return [list[0], list[list.length - 1]];
  if (count === 3) return [list[0], list[2], list[list.length - 1]];
  if (count === 4) return [list[0], list[1], list[list.length - 2], list[list.length - 1]];
  const head = list.slice(0, 3);
  const tail = list.slice(-2);
  const middle = list.slice(3, -2);
  const slots = count - head.length - tail.length;
  const chosen = [];
  for (let i = 0; i < slots; i++) {
    const index = Math.round(((i + 1) * middle.length) / (slots + 1)) - 1;
    chosen.push(middle[Math.max(0, Math.min(middle.length - 1, index))]);
  }
  return [...head, ...chosen, ...tail];
}

/** Pick a line for this scene and make sure two scenes never say the same thing. */
function takeLine(lines, rng, used) {
  const start = Math.floor(rng() * lines.length) % lines.length;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[(start + i) % lines.length];
    if (!used.has(line)) { used.add(line); return line; }
  }
  return lines[start];
}

function sceneCharacters(beat, cast) {
  return (beat.actors || [{ id: cast[0].id, action: 'stand', emotion: 'neutral' }]).map((actor, i) => {
    const x = actor.x ?? (0.32 + i * 0.3);
    const facing = actor.facing ?? (x < 0.5 ? 1 : -1);
    const out = {
      id: actor.id,
      action: actor.action,
      emotion: actor.emotion,
      position: { x, y: 0.81 },
      facing,
    };
    if (actor.isZombie) out.isZombie = true;
    if (['run', 'walk', 'zombie_chase', 'sneak'].includes(actor.action)) {
      out.targetX = Math.max(0.08, Math.min(0.92, x + facing * 0.34));
    }
    return out;
  });
}

/** Builds a complete project from the prompt with no model and no network. */
export function writeInstantStory(req) {
  const premise = readPremise(req.topic);
  const arc = (ARCS[premise.genre] || everydayArc)(premise, req);
  const count = sceneCountFor(req.duration);
  const beats = composeBeats(arc.beats, arc.extras, count);
  const seconds = Math.round((Number(req.duration) / count) * 1000) / 1000;
  const used = new Set();
  const rng = makeRng(`${req.seed}|${req.topic}|${req.duration}`);
  const titleRng = makeRng(`${req.seed}|title|${req.topic}`);

  const scenes = beats.map((beat, i) => {
    const line = takeLine(beat.lines, rng, used);
    return {
      duration: seconds,
      background: beat.background,
      purpose: beat.purpose,
      action: beat.action,
      camera: beat.cam || (i % 3 === 1 ? 'close' : 'wide'),
      cameraMotion: beat.motion || 'static',
      shotDescription: `${beat.purpose}. Keep ${arc.cast[0].name} readable in the ${beat.background} set.`,
      continuity: i === 0
        ? `Establish ${beat.background} and ${arc.cast[0].name}'s outfit.`
        : `Same outfit and ${beat.background} set as scene ${i}.`,
      effects: beat.effects || [],
      textOverlay: beat.overlay || '',
      narration: req.narration === false ? '' : fit(line, seconds),
      characters: sceneCharacters(beat, arc.cast),
    };
  });

  return {
    title: req.title || pick(arc.titles, titleRng),
    topic: req.topic,
    language: req.language || 'English',
    duration: req.duration,
    aspectRatio: req.aspectRatio || '9:16',
    tone: req.autoTone === false ? req.tone : arc.tone,
    style: req.style || 'classic',
    narration: req.narration !== false,
    subtitles: { enabled: req.subtitles !== false },
    characters: arc.cast,
    scenes,
    seed: Number(req.seed) || 1,
  };
}
