// Fixed vocabularies. The AI may only pick from these values; anything else is
// mapped to a safe default by shared/schema.js. Never execute AI-provided code.

export const ACTIONS = [
  'idle', 'stand', 'sit', 'walk', 'run', 'jump', 'fall', 'wave', 'point', 'talk',
  'think', 'laugh', 'cry', 'fight', 'dodge', 'celebrate', 'look_left', 'look_right',
  'surprised', 'scared', 'defeated', 'hide',
  // Story & cinematic actions:
  'sleep', 'wake_up', 'watch_tv', 'look_window', 'barricade', 'panic', 'sneak',
  'phone_scroll', 'crawl',
  // Zombie / outbreak actions:
  'zombie_walk', 'zombie_chase', 'infect', 'turn_zombie',
];

export const ACTION_ALIASES = {
  dead: 'defeated', defeat: 'defeated', die: 'defeated', lie_down: 'defeated',
  look_around: 'look_left', look: 'look_left', run_away: 'run', flee: 'run', sprint: 'run',
  punch: 'fight', kick: 'fight', attack: 'fight', block: 'dodge', duck: 'dodge',
  happy: 'celebrate', cheer: 'celebrate', victory: 'celebrate', dance: 'celebrate',
  sad: 'cry', sob: 'cry', lol: 'laugh', shock: 'surprised', afraid: 'scared', fear: 'scared',
  cower: 'hide', crouch: 'hide', hiding: 'hide', walking: 'walk', running: 'run',
  sitting: 'sit', standing: 'stand', waving: 'wave', pointing: 'point', talking: 'talk',
  speak: 'talk', thinking: 'think', jumping: 'jump', falling: 'fall', fighting: 'fight',
  dodging: 'dodge', celebrating: 'celebrate', laughing: 'laugh', crying: 'cry',
  stay: 'idle', wait: 'idle',
  // Extended aliases:
  sleeping: 'sleep', nap: 'sleep', bed: 'sleep', rest: 'sleep',
  wake: 'wake_up', wakeup: 'wake_up', awake: 'wake_up', startle: 'wake_up',
  tv: 'watch_tv', watch: 'watch_tv', news: 'watch_tv', turn_on_tv: 'watch_tv',
  window: 'look_window', peer: 'look_window', look_out: 'look_window', look_down: 'look_window',
  shamble: 'zombie_walk', groan: 'zombie_walk', zombie: 'zombie_walk',
  chase: 'zombie_chase', lunge: 'zombie_chase', hunt: 'zombie_chase',
  bite: 'infect', attack_zombie: 'infect', grab: 'infect',
  infected: 'turn_zombie', transform: 'turn_zombie', mutate: 'turn_zombie', zombify: 'turn_zombie',
  lock_door: 'barricade', close_door: 'barricade', board_up: 'barricade',
  freak_out: 'panic', scream: 'panic',
  tiptoe: 'sneak', creep: 'sneak', stealth: 'sneak',
  phone: 'phone_scroll', text: 'phone_scroll',
};

export const BACKGROUNDS = [
  'white', 'black', 'bedroom', 'street', 'city', 'school', 'office',
  'forest', 'desert', 'battlefield', 'horror', 'landscape',
  'rooftop', 'bunker', 'lab',
];

export const BACKGROUND_ALIASES = {
  room: 'bedroom', home: 'bedroom', apartment: 'bedroom', house: 'bedroom',
  road: 'street', alley: 'street', highway: 'street',
  town: 'city', downtown: 'city', night: 'city',
  classroom: 'school', college: 'school',
  work: 'office', workplace: 'office',
  woods: 'forest', jungle: 'forest', camp: 'forest',
  war: 'battlefield', battle: 'battlefield', ruins: 'battlefield',
  scary: 'horror', graveyard: 'horror', apocalypse: 'horror',
  hills: 'landscape', field: 'landscape', park: 'landscape',
  studio: 'white', sand: 'desert',
  roof: 'rooftop', building_top: 'rooftop',
  basement: 'bunker', shelter: 'bunker',
  laboratory: 'lab', hospital: 'lab',
};

export const EFFECTS = [
  'shake', 'impact_flash', 'motion_lines', 'dust', 'speed_lines', 'float_text',
  'fade', 'zoom', 'explosion', 'night', 'day',
  'alarm_flash', 'tv_glow', 'infection_spores', 'rain', 'vignette',
];

export const EMOTIONS = [
  'neutral', 'happy', 'sad', 'scared', 'angry', 'surprised', 'determined', 'confused', 'infected',
];

export const TONES = ['dramatic', 'educational', 'scary', 'motivational', 'action'];

export const ANIMATION_STYLES = ['classic', 'bold', 'sketch'];

export const SUBTITLE_POSITIONS = ['bottom', 'middle', 'top'];

// Character drip / outfit vocabularies
export const HATS = [
  'none', 'cap', 'backwards_cap', 'beanie', 'hood_up', 'crown',
  'top_hat', 'headband', 'helmet', 'halo', 'horns', 'bandana',
  'cowboy_hat', 'bucket_hat', 'sun_hat', 'beret',
];

export const TOPS = [
  'none', 'hoodie', 'puff_jacket', 'suit', 'tshirt', 'vest',
  'tracksuit', 'lab_coat', 'tactical', 'tattered',
  'button_shirt', 'tank_top', 'jacket', 'jersey',
];

export const ACCESSORIES = [
  'none', 'shades', 'glasses', 'chain', 'headphones', 'mask',
  'scarf', 'backpack', 'katana', 'bat',
  'watch', 'tie', 'crossbody_bag', 'cape',
];

export const ASPECT_RATIOS = {
  '9:16': { w: 9, h: 16, label: 'Vertical 9:16 (Shorts / TikTok)' },
  '16:9': { w: 16, h: 9, label: 'Horizontal 16:9 (YouTube)' },
  '1:1': { w: 1, h: 1, label: 'Square 1:1' },
};

// Short-side pixel sizes the exporter supports.
export const RESOLUTIONS = [480, 540, 720, 1080];
export const DEFAULT_RESOLUTION = 720;
export const DEFAULT_FPS = 24;
export const FPS_OPTIONS = [12, 24, 30];

export const LIMITS = {
  minDuration: 10,
  maxDuration: 240,
  defaultDuration: 30,
  durationChoices: [15, 30, 45, 60, 120, 240],
  minScenes: 1,
  maxScenes: 48,
  minSceneSeconds: 1.5,
  maxSceneSeconds: 15,
  maxCharacters: 8,
  maxTopicChars: 600,
  maxNarrationChars: 400,
  maxEffects: 5,
};

export const DEFAULT_SUBTITLES = {
  enabled: true,
  size: 32,
  position: 'bottom',
  color: '#ffffff',
  outlineColor: '#000000',
  outlineWidth: 5,
};

export const CHARACTER_COLORS = [
  '#f8fafc', // crisp white
  '#38bdf8', // electric blue
  '#fb7185', // coral pink
  '#facc15', // gold yellow
  '#a78bfa', // neon purple
  '#fb923c', // vivid orange
  '#4ade80', // toxic zombie green
  '#2dd4bf', // teal cyan
];

export const DRIP_COLORS = [
  '#ef4444', '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b',
  '#ec4899', '#06b6d4', '#eab308', '#6366f1', '#14b8a6',
];

export const ZOMBIE_COLOR = '#4ade80';
export const ZOMBIE_GLOW = '#22c55e';
