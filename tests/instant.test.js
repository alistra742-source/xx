import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../server/config.js';
import { createLlm } from '../server/script/llm.js';
import { createScriptService, instantEnhance } from '../server/script/index.js';
import { sceneCountFor, validateGenerateRequest } from '../shared/schema.js';

const service = createScriptService({ llm: createLlm(loadConfig({})) });
const req = (topic, duration = 30, seed = 7) => validateGenerateRequest({ topic, duration, seed });
const narrations = (project) => project.scenes.map((s) => s.narration);
const words = (text) => text.split(/\s+/).filter(Boolean).length;

test('a war prompt becomes the story the viewer expects: home, sirens, phone warning, payoff', async () => {
  const { source, project } = await service(req('war story', 30));
  assert.equal(source, 'instant');
  assert.equal(project.scenes.length, sceneCountFor(30));

  const lines = narrations(project);
  assert.deepEqual(project.scenes.slice(0, 3).map((s) => s.background), ['bedroom', 'bedroom', 'bedroom'], 'it opens at home');
  assert.match(lines.join(' '), /siren/i, 'the sirens are the inciting incident');
  assert.match(lines.join(' '), /war/i, 'the phone carries a war warning');
  assert.match(lines.join(' '), /drill|snacks?/i, 'it lands on the funny twist');
  assert.match(project.scenes[2].textOverlay, /WAR/i, 'the warning is on screen');
});

test('the genre word is never the hero and no two scenes repeat a line', async () => {
  for (const topic of ['war story', 'a zombie apocalypse', 'a bank heist', 'a haunted house']) {
    const { project } = await service(req(topic, 45, 3));
    assert.ok(!/^(war|zombie|heist|horror|hero)$/i.test(project.characters[0].name), `${topic}: named after a person`);
    const lines = narrations(project);
    assert.equal(new Set(lines).size, lines.length, `${topic}: every scene says something new`);
    assert.ok(lines.every((line) => line.trim().length > 0), `${topic}: narration on every scene`);
  }
});

test('built-in stories fit the requested runtime and the speaking budget at every length', async () => {
  for (const topic of ['war story', 'a zombie apocalypse', 'a bank heist', 'a haunted house', 'A violinist repairs a broken bridge']) {
    for (const duration of [15, 30, 45, 60]) {
      const { project } = await service(req(topic, duration, 11));
      assert.equal(project.scenes.length, sceneCountFor(duration), `${topic} ${duration}s scene count`);
      for (const scene of project.scenes) {
        assert.ok(scene.purpose && scene.action && scene.shotDescription && scene.continuity, `${topic} ${duration}s direction`);
        assert.ok(words(scene.narration) <= Math.floor(scene.duration * 2.2 + 0.001), `${topic} ${duration}s narration fits ${scene.duration}s`);
      }
    }
  }
});

test('enhance prompt writes a concrete plan and a fresh one on every click', async () => {
  const first = instantEnhance(req('war story', 30, 101));
  const second = instantEnhance(req('war story', 30, 202));
  assert.equal(first.source, 'instant');
  assert.match(first.enhancedPrompt, /Scene 1/);
  assert.match(first.enhancedPrompt, /Action: /);
  assert.match(first.enhancedPrompt, /Narration: /);
  assert.notEqual(first.enhancedPrompt, second.enhancedPrompt, 'a new seed must not repeat the same plan');
  assert.match(first.enhancedPrompt, /siren|war|drill/i);
  assert.ok(!/hero wants one thing|the first attempt starts well/i.test(first.enhancedPrompt), 'no template filler');
});

test('a named physical action is performed literally instead of turned into a plot arc', async () => {
  const { project } = await service(req('a man punches another man', 30, 9));
  assert.equal(project.characters.length, 2);
  assert.equal(project.tone, 'action');

  const actions = project.scenes.flatMap((s) => s.characters.map((c) => c.action));
  assert.ok(actions.includes('fight'), 'the punch is the turning point');
  assert.ok(actions.includes('defeated'), 'the other man goes down');

  const text = project.scenes.map((s) => `${s.textOverlay} ${s.action} ${s.narration}`).join(' ');
  assert.match(text, /punch/i, 'the word from the idea survives');
  assert.match(project.scenes[2].narration, /punch/i, 'the strike lands in the strike scene');
  assert.match(project.scenes[0].action, /stand across/i, 'it opens on the two of them facing off');
  assert.match(project.scenes.at(-1).action, /walks away/i, 'it ends on the exit');
});

test('an action aimed at something other than a person is not turned into a fistfight', async () => {
  const { project } = await service(req('two men fight zombies', 30, 9));
  assert.notEqual(project.tone, 'action');
  assert.equal(project.characters.some((c) => c.isZombie), true, 'it stays an outbreak story');
  assert.ok(!project.scenes.some((s) => s.textOverlay === 'PUNCH'));
});

const direct = (topic, duration = 30, seed = 9) => validateGenerateRequest({ topic, duration, seed });

test('the funny mode is gone and a funny idea still gets a valid tone', async () => {
  const { TONES } = await import('../shared/constants.js');
  assert.ok(!TONES.includes('funny'), 'funny is not a mode');
  assert.notEqual(direct('a very funny cat fails at everything').tone, 'funny', 'funny prompts fall back to a real tone');

  const { project } = await service(req('a very funny cat fails at everything', 30, 4));
  assert.notEqual(project.tone, 'funny');
  assert.match(project.tone, /dramatic|action|educational|scary|motivational/);
});

test('a prompt that names a person and place keeps them', async () => {
  const { project } = await service(req('a guy in a house when war starts', 30, 5));
  assert.equal(project.characters[0].name, 'Guy');
  assert.equal(project.scenes[0].background, 'bedroom');
  const desert = (await service(req('A botanist repairs a greenhouse in the desert', 30, 5))).project;
  assert.ok(desert.scenes.every((s) => s.background === 'desert'));
});
