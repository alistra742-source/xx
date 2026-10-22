import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playbackOrder, pendingChoice } from '../shared/choices.js';

const choice = (a, b) => ({ prompt: 'Tell?', options: [{ label: 'Yes', goto: a }, { label: 'No', goto: b }] });
const story = [
  { id: 's1', choice: choice(1, 2) },
  { id: 's2' },
  { id: 's3' },
  { id: 's4' },
];

test('playbackOrder waits at a choice until the viewer picks', () => {
  assert.deepEqual(playbackOrder(story), [0]);
  assert.equal(pendingChoice(story), 0);
});

test('playbackOrder follows the chosen branch', () => {
  assert.deepEqual(playbackOrder(story, { 0: 0 }), [0, 1, 2, 3]);
  assert.deepEqual(playbackOrder(story, { 0: 1 }), [0, 2, 3]);
  assert.equal(pendingChoice(story, { 0: 1 }), -1);
});

test('playbackOrder stops at a scene that jumps to the end', () => {
  const ending = [{ choice: { prompt: 'x', options: [{ label: 'a', goto: 1 }, { label: 'b', goto: 1 }] } }, { id: 'end' }];
  assert.deepEqual(playbackOrder(ending, { 0: 0 }), [0, 1]);
});
