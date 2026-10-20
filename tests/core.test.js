import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, BACKGROUNDS, LIMITS } from '../shared/constants.js';
import { normalizeProject, validateGenerateRequest, ValidationError, sceneCountFor, normalizeAction } from '../shared/schema.js';
import { splitNarration, subtitleCues } from '../shared/subtitles.js';
import { solvePose } from '../shared/stickfigure.js';
import { templateProject } from '../server/script/template.js';
import { createJobs } from '../server/jobs.js';

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

  test('validates generation requests', () => {
    assert.throws(() => validateGenerateRequest({ topic: 'a' }), ValidationError);
    assert.throws(() => validateGenerateRequest({ topic: 'a funny cat', duration: 1000 }), ValidationError);
    const ok = validateGenerateRequest({ topic: 'a funny cat story', duration: 30, tone: 'nope', characterCount: 99 });
    assert.equal(ok.tone, 'funny');
    assert.equal(ok.characterCount, LIMITS.maxCharacters);
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
  test('produces a valid project for every tone', () => {
    for (const tone of ['funny', 'dramatic', 'educational', 'scary', 'motivational', 'action']) {
      const raw = templateProject({ topic: 'a stick figure surviving a zombie apocalypse', duration: 45, tone, style: 'classic', aspectRatio: '9:16', characterCount: 2, narration: true, subtitles: true, language: 'English' });
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
