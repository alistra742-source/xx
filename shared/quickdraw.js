// Indexes cached Quick, Draw! samples (see scripts/fetch-quickdraw.mjs).
// Each drawing is strokes: [[xs], [ys]][] on a 256x256 grid.

export function createQuickDrawLibrary(classes) {
  const byName = new Map();
  for (const [name, drawings] of Object.entries(classes)) {
    const valid = (drawings || []).filter((d) => Array.isArray(d.drawing) && d.drawing.length);
    if (valid.length) byName.set(name, valid);
  }
  return {
    classNames: () => [...byName.keys()],
    drawingCount: (name) => byName.get(name)?.length ?? 0,
    // Deterministic pick: the same seed always gives the same drawing.
    pick(name, seed = 0) {
      const list = byName.get(name);
      if (!list) throw new RangeError(`Unknown class: ${name}`);
      const index = ((Math.floor(seed) % list.length) + list.length) % list.length;
      return list[index];
    },
  };
}

// Strokes are [[x...], [y...]]. Returns bounds over every point.
export function drawingBounds(drawing) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [xs, ys] of drawing) {
    for (let i = 0; i < xs.length; i += 1) {
      minX = Math.min(minX, xs[i]); maxX = Math.max(maxX, xs[i]);
      minY = Math.min(minY, ys[i]); maxY = Math.max(maxY, ys[i]);
    }
  }
  return { minX, minY, maxX, maxY };
}
