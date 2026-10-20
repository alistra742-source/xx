import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, BACKGROUNDS, LIMITS } from '../shared/constants.js';
import { normalizeProject, validateGenerateRequest, ValidationError, sceneCountFor, normalizeAction, inferStoryMeta } from '../shared/schema.js';
import { splitNarration, subtitleCues } from '../shared/subtitles.js';
import { solvePose } from '../shared/stickfigure.js';
import { templateProject, extractSubject, settingFromTopic } from '../server/script/template.js';
import { createTts } from '../server/tts.js';
import { improvePromptLocally, createLlm } from '../server/script/llm.js';
import { createJobs } from '../server/jobs.js';
import { loadConfig } from '../server/config.js';

describe('schema', () => {
  test('maps unknown actions and backgrounds to safe defaults', () => {
    assert.equal(normalizeAction('moonwalk').action, 'idle');
    assert.equal(normalizeAction('dead').action, 'defeated');
    const p = normalizeProject({
      duration: 30,
      scenes: [{ background: 'mars', characters: [{ id: 'a', action: 'executeCode()' }] }],
    });
    assert.ok(BACKGROUNDS.includes(p.scenes[0].background));
    assert.ok(ACTIONS.includes(p.scenes[0].characters[0].action));
  });

  test('scene durations are rescaled to the requested total', () => {
    const p = normalizeProject({
      duration: 30,
      scenes: Array.from({ length: 5 }, () => ({ duration: 20, characters: [{ action: 'walk' }] })),
    });
    const total = p.scenes.reduce((s, sc) => s + sc.duration, 0);
    assert.ok(Math.abs(total - 30) <= 2.5, `total was ${total}`);
  });

  test('rejects a script with no scenes', () => {
    assert.throws(() => normalizeProject({ duration: 30, scenes: [] }), ValidationError);
  });

  test('validates generation requests and automatic choices', () => {
    assert.throws(() => validateGenerateRequest({ topic: 'a' }), ValidationError);
    assert.throws(() => validateGenerateRequest({ topic: 'a funny cat', duration: 1000 }), ValidationError);
    const ok = validateGenerateRequest({ topic: 'a zombie apocalypse story', duration: 30, tone: 'auto', characterCount: 'auto' });
    assert.equal(ok.tone, 'scary');
    assert.equal(ok.characterCount, 5);
    assert.equal(ok.autoTone, true);
    assert.equal(ok.autoCharacters, true);
    const explicit = validateGenerateRequest({ topic: 'a funny cat story', duration: 30, tone: 'funny', characterCount: 99 });
    assert.equal(explicit.tone, 'funny');
    assert.equal(explicit.characterCount, LIMITS.maxCharacters);
  });

  test('story inference selects zombie tone/cast and outfit schemas', () => {
    assert.deepEqual(inferStoryMeta('green zombie apocalypse'), { tone: 'scary', characterCount: 5 });
    const p = normalizeProject({
      topic: 'zombie outbreak', duration: 30,
      characters: [{ id: 'walker', role: 'zombie', isZombie: true }],
      scenes: [{ background: 'horror', characters: [{ id: 'walker', action: 'zombie_walk', emotion: 'infected', isZombie: true }] }],
    });
    assert.equal(p.characters[0].isZombie, true);
    assert.equal(p.characters[0].drip.isZombie, true);
    assert.equal(p.scenes[0].characters[0].action, 'zombie_walk');
    assert.ok(p.characters[0].drip.hat);
  });

  test('scene counts match the spec ranges', () => {
    assert.ok(sceneCountFor(30) >= 4 && sceneCountFor(30) <= 7);
    assert.ok(sceneCountFor(60) >= 6 && sceneCountFor(60) <= 12);
  });
});

describe('subtitles', () => {
  test('splits long narration into short segments', () => {
    const text = 'Everything seemed normal until the first alarm sounded across the entire quiet city tonight.';
    const parts = splitNarration(text, 30);
    assert.ok(parts.length >= 2);
    assert.ok(parts.every((p) => p.length <= 40));
    assert.equal(parts.join(' ').replace(/\s+/g, ' ').trim(), text);
  });

  test('cues cover the scene window exactly and in order', () => {
    const cues = subtitleCues('One two three four five six seven eight nine ten eleven twelve.', 2, 9, 20);
    assert.equal(cues[0].start, 2);
    assert.ok(Math.abs(cues.at(-1).end - 9) < 1e-9);
    for (let i = 1; i < cues.length; i++) assert.ok(cues[i].start >= cues[i - 1].start);
  });
});

