// Template-based script generator. This is the always-available fallback used
// when the local language model is disabled, times out, or returns invalid JSON.
// It never calls out to the network and always produces a usable project.
import { sceneCountFor } from '../../shared/schema.js';

const ARC = ['hook', 'build', 'twist', 'climax', 'build', 'climax', 'twist', 'build', 'climax', 'end', 'end', 'end'];

const LINES = {
  funny: {
    hook: ['Nobody expected {topic} to go this wrong.', 'Today started normal. Then {topic} happened.'],
    build: ['Okay, so the plan was simple. Very simple.', 'Things were fine, until they were not.', 'Our hero tried to act cool about it.'],
    twist: ['Then the plan fell apart, dramatically.', 'And that is when it got even weirder.'],
    climax: ['Everything exploded into chaos!', 'This was the moment of pure panic!'],
    end: ['Somehow, we survived. Barely.', 'Lesson learned. Mostly.', 'Like and follow for part two!'],
  },
  dramatic: {
    hook: ['It started with a single sound that no one could ignore.', 'Everything changed the day {topic} began.'],
    build: ['Hope was fading, but there was no turning back.', 'Step by step, the danger came closer.'],
    twist: ['Then came the truth that changed everything.', 'But the worst was still to come.'],
    climax: ['In one final moment, everything was on the line.', 'The hero had to choose, and choose now.'],
    end: ['In the silence after the storm, a new beginning.', 'Some stories never truly end.'],
  },
  educational: {
    hook: ['Here is a simple way to understand {topic}.', 'Let us look at {topic} step by step.'],
    build: ['First, we start with the basic idea.', 'Next, we see how the parts connect.'],
    twist: ['But here is a detail many people miss.', 'A common mistake changes the result.'],
    climax: ['Now the whole process comes together.', 'This is the key moment to remember.'],
    end: ['So now you know the core idea.', 'Share this with someone who needs it!'],
  },
  scary: {
    hook: ['Something was waiting in the dark. It had been there for {topic}.', 'The door was open. It should not have been.'],
    build: ['Footsteps. Behind you. Then nothing.', 'The shadows seemed to move on their own.'],
    twist: ['Then the lights went out.', 'And the whisper said your name.'],
    climax: ['It was right there. Close enough to touch.', 'There was no time left to run.'],
    end: ['Silence. But something is still watching.', 'Sleep well. If you can.'],
  },
  motivational: {
    hook: ['Every big journey starts with one decision about {topic}.', 'You are stronger than you think.'],
    build: ['Doubt showed up, as it always does.', 'So the hero took the first small step forward.'],
    twist: ['Then the setback came, hard and unexpected.', 'But falling down was never the end.'],
    climax: ['With everything left, the hero pushed through!', 'This was the moment that proved the doubters wrong.'],
    end: ['You did not quit. And that makes all the difference.', 'Now go and take your next step!'],
  },
  action: {
    hook: ['Explosions in the distance. {topic} had begun.', 'No time to think. Move, move, move!'],
    build: ['They were closing in fast.', 'Sprint, dodge, keep moving!'],
    twist: ['A wall blocked the only way out.', 'Then the enemy came from above!'],
    climax: ['A full-on fight. Every move counted!', 'One last strike, all or nothing!'],
    end: ['Dust settled. The mission was complete.', 'Another day, another close call.'],
  },
};

const ACTIONS = {
  funny: { hook: ['walk', 'talk'], build: ['walk', 'think', 'point'], twist: ['surprised', 'fall'], climax: ['run', 'scared', 'fight'], end: ['celebrate', 'laugh', 'wave'] },
  dramatic: { hook: ['idle', 'look_left'], build: ['walk', 'talk'], twist: ['surprised', 'think'], climax: ['fight', 'run'], end: ['defeated', 'stand', 'wave'] },
  educational: { hook: ['wave', 'point'], build: ['talk', 'point'], twist: ['think', 'surprised'], climax: ['point', 'talk'], end: ['celebrate', 'wave'] },
  scary: { hook: ['idle', 'look_left'], build: ['walk', 'look_right', 'hide'], twist: ['scared', 'surprised'], climax: ['run', 'scared'], end: ['hide', 'idle'] },
  motivational: { hook: ['stand', 'talk'], build: ['walk', 'talk'], twist: ['fall', 'cry'], climax: ['run', 'jump', 'celebrate'], end: ['celebrate', 'wave'] },
  action: { hook: ['run', 'look_left'], build: ['run', 'dodge'], twist: ['jump', 'surprised'], climax: ['fight', 'dodge', 'jump'], end: ['celebrate', 'stand'] },
};

