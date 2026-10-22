import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sceneCues, wordCues, subtitleCues } from '../shared/subtitles.js';

test('wordCues groups words into lines using their real timings', () => {
  const words = [
    { text: 'The', start: 0.0, end: 0.3 },
    { text: 'alarms', start: 0.3, end: 0.8 },
    { text: 'woke', start: 0.8, end: 1.1 },
    { text: 'him', start: 1.1, end: 1.4 },
  ];
  const cues = wordCues(words, 2, 6, 12);
  assert.deepEqual(cues.map((c) => c.text), ['The alarms', 'woke him']);
  assert.equal(cues[0].start, 2);
  assert.equal(cues[1].end, 6);
  assert.ok(Math.abs(cues[0].end - cues[1].start) < 1e-9);
});

test('wordCues keeps every line within maxChars unless a single word is longer', () => {
  const words = 'one two three four five six seven'.split(' ').map((text, i) => ({ text, start: i * 0.5, end: i * 0.5 + 0.4 }));
  const cues = wordCues(words, 0, 10, 10);
  for (const cue of cues) assert.ok(cue.text.length <= 10, cue.text);
  assert.equal(cues.map((c) => c.text).join(' '), 'one two three four five six seven');
});

test('wordCues ignores empty words and clamps times to the scene', () => {
  const cues = wordCues([{ text: ' ', start: 0, end: 0.1 }, { text: 'hi', start: 0, end: 5 }], 0, 2, 40);
  assert.equal(cues.length, 1);
  assert.equal(cues[0].end, 2);
});

test('wordCues returns nothing without usable timings', () => {
  assert.deepEqual(wordCues([], 0, 5), []);
  assert.deepEqual(wordCues([{ text: 'x', start: NaN, end: 1 }], 0, 5), []);
});

test('sceneCues scales word timings by the audio playback rate', () => {
  const words = [{ text: 'Hello', start: 0, end: 1 }, { text: 'there', start: 1, end: 2 }];
  const cues = sceneCues({ text: 'Hello there', duration: 2, words, rate: 2 }, 40);
  assert.deepEqual(cues.map((c) => c.text), ['Hello there']);
  assert.equal(cues[0].start, 0);
  assert.equal(cues[0].end, 2);
  const split = sceneCues({ text: 'Hello there', duration: 4, words, rate: 2 }, 5);
  assert.deepEqual(split.map((c) => c.text), ['Hello', 'there']);
  assert.ok(Math.abs(split[1].start - 0.5) < 1e-9);
});

test('sceneCues falls back to the even split without word timings', () => {
  const cues = sceneCues({ text: 'First line here. Second line.', duration: 4 }, 40);
  assert.equal(cues.length, 2);
  assert.equal(cues[1].end, 4);
});

test('subtitleCues still splits text across the span when no timings exist', () => {
  const cues = subtitleCues('First line here. Second line.', 0, 4, 40);
  assert.equal(cues.length, 2);
  assert.equal(cues[1].end, 4);
});