describe('template generator (offline fallback)', () => {
  test('extracts story subject without narrating the user prompt', () => {
    const subject = extractSubject('Create a funny 45-second animation about a stick figure trying to survive a zombie apocalypse.');
    assert.ok(!/create|animation|stick figure|45-second/i.test(subject), subject);
    assert.match(subject, /zombie/i);
  });

  test('zombie prompt generates an original complete outbreak plot, not a prompt reading', () => {
    const topic = 'At 3 AM an unknown virus hit. A guy woke to alarms, saw green zombies chasing people outside his window, then fought to escape.';
    const req = validateGenerateRequest({ topic, duration: 30, tone: 'auto', characterCount: 'auto', narration: true, seed: 12345 });
    const p = normalizeProject(templateProject(req), req);
    const all = p.scenes.map((s) => `${s.textOverlay} ${s.narration}`).join(' ');
    const actions = p.scenes.flatMap((s) => s.characters.map((c) => c.action));
    assert.equal(p.tone, 'scary');
    assert.ok(p.characters.length >= 4 && p.characters.length <= LIMITS.maxCharacters);
    assert.ok(actions.includes('wake_up'), 'alarms wake the hero');
    assert.ok(actions.includes('watch_tv'), 'hero watches the news');
    assert.ok(actions.includes('look_window'), 'hero looks out the window');
    assert.ok(actions.includes('zombie_chase'), 'zombies chase civilians');
    assert.ok(actions.includes('turn_zombie') || actions.includes('infect'), 'a victim is infected');
    assert.ok(actions.includes('barricade'), 'survivor secures the door');
    assert.ok(actions.includes('run'), 'survivor escapes');
    assert.ok(/unknown virus|emergency broadcast|breaking news|lock all doors/i.test(all));
    assert.ok(p.scenes.some((s) => s.characters.some((c) => c.isZombie)));
    assert.ok(p.scenes.every((s) => !/create a .* animation|generate a video/i.test(s.narration)));
  });

  test('random seed changes story lines and the cast wears drip', () => {
    const base = { topic: 'survive a zombie outbreak', duration: 30, tone: 'auto', autoTone: true, autoCharacters: true, narration: true, language: 'English' };
    const a = normalizeProject(templateProject({ ...base, seed: 101 }), base);
    const b = normalizeProject(templateProject({ ...base, seed: 909 }), base);
    assert.notEqual(a.scenes[0].narration, b.scenes[0].narration);
    assert.ok(a.characters.every((c) => c.drip && c.drip.hat && c.drip.top));
  });

  test('produces a valid project for every tone', () => {
    for (const tone of ['funny', 'dramatic', 'educational', 'scary', 'motivational', 'action']) {
      const raw = templateProject({ topic: 'a stick figure surviving a zombie apocalypse', duration: 45, tone, autoTone: false, autoCharacters: false, style: 'classic', aspectRatio: '9:16', characterCount: 2, narration: true, subtitles: true, language: 'English', seed: 42 });
      const p = normalizeProject(raw, { duration: 45, tone });
      assert.equal(p.tone, tone);
      assert.ok(p.scenes.length >= 4);
      for (const sc of p.scenes) {
        assert.ok(sc.narration.length > 0, 'every scene has narration text');
        assert.ok(sc.characters.length >= 1);
      }
    }
  });
});

describe('TTS configuration', () => {
  test('automatic voice provider is advertised as available when espeak is absent, with graceful online fallback', async () => {
    const tts = await createTts({ ttsProvider: 'auto', espeakBin: 'definitely-not-an-espeak-binary', ttsTimeoutMs: 100 });
    assert.equal(tts.enabled, true);
    assert.equal(tts.name, 'google-tts');
    assert.equal((await createTts({ ttsProvider: 'none' })).enabled, false);
  });
});

describe('stick-figure pose solver', () => {
  test('every supported action yields finite joint positions', () => {
    for (const action of ACTIONS) {
      for (const t of [0, 0.37, 1.9, 4.2]) {
        const pose = solvePose(action, t, 'neutral');
        const json = JSON.stringify(pose);
        assert.ok(!/NaN|Infinity/.test(json), `${action} at ${t} produced non-finite values`);
      }
    }
  });

  test('actions produce distinct, time-varying motion (not a static figure)', () => {
    const a = JSON.stringify(solvePose('run', 0.0));
    const b = JSON.stringify(solvePose('run', 0.4));
    assert.notEqual(a, b);
  });
});

