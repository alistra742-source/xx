// Fixed storyboard: David has $10 and must reach $10 million by day 30.
// Scenes that end in a viewer choice jump to one of three branch openings.

export const DAVID_TOPIC = 'David has $10 and must turn it into $10 million by day 30';

const CHOICE_PROMPT = 'What should David do next?';
const OPTIONS = [
  { label: 'Gamble everything on blackjack', goto: 0 },
  { label: 'Buy all In on memecoins', goto: 0 },
  { label: 'Comment your recommendation', goto: 0 },
];

function scene(duration, background, purpose, action, narration, extra = {}) {
  return {
    duration,
    background,
    purpose,
    action,
    camera: 'medium',
    cameraMotion: 'static',
    shotDescription: `${purpose}. David stays readable in the ${background} set.`,
    continuity: 'David wears the same grey hoodie and jeans in every scene.',
    effects: [],
    textOverlay: '',
    narration,
    characters: [{ id: 'david', action: 'stand', emotion: 'neutral', position: { x: 0.4, y: 0.81 }, facing: 1 }],
    ...extra,
  };
}

const CAST = [
  { id: 'david', name: 'David', color: '#38bdf8', role: 'protagonist', isZombie: false },
];

// Build a scene list with the choice placed on the final scene and a jump per option.
function storyboard(duration, scenes) {
  return {
    title: 'David: $10 to $10 Million',
    topic: DAVID_TOPIC,
    language: 'English',
    duration,
    aspectRatio: '9:16',
    tone: 'dramatic',
    style: 'classic',
    narration: true,
    subtitles: { enabled: true },
    characters: CAST,
    scenes,
    seed: 7,
  };
}

const INTRO = [
  scene(6, 'bedroom', 'David checks his bank app', 'think', 'David has ten dollars, thirty days, and a goal of ten million.'),
  scene(7, 'street', 'David walks to a junkyard shop', 'walk', 'His first move is a junkyard shop on the edge of town.'),
  scene(7, 'shop', 'David buys a mystery box', 'celebrate', 'For ten dollars he buys a mystery box. Inside he finds a gold watch, a vintage camera and a silver bracelet.', { props: [{ name: 'shop', x: 0.5, y: 0.8, scale: 1 }] }),
  scene(7, 'shop', 'David appraises the finds', 'surprised', 'A pawn dealer values the haul at over twenty-five hundred dollars.'),
];

// Branch openings. Each one is a short arc that ends the story.
function branch(label, duration, lines) {
  return lines.map((text, i) => scene(duration / lines.length, i % 2 ? 'city' : 'horror', `${label} beat ${i + 1}`, i === lines.length - 1 ? 'celebrate' : 'walk', text, i === lines.length - 1 ? { endsStory: true } : {}));
}

// Build the full story for a duration. Branch scenes are placed after the choice point.
function build(duration, longBranch) {
  const intro = INTRO;
  const decision = [scene(7, 'shop', 'David faces the choice', 'think', 'David has twenty-five hundred dollars and twenty-nine days left. The viewers decide his next move.')];
  const start = intro.length + decision.length;
  const bjStart = start;
  const memeStart = start + longBranch.blackjack.length;
  const commentStart = memeStart + longBranch.memecoin.length;
  const jump = [bjStart, memeStart, commentStart];
  const choice = { prompt: CHOICE_PROMPT, options: OPTIONS.map((o, i) => ({ label: o.label, goto: jump[i] })) };
  decision[0].choice = choice;
  return storyboard(duration, [
    ...intro,
    ...decision,
    ...longBranch.blackjack,
    ...longBranch.memecoin,
    ...longBranch.comment,
  ]);
}

const BRANCHES_120 = {
  blackjack: branch('Blackjack', 10, [
    'David sits at a blackjack table and bets it all.',
    'He doubles down and wins three hands in a row.',
    'The table flips, and David walks out with nothing left.',
  ]),
  memecoin: branch('Memecoin', 10, [
    'David puts all his cash into a memecoin.',
    'The price spikes, then crashes overnight.',
    'David is down to zero, but he has a new plan.',
  ]),
  comment: branch('Comment', 10, [
    'The viewers pick their own path in the comments.',
    'David follows the most popular suggestion.',
    'The story continues, shaped by the audience.',
  ]),
};

const BRANCHES_240 = {
  blackjack: branch('Blackjack', 40, [
    'David sits down with his twenty-five hundred dollars.',
    'He counts cards for hours and builds his stack.',
    'A casino manager notices and asks him to leave.',
    'David walks out with a bigger stack than he started with.',
  ]),
  memecoin: branch('Memecoin', 40, [
    'David moves everything into a memecoin on a late-night tip.',
    'The coin climbs past his wildest hopes.',
    'Then a rug pull wipes out the market in one hour.',
    'David is left with a lesson and nothing else.',
  ]),
  comment: branch('Comment', 40, [
    'David reads the comments and picks the top suggestion.',
    'He starts a side business based on the crowd\'s idea.',
    'Early sales come in faster than he can fill orders.',
    'The next chapter depends on what the audience wants next.',
  ]),
};

export function davidStory(duration) {
  if (Number(duration) === 240) return build(240, BRANCHES_240);
  return build(120, BRANCHES_120);
}

export function isDavidTopic(topic) {
  return /david/i.test(String(topic || '')) && /10\s*(dollars|\$)|\$\s*10\b/i.test(String(topic || ''));
}
