// Browser-side frame drawing shared by the live preview and the WebM fallback.
import { ASPECT_RATIOS } from '../shared/constants.js';
import { renderFrame } from '../shared/renderer.js';
import { subtitleCues } from '../shared/subtitles.js';

/** Preview / WebM canvas size: short side is `short` pixels. */
export function canvasSize(aspectRatio, short = 540) {
  const r = ASPECT_RATIOS[aspectRatio] ?? ASPECT_RATIOS['9:16'];
  const even = (n) => Math.max(2, Math.round(n / 2) * 2);
  if (r.w === r.h) return { W: even(short), H: even(short) };
  if (r.w < r.h) return { W: even(short), H: even((short * r.h) / r.w) };
  return { W: even((short * r.w) / r.h), H: even(short) };
}

export function totalSeconds(project) {
  return project.scenes.reduce((s, sc) => s + sc.duration, 0);
}

/** Map a global time to { index, local } across scenes. */
export function locate(project, t) {
  let start = 0;
  for (let i = 0; i < project.scenes.length; i++) {
    const d = project.scenes[i].duration;
    if (t < start + d || i === project.scenes.length - 1) return { index: i, local: Math.max(0, Math.min(d, t - start)) };
    start += d;
  }
  return { index: 0, local: 0 };
}

const cueCache = new WeakMap();

/** Subtitle style scaled so text looks the same at any resolution (settings are for a 720px short side). */
export function subtitleStyle(subs, W, H) {
  const k = Math.min(W, H) / 720;
  return {
    position: subs.position ?? 'bottom',
    size: Math.max(8, Math.round((subs.size ?? 30) * k)),
    color: subs.color ?? '#ffffff',
    outlineColor: subs.outlineColor ?? '#000000',
    outlineWidth: Math.round((subs.outlineWidth ?? 4) * k),
  };
}

/** Draw the frame at global time t. */
export function drawProject(ctx, project, t, W, H, subs) {
  const { index, local } = locate(project, t);
  const sc = project.scenes[index];
  let cues = cueCache.get(sc);
  if (!cues) {
    cues = sc.narration ? subtitleCues(sc.narration, 0, sc.duration) : [];
    cueCache.set(sc, cues);
  }
  const cue = cues.find((c) => local >= c.start && local < c.end);
  renderFrame(ctx, sc, local, {
    W, H,
    projectCharacters: project.characters,
    subtitle: { ...subtitleStyle(subs, W, H), enabled: subs.enabled !== false, text: cue?.text ?? '' },
  });
  return index;
}
