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

/**
 * Group word timings into caption cues of at most maxChars, each spanning the
 * real start of its first word to the end of its last word. Times are offset by
 * `start` and clamped to [start, end].
 * words: [{ text, start, end }] in seconds relative to the audio.
 */
export function wordCues(words, start, end, maxChars = 40) {
  const usable = (words ?? []).filter((w) => w && String(w.text ?? '').trim() && Number.isFinite(w.start) && Number.isFinite(w.end));
  if (!usable.length || end <= start) return [];
  const cues = [];
  let group = [];
  const flush = () => {
    if (!group.length) return;
    const text = group.map((w) => String(w.text).trim()).join(' ');
    const s = Math.min(end, start + group[0].start);
    const e = Math.min(end, start + Math.max(group[group.length - 1].end, group[0].start + 0.01));
    cues.push({ text, start: s, end: e });
    group = [];
  };
  for (const word of usable) {
    const candidate = [...group, word].map((w) => String(w.text).trim()).join(' ');
    if (candidate.length > maxChars && group.length) flush();
    group.push(word);
  }
  flush();
  // Each cue stays on screen until the next one begins, so there are no gaps
  // between lines and the final cue ends with the scene.
  for (let i = 0; i < cues.length - 1; i++) cues[i].end = Math.max(cues[i].end, cues[i + 1].start);
  cues[cues.length - 1].end = end;
  return cues;
}

/**
 * Cues for one scene. Uses real word timings when present (scaled by the audio
 * playback rate, since narration is time-stretched to fit the scene), else the
 * even split by character count.
 */
export function sceneCues({ text, duration, words, rate }, maxChars = 40) {
  if (!words?.length || !(rate > 0)) return subtitleCues(text, 0, duration, maxChars);
  return wordCues(words.map((w) => ({ text: w.text, start: w.start / rate, end: w.end / rate })), 0, duration, maxChars);
}

/** Convenience: narration text -> timed subtitle cues within [start, end]. */
export function subtitleCues(text, start, end, maxChars = 40) {
  return timeSubtitles(splitNarration(text, maxChars), start, end);
}
