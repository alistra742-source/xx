import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/index.js';

test('HTTP API writes a built-in storyboard without a model and reports missing voice honestly', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'story-api-test-'));
  const { server } = await createApp({ outputDir: dir, llamaUrl: '', llmApiKey: '', llmEnabled: true, ttsProvider: 'auto', elevenLabsApiKey: '' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const root = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body) => fetch(`${root}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const config = await (await fetch(`${root}/api/config`)).json();
    assert.equal(config.llm.enabled, false);
    assert.equal(config.narration.available, false);
    assert.equal(config.deployment.generationMode, 'ai-with-instant-fallback');
    for (const path of ['/api/script', '/api/prompt/enhance']) {
      const res = await post(path, { topic: 'A violinist repairs a broken bridge with music', duration: 30 });
      assert.equal(res.status, 200, `${path} must write a storyboard instead of dead-ending on configuration`);
      const data = await res.json();
      assert.equal(data.source, 'instant');
      assert.equal(data.project.scenes.length, 6);
      assert.ok(data.project.scenes.every((scene) => scene.action && scene.narration));
    }
    const improve = await (await post('/api/improve-prompt', { topic: 'A violinist repairs a broken bridge' })).json();
    assert.equal(improve.source, 'instant');
    assert.ok(improve.prompt.length > 10);
    const voice = await post('/api/voice', { text: 'The music carries across the river.' });
    assert.equal(voice.status, 503);
    assert.match((await voice.json()).error, /ELEVENLABS/);
    const health = await (await fetch(`${root}/api/health`)).json();
    assert.equal(health.ok, true, 'missing paid providers must not break Railway health checks');
    const diagnostics = await (await post('/api/diagnostics', {})).json();
    assert.equal(diagnostics.llm.authenticated, null);
    assert.equal(JSON.stringify(diagnostics).includes('apiKey'), false);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
