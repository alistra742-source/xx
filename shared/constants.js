// Fixed vocabularies. The AI may only pick from these values; anything else is
// mapped to a safe default by shared/schema.js. Never execute AI-provided code.

export const ACTIONS = [
  'idle', 'stand', 'sit', 'walk', 'run', 'jump', 'fall', 'wave', 'point', 'talk',
  'think', 'laugh', 'cry', 'fight', 'dodge', 'celebrate', 'look_left', 'look_right',
  'surprised', 'scared', 'defeated', 'hide',
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
};

export const BACKGROUNDS = [
  'white', 'black', 'bedroom', 'street', 'city', 'school', 'office',
  'forest', 'desert', 'battlefield', 'horror', 'landscape',
];

export const BACKGROUND_ALIASES = {
  room: 'bedroom', home: 'bedroom', road: 'street', town: 'city', classroom: 'school',
  work: 'office', woods: 'forest', jungle: 'forest', war: 'battlefield', battle: 'battlefield',
  scary: 'horror', graveyard: 'horror', hills: 'landscape', field: 'landscape', studio: 'white',
  night: 'city', sand: 'desert',
};

export const EFFECTS = [
  'shake', 'impact_flash', 'motion_lines', 'dust', 'speed_lines', 'float_text',
  'fade', 'zoom', 'explosion', 'night', 'day',
];

export const EMOTIONS = ['neutral', 'happy', 'sad', 'scared', 'angry', 'surprised', 'determined', 'confused'];

export const TONES = ['funny', 'dramatic', 'educational', 'scary', 'motivational', 'action'];

export const ANIMATION_STYLES = ['classic', 'bold', 'sketch'];

export const SUBTITLE_POSITIONS = ['bottom', 'middle', 'top'];

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
  maxDuration: 90,
  defaultDuration: 30,
  durationChoices: [15, 30, 45, 60],
  minScenes: 1,
  maxScenes: 12,
  minSceneSeconds: 1.5,
  maxSceneSeconds: 15,
  maxCharacters: 4,
  maxTopicChars: 600,
  maxNarrationChars: 400,
  maxEffects: 4,
};

export const DEFAULT_SUBTITLES = {
  enabled: true,
  size: 30,
  position: 'bottom',
  color: '#ffffff',
  outlineColor: '#000000',
  outlineWidth: 4,
};

export const CHARACTER_COLORS = ['#f5f5f5', '#7dd3fc', '#fca5a5', '#fde68a'];