const EMOTION = {
  hook: 'neutral', build: 'determined', twist: 'surprised', climax: 'scared', end: 'happy',
};

const BACKGROUND_CYCLE = {
  scary: ['horror', 'forest', 'horror', 'bedroom', 'horror'],
  action: ['battlefield', 'desert', 'street', 'battlefield'],
  educational: ['school', 'white', 'office', 'white'],
  motivational: ['landscape', 'desert', 'city', 'landscape'],
  dramatic: ['city', 'street', 'forest', 'city'],
  funny: ['bedroom', 'street', 'office', 'city', 'school'],
};

const KEYWORD_BACKGROUNDS = [
  [/zombie|apocalyp|survivor|horror|ghost|monster/i, 'horror'],
  [/forest|jungle|wood|camp|hike/i, 'forest'],
  [/school|class|exam|teacher|student/i, 'school'],
  [/office|boss|job|work|meeting/i, 'office'],
  [/desert|sand|dune|treasure/i, 'desert'],
  [/war|battle|soldier|army|fight/i, 'battlefield'],
  [/city|street|car|chase|police/i, 'city'],
  [/home|room|bed|night/i, 'bedroom'],
];

function fill(template, topic) {
  return template.replace(/\{topic\}/g, topic.replace(/[.!?]+$/, '').slice(0, 80));
}

function pick(list, i) {
  return list[i % list.length];
}

/** Build a raw (un-normalized) project from a validated request. */
export function templateProject(req) {
  const tone = req.tone in LINES ? req.tone : 'funny';
  const count = sceneCountFor(req.duration);
  const lines = LINES[tone];
  const acts = ACTIONS[tone];
  const bgs = [...(KEYWORD_BACKGROUNDS.find(([re]) => re.test(req.topic))?.[1] ? [KEYWORD_BACKGROUNDS.find(([re]) => re.test(req.topic))[1]] : []), ...BACKGROUND_CYCLE[tone]];

  const names = ['hero', 'friend', 'rival', 'helper', 'villain'];
  const characters = Array.from({ length: req.characterCount }, (_, i) => ({
    id: names[i] ?? `char${i + 1}`,
    name: i === 0 ? 'Hero' : `Character ${i + 1}`,
    role: i === 0 ? 'protagonist' : 'supporting',
  }));

  const beats = Array.from({ length: count }, (_, i) => ARC[Math.min(i, ARC.length - 1)] ?? 'build');
  // Make sure the last scene is always an ending and the first a hook.
  beats[0] = 'hook';
  beats[count - 1] = 'end';

  const seen = new Map();
  const scenes = beats.map((beat, i) => {
    const n = seen.get(beat) ?? 0;
    seen.set(beat, n + 1);
    const line = fill(pick(lines[beat], n), req.topic);
    const actOne = pick(acts[beat], n);
    const chars = characters.map((c, ci) => {
      const action = ci === 0 ? actOne : pick(['talk', 'look_right', 'point', 'surprised'], i + ci);
      return {
        id: c.id,
        action,
        position: {
          x: characters.length === 1 ? 0.5 : (ci === 0 ? 0.35 : 0.68),
          y: 0.78,
        },
        emotion: ci === 0 ? EMOTION[beat] : 'neutral',
      };
    });
    const effects = [];
    if (beat === 'twist') effects.push('impact_flash');
    if (beat === 'climax' && (tone === 'action' || tone === 'scary')) effects.push('shake');
    if (beat === 'climax' && tone === 'action') effects.push('speed_lines');
    if (beat === 'hook' && tone === 'scary') effects.push('night');
    if (beat === 'end') effects.push('zoom');
    return {
      duration: req.duration / count,
      background: bgs[i % bgs.length],
      narration: req.narration ? line : '',
      characters: chars,
      effects,
      textOverlay: '',
    };
  });

  return {
    title: req.title || makeTitle(req.topic, tone),
    topic: req.topic,
    language: req.language,
    duration: req.duration,
    aspectRatio: req.aspectRatio,
    tone,
    style: req.style,
    narration: req.narration,
    subtitles: { enabled: req.subtitles },
    characters,
    scenes,
  };
}

function makeTitle(topic, tone) {
  const short = topic.replace(/^(create|make|generate)\s+(a|an)?\s*/i, '').split(/\s+/).slice(0, 6).join(' ');
  const prefix = { funny: 'The Silly', dramatic: 'The Last', educational: 'Understanding', scary: 'The Dark', motivational: 'Rise:', action: 'Mission:' }[tone] ?? '';
  return `${prefix} ${short}`.replace(/\s+/g, ' ').trim().slice(0, 80);
}
