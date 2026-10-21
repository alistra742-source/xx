import test from 'node:test';
import assert from 'node:assert/strict';
import { MISSING_API_MESSAGE, configProblem, isStudioConfig } from '../shared/client-config.js';

test('a static-only deployment response is rejected', () => {
  // Vite's index.html arrives when /api/config is missing (SPA fallback).
  assert.equal(configProblem('<!doctype html><html></html>'), MISSING_API_MESSAGE);
  assert.equal(configProblem(undefined), MISSING_API_MESSAGE);
  assert.equal(configProblem(null), MISSING_API_MESSAGE);
  assert.equal(configProblem([]), MISSING_API_MESSAGE);
});

test('an empty object from a non-JSON reply is rejected', () => {
  assert.equal(configProblem({}), MISSING_API_MESSAGE);
  assert.equal(isStudioConfig({}), false);
});

test('config missing the provider blocks is rejected', () => {
  assert.equal(configProblem({ llm: { enabled: true } }), MISSING_API_MESSAGE);
  assert.equal(configProblem({ narration: { available: false } }), MISSING_API_MESSAGE);
  assert.equal(configProblem({ llm: null, narration: {} }), MISSING_API_MESSAGE);
});

test('a real config payload passes', () => {
  const config = {
    llm: { provider: 'local', enabled: true, authenticated: null },
    narration: { provider: 'unavailable', available: false },
    ffmpeg: false,
    actions: ['wave'],
    backgrounds: ['office'],
    defaultResolution: 720,
    defaultFps: 24,
  };
  assert.equal(configProblem(config), null);
  assert.equal(isStudioConfig(config), true);
});
