// Subtitle segmentation: split narration into short readable lines and spread
// them over a time span proportionally to their length.

/** Break text into sentences, then wrap long sentences so no line exceeds maxChars. */
export function splitNarration(text, maxChars = 40) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?…]+[.!?…]*["')\]]*/g) ?? [clean];
  const lines = [];
  for (const sentence of sentences) {
    const words = sentence.trim().split(' ').filter(Boolean);
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > maxChars && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

/**
 * Distribute segments across [start, end] by character weight.
 * Returns [{ text, start, end }] with contiguous, non-overlapping times.
 */
export function timeSubtitles(segments, start, end) {
  if (!segments.length || end <= start) return [];
  const weights = segments.map((s) => Math.max(1, s.length));
  const total = weights.reduce((a, b) => a + b, 0);
  let cursor = start;
  return segments.map((text, i) => {
    const segStart = cursor;
    cursor = i === segments.length - 1 ? end : cursor + ((end - start) * weights[i]) / total;
    return { text, start: segStart, end: cursor };
  });
}

/** Convenience: narration text -> timed subtitle cues within [start, end]. */
export function subtitleCues(text, start, end, maxChars = 40) {
  return timeSubtitles(splitNarration(text, maxChars), start, end);
}
