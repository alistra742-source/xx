import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitNarrationTiming, adjustProjectForAudio } from '../shared/audio-timing.js';

test('natural timing never speeds above 1.2 or cuts complete narration', () => {
  assert.deepEqual(fitNarrationTiming(10, 8), { duration: 10, playbackRate: 1, extended: false });
  assert.equal(fitNarrationTiming(10, 11).playbackRate, 1.1);
  const long = fitNarrationTiming(5, 20, { fps: 12 });
  assert.equal(long.playbackRate, 1.2);
  assert.ok(long.duration >= 20 / 1.2);
  assert.ok(long.extended);
  assert.equal(long.duration * 12, Math.round(long.duration * 12));
  assert.equal(fitNarrationTiming(5, 20, { maxSpeed: 99 }).playbackRate, 1.2);
});
test('project adjustment is immutable and totals actual scene lengths', () => {
  const project = { duration: 10, scenes: [{ duration: 5, narration: 'a' }, { duration: 5 }] };
  const adjusted = adjustProjectForAudio(project, [18, 0]);
  assert.equal(adjusted.scenes[0].duration, 15);
  assert.equal(adjusted.duration, 20);
  assert.equal(project.scenes[0].duration, 5);
  assert.throws(() => fitNarrationTiming(0, 5), RangeError);
});
