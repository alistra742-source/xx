import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../server/config.js';
import { completionEndpoint, createLlm, ScriptError } from '../server/script/llm.js';
import { createScriptService } from '../server/script/index.js';
import { normalizeProject, validateGenerateRequest, sceneCountFor } from '../shared/schema.js';

const config = (extra = {}) => ({ ...loadConfig({ LLAMA_URL: 'http://localhost:8080', LLM_COOLDOWN_MS: '0' }), ...extra });
const req = (topic = 'A botanist repairs a greenhouse before frost', duration = 30, seed = 42) => validateGenerateRequest({ topic, duration, seed });
function story(request, label = 'botanist') {
  return {
    title: `The ${label} adventure`, tone: 'dramatic',
    characters: [{ id: label, name: label, role: 'protagonist', color: '#123456' }],
    scenes: Array.from({ length: sceneCountFor(request.duration) }, (_, i) => ({
      duration: request.duration / sceneCountFor(request.duration), background: 'street',
      purpose: `${label} achieves milestone ${i + 1}`, action: `${label} completes unique event ${i + 1}`,
      narration: `Step ${i + 1} succeeds.`, camera: i % 2 ? 'close' : 'wide', cameraMotion: 'push_in',
      shotDescription: `Frame the ${label} and the changing environment.`, continuity: `Retain progress through step ${i + 1}.`,
      characters: [{ id: label, action: i % 2 ? 'run' : 'walk', emotion: 'happy' }],
    })),
  };
}
const response = (value, extra = {}) => ({ ok: true, status: 200, json: async () => value, ...extra });
const completion = (value, finish_reason = 'stop') => response({ choices: [{ finish_reason, message: { content: typeof value === 'string' ? value : JSON.stringify(value) } }] });
async function mockFetch(handler, work) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try { await work(); } finally { globalThis.fetch = original; }
}

test('endpoint canonicalization handles cloud and local base/full URLs without doubled v1', () => {
  for (const [input, expected] of [
    ['https://api.groq.com/openai/v1', 'https://api.groq.com/openai/v1/chat/completions'],
    ['https://example.test', 'https://example.test/v1/chat/completions'],
    ['http://localhost:8080/v1/', 'http://localhost:8080/v1/chat/completions'],
    ['http://localhost:8080/v1/chat/completions/', 'http://localhost:8080/v1/chat/completions'],
    ['https://example.test/chat/completions', 'https://example.test/chat/completions'],
    [' "https://example.test/v1" ', 'https://example.test/v1/chat/completions'],
  ]) assert.equal(completionEndpoint(input), expected);
  for (const input of ['bad', 'file:///tmp/x', 'https://user:secret@example.test/v1', 'https://example.test?key=secret']) {
    assert.throws(() => completionEndpoint(input), (error) => error.code === 'LLM_CONFIG' && !error.message.includes('secret'));
  }
});

test('configuration aliases, quotes and bounded voice settings preserve explicit providers', () => {
  const c = loadConfig({ LLAMA_URL: ' " http://127.0.0.1:8080/v1 " ', LLM_API_KEY: ' " local-key " ', ELEVENLABS_API_KEY: " 'voice-key' ", ELEVENLABS_STABILITY: ' "0.6" ', ELEVENLABS_SPEED: '4', ELEVENLABS_USE_SPEAKER_BOOST: ' "false" ' });
  assert.equal(c.llmApiKey, 'local-key'); assert.equal(c.elevenLabsApiKey, 'voice-key');
  assert.equal(c.llamaUrl, 'http://127.0.0.1:8080/v1');
  assert.equal(c.llmModel, '');
  assert.equal(c.elevenLabsStability, 0.6); assert.equal(c.elevenLabsSpeed, 1.2); assert.equal(c.elevenLabsUseSpeakerBoost, false);
  assert.equal(c.llmMaxTokens, 6000);
  assert.equal(loadConfig({ LLM_BASE_URL: 'http://custom.test/v1', LLAMA_URL: 'http://fallback.test/v1', LLM_API_KEY: 'explicit' }).llamaUrl, 'http://custom.test/v1');
  assert.equal(loadConfig({ GROQ_API: 'old', GROQ_API_KEY: 'new' }).llamaUrl, '');
  assert.equal(loadConfig({ GROQ_API_KEY: 'new' }).llmApiKey, '');
  assert.equal(loadConfig({ ELEVENLABS_API: 'old' }).elevenLabsApiKey, 'old');
});