describe('job queue', () => {
  test('runs jobs strictly one at a time and reports results', async () => {
    const jobs = createJobs({ maxQueue: 5, ttlMs: 60000, log: { error() {} } });
    let running = 0;
    let peak = 0;
    const task = async () => {
      running++; peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 20));
      running--;
      return { path: 'x' };
    };
    const a = jobs.submit(task);
    const b = jobs.submit(task);
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(peak, 1);
    assert.equal(jobs.get(a.id).status, 'done');
    assert.equal(jobs.get(b.id).status, 'done');
  });

  test('rejects submissions beyond the queue limit', () => {
    const jobs = createJobs({ maxQueue: 1, ttlMs: 60000, log: { error() {} } });
    jobs.submit(() => new Promise((r) => setTimeout(r, 50)));
    assert.throws(() => jobs.submit(async () => ({})), /Too many exports/);
  });

  test('cancelling a queued job frees its queue slot', async () => {
    const jobs = createJobs({ maxQueue: 2, ttlMs: 60000, log: { error() {} } });
    const blocker = jobs.submit(() => new Promise((r) => setTimeout(r, 60)));
    const queued = jobs.submit(async () => ({}));
    jobs.cancel(queued.id);
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(jobs.get(queued.id).status, 'cancelled');
    assert.equal(jobs.get(blocker.id).status, 'done');
    // Slot was released: two more submissions fit again.
    jobs.submit(async () => ({}));
    jobs.submit(async () => ({}));
  });
});

test('scenes use the setting named in the topic', () => {
  assert.equal(settingFromTopic('a zombie outbreak at my school'), 'school');
  assert.equal(settingFromTopic('lost in the desert with a camel'), 'desert');
  assert.equal(settingFromTopic('a heist at the bank'), null);
  const project = templateProject({ topic: 'a crew escapes from the desert', duration: 30, language: 'English', narration: true, seed: 7 });
  assert.ok(project.scenes.length > 0);
  assert.ok(project.scenes.every((s) => s.background === 'desert'));
});

test('LLM script request sends the key, model, and a per-request variation id', async () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  const story = {
    title: 'Test', tone: 'funny',
    characters: [{ id: 'hero', name: 'Hero', role: 'protagonist', color: '#ff0000', isZombie: false }],
    scenes: [{ duration: 5, background: 'desert', narration: 'The hero finds a map.', effects: [], textOverlay: '', characters: [{ id: 'hero', action: 'walk', emotion: 'happy', isZombie: false, position: { x: 0.5, y: 0.8 }, targetX: 0.6 }] }],
  };
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(story) } }] }) };
  };
  try {
    const llm = createLlm({ llamaUrl: 'https://api.example.com/', llmApiKey: 'k-test', llmModel: 'm-test', llmTimeoutMs: 5000, llmCooldownMs: 0, llmMaxTokens: 500, llmEnabled: true });
    const req = { topic: 'a hero finds a map in the desert', duration: 10, tone: 'funny', autoTone: false, style: 'classic', aspectRatio: '9:16', narration: true, subtitles: false, language: 'English', seed: 4242 };
    const { project, source } = await llm.generateScript(req);
    assert.equal(source, 'llm');
    assert.ok(project.scenes.length > 0);
    assert.equal(calls[0].url, 'https://api.example.com/v1/chat/completions');
    assert.equal(calls[0].init.headers.authorization, 'Bearer k-test');
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.model, 'm-test');
    assert.ok(body.messages[1].content.includes('Variation id: 4242'));
    assert.equal(body.temperature, 1.0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('GROQ_API alone selects Groq and the fastest small model', () => {
  const config = loadConfig({ GROQ_API: 'gsk-test' });
  assert.equal(config.llamaUrl, 'https://api.groq.com/openai/v1');
  assert.equal(config.llmApiKey, 'gsk-test');
  assert.equal(config.llmModel, 'llama-3.1-8b-instant');
  const explicit = loadConfig({ GROQ_API: 'gsk-test', LLM_BASE_URL: 'https://example.test/v1', LLM_API_KEY: 'k' });
  assert.equal(explicit.llamaUrl, 'https://example.test/v1');
  assert.equal(explicit.llmApiKey, 'k');
});

test('prompt improvement without a model keeps the user prompt and adds no fixed text', () => {
  assert.equal(improvePromptLocally('  a robot   learns to dance '), 'a robot learns to dance');
  assert.equal(improvePromptLocally('Heist bank'), 'Heist bank');
});
