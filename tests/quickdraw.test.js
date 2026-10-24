import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQuickDrawLibrary, drawingBounds } from '../shared/quickdraw.js';
import { parseDrawingLines, slugify } from '../scripts/fetch-quickdraw.mjs';

const cat = { word: 'cat', drawing: [[[10, 50], [20, 60]]] };
const dog = { word: 'dog', drawing: [[[1, 2, 3], [4, 5, 6]]] };

test('library drops empty classes and reports counts', () => {
  const lib = createQuickDrawLibrary({ cat: [cat, dog], empty: [], broken: [{ word: 'x', drawing: [] }] });
  assert.deepEqual(lib.classNames(), ['cat']);
  assert.equal(lib.drawingCount('cat'), 2);
  assert.equal(lib.drawingCount('empty'), 0);
});

test('picks are deterministic and wrap around the list', () => {
  const lib = createQuickDrawLibrary({ cat: [cat, dog] });
  assert.equal(lib.pick('cat', 0), cat);
  assert.equal(lib.pick('cat', 1), dog);
  assert.equal(lib.pick('cat', 2), cat);
  assert.equal(lib.pick('cat', -1), dog);
  assert.equal(lib.pick('cat', 7), dog);
});

test('unknown classes throw a clear error', () => {
  const lib = createQuickDrawLibrary({ cat: [cat] });
  assert.throws(() => lib.pick('owl'), /Unknown class: owl/);
});

test('drawing bounds cover every point', () => {
  assert.deepEqual(drawingBounds(dog.drawing), { minX: 1, minY: 4, maxX: 3, maxY: 6 });
});

test('range parsing drops a truncated final line and malformed rows', () => {
  const text = [
    JSON.stringify({ word: 'cat', drawing: [[[1], [2]]] }),
    'not json',
    JSON.stringify({ word: 'cat', drawing: [] }),
    JSON.stringify({ word: 'cat', drawing: [[[3], [4]]] }),
    '{"word":"ca',
  ].join('\n');
  const rows = parseDrawingLines(text, 10);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1].drawing, [[[3], [4]]]);
});

test('parsing respects the per-class limit and keeps a complete final line', () => {
  const text = [1, 2, 3].map((n) => JSON.stringify({ word: 'cat', drawing: [[[n], [n]]] })).join('\n');
  assert.equal(parseDrawingLines(text, 2).length, 2);
  assert.equal(parseDrawingLines(text, 10, { complete: true }).length, 3);
});

test('slugify gives filesystem-safe class names', () => {
  assert.equal(slugify('The Eiffel Tower'), 'the-eiffel-tower');
  assert.equal(slugify('  smiley face!! '), 'smiley-face');
});