test('unrelated user ideas and reroll seeds reach model and return their own content, never templates', async () => {
  const requests = [req('A botanist repairs a greenhouse before frost', 30, 1), req('A violinist negotiates passage aboard a lunar ferry', 30, 2), req('A violinist negotiates passage aboard a lunar ferry', 30, 3)];
  const labels = ['botanist', 'violinist', 'ferryman'];
  const calls = [];
  await mockFetch(async (url, init) => {
    const i = calls.length; calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    return completion(story(requests[i], labels[i]));
  }, async () => {
    const service = createScriptService({ llm: createLlm(config({ llmApiKey: 'secret' })) });
    const results = [];
    for (const request of requests) results.push(await service(request));
    for (let i = 0; i < requests.length; i++) {
      assert.equal(results[i].source, 'llm');
      assert.equal(results[i].project.characters[0].id, labels[i]);
      assert.ok(calls[i].body.messages[1].content.includes(requests[i].topic));
      assert.ok(calls[i].body.messages[1].content.includes(`Variation id: ${requests[i].seed}`));
      assert.ok(calls[i].body.max_tokens >= 4096);
      assert.equal(results[i].project.scenes[0].cameraMotion, 'push_in');
    }
    assert.notDeepEqual(results[1].project, results[2].project);
    assert.notEqual(calls[1].body.messages[1].content, calls[2].body.messages[1].content);
    assert.equal(calls[0].headers.authorization, 'Bearer secret');
  });
});

test('15/30/60 second model stories fit exact runtime and dynamic voice budgets', async () => {
  for (const duration of [15, 30, 60]) {
    const request = req(undefined, duration);
    await mockFetch(async (_, init) => {
      const body = JSON.parse(init.body);
      assert.ok(body.messages[1].content.includes(`at most ${Math.floor(duration / sceneCountFor(duration) * 2.2)} whitespace-separated words`));
      return completion(story(request));
    }, async () => {
      const { project } = await createLlm(config()).generateScript(request);
      assert.ok(Math.abs(project.scenes.reduce((sum, s) => sum + s.duration, 0) - duration) < 1e-8);
      assert.ok(project.scenes.every((s) => s.narration.split(/\s+/).length <= Math.floor(s.duration * 2.2 + 0.0001)));
    });
  }
});

test('normalization retains authored repeats, full edited voiceover and direction without looping', () => {
  const narration = 'The author deliberately wrote this longer narration and it must never be shortened to fit a generation-only word budget. '.repeat(3).trim();
  const scene = { narration, duration: 2, direction: { purpose: 'Return to the same place intentionally', action: 'Pause and listen', camera: 'close', cameraMotion: 'pan_left', continuity: 'Keep the letter' } };
  const project = normalizeProject({ duration: 60, scenes: [scene, scene] });
  assert.equal(project.scenes.length, 2); assert.equal(project.scenes[0].narration, narration);
  assert.equal(project.scenes[0].camera, 'close'); assert.equal(project.scenes[0].cameraMotion, 'pan_left');
  assert.equal(project.scenes[0].continuity, 'Keep the letter');
  assert.ok(project.warnings.some((warning) => /preserved as authored/.test(warning)));
  assert.equal(project.scenes.reduce((sum, s) => sum + s.duration, 0), 60);
});

test('model duplicates, invalid JSON, truncation and overlong voiceover fail explicitly after bounded repair', async () => {
  for (const type of ['duplicate', 'json', 'truncated', 'overlong']) {
    let calls = 0;
    const request = req(); const data = story(request);
    if (type === 'duplicate') data.scenes[1] = { ...data.scenes[0] };
    if (type === 'overlong') data.scenes[0].narration = 'This is an extremely long narration that cannot possibly fit within a single short five second scene at a natural speaking rate.';
    await mockFetch(async () => { calls++; return completion(type === 'json' ? '{broken' : data, type === 'truncated' ? 'length' : 'stop'); }, async () => {
      await assert.rejects(createScriptService({ llm: createLlm(config()) })(request), (error) => error instanceof ScriptError && error.code === 'LLM_INVALID_STORY' && error.retryable);
      assert.equal(calls, 2);
    });
  }
});

test('one invalid response can be repaired by actual model content', async () => {
  let calls = 0; const request = req();
  await mockFetch(async () => ++calls === 1 ? completion('not JSON') : completion(story(request)), async () => {
    assert.equal((await createLlm(config()).generateScript(request)).source, 'llm');
    assert.equal(calls, 2);
  });
});

test('instruction echo is rejected but an ordinary premise sentence is permitted', async () => {
  const request = req('Create a story about a botanist who repairs the greenhouse', 60);
  const data = story(request); data.scenes[0].narration = 'Create a story about plants.';
  await mockFetch(async () => completion(data), async () => {
    await assert.rejects(createLlm(config()).generateScript(request), (error) => error.code === 'LLM_INVALID_STORY' && /instructions/.test(error.message));
  });
  const ordinary = req('A botanist repairs a greenhouse.', 30);
  const valid = story(ordinary); valid.scenes[0].narration = ordinary.topic;
  await mockFetch(async () => completion(valid), async () => {
    assert.equal((await createLlm(config()).generateScript(ordinary)).project.scenes[0].narration, ordinary.topic);
  });
});

test('missing configuration and disabled model never invoke fetch or fallback templates', async () => {
  await mockFetch(() => { throw new Error('Must not call'); }, async () => {
    for (const [c, code] of [[loadConfig({}), 'LLM_NOT_CONFIGURED'], [config({ llmEnabled: false }), 'LLM_DISABLED'], [config({ llamaUrl: 'not-a-url' }), 'LLM_CONFIG']]) {
      await assert.rejects(createScriptService({ llm: createLlm(c) })(req()), (error) => error.code === code && !error.retryable);
    }
  });
});

test('provider failures are safe, actionable, classified and never leak response secrets', async () => {
  for (const [status, code, count] of [[401, 'LLM_AUTH', 1], [403, 'LLM_AUTH', 1], [404, 'LLM_MODEL_NOT_FOUND', 1], [400, 'LLM_PROVIDER_REQUEST', 1], [500, 'LLM_PROVIDER', 2]]) {
    let calls = 0;
    const llm = createLlm(config({ llmApiKey: 'super-secret' }));
    await mockFetch(async () => { calls++; return response({ error: 'super-secret' }, { ok: false, status }); }, async () => {
      await assert.rejects(llm.generateScript(req()), (error) => error.code === code && !error.message.includes('super-secret'));
      assert.equal(calls, count);
      assert.ok(!JSON.stringify(llm.status()).includes('super-secret'));
      if (status === 401 || status === 403) assert.equal(llm.status().authenticated, false);
    });
  }
});

test('rate limit honors cooldown without repeated requests; diagnostic recovery uses GET models', async () => {
  let calls = 0;
  const llm = createLlm(config({ llmApiKey: 'secret' }));
  await mockFetch(async (_, init) => {
    calls++;
    if (init.method === 'GET') return response({ data: [{ id: 'openai/gpt-oss-20b' }] });
    return response({}, { ok: false, status: 429, headers: { get: () => '5' } });
  }, async () => {
    await assert.rejects(llm.generateScript(req()), (error) => error.code === 'LLM_RATE_LIMIT' && error.retryAfterMs === 5000);
    await assert.rejects(llm.generateScript(req()), (error) => error.code === 'LLM_COOLDOWN' && error.retryAfterMs > 0);
    assert.equal(calls, 1);
    const status = await llm.checkConnection();
    assert.equal(calls, 2); assert.equal(status.authenticated, true); assert.equal(status.lastError, null);
  });
});

test('network failure and timeout are sanitized and bounded', async () => {
  for (const timeout of [false, true]) {
    let calls = 0;
    await mockFetch(async () => { calls++; const error = new Error('https://secret-key.invalid'); if (timeout) error.name = 'AbortError'; throw error; }, async () => {
      await assert.rejects(createLlm(config()).generateScript(req()), (error) => error.code === (timeout ? 'LLM_TIMEOUT' : 'LLM_NETWORK') && !error.message.includes('secret-key'));
      assert.equal(calls, 2);
    });
  }
});

test('prompt improvement and enhancement are actual model calls; plan project preserves scene directions', async () => {
  const request = req(); let calls = 0;
  const improved = 'Scene 1: The botanist finds a frozen valve. Scene 2: She reroutes warm water. Scene 3: The greenhouse recovers before sunrise.';
  await mockFetch(async () => ++calls === 1 ? completion(improved) : completion(story(request)), async () => {
    const llm = createLlm(config());
    assert.equal(await llm.improvePrompt(request.topic), improved);
    const plan = await llm.enhancePrompt(request);
    assert.equal(plan.project.scenes, plan.scenes);
    assert.ok(plan.enhancedPrompt.includes('Action: botanist completes unique event 1'));
    assert.ok(plan.enhancedPrompt.includes('Camera: wide, push_in'));
    assert.equal(calls, 2);
  });
  await assert.rejects(createLlm(loadConfig({})).improvePrompt('a new idea'), (error) => error.code === 'LLM_NOT_CONFIGURED');
});
