// Shared by live playback, WebM and server MP4. Never cut narration to fit.
export const MAX_NARRATION_SPEED = 1.2;
export function fitNarrationTiming(sceneSeconds, audioSeconds, { maxSpeed = MAX_NARRATION_SPEED, fps } = {}) {
  const original = Number(sceneSeconds);
  if (!Number.isFinite(original) || original <= 0) throw new RangeError('Scene duration must be positive.');
  const audio = Number(audioSeconds);
  const limit = Math.max(1, Math.min(MAX_NARRATION_SPEED, Number(maxSpeed) || MAX_NARRATION_SPEED));
  const playbackRate = Number.isFinite(audio) && audio > 0 ? Math.min(limit, Math.max(1, audio / original)) : 1;
  let duration = Math.max(original, Number.isFinite(audio) && audio > 0 ? audio / playbackRate : original);
  if (Number.isFinite(fps) && fps > 0) duration = Math.ceil((duration - 1e-9) * fps) / fps;
  return { duration, playbackRate, extended: duration > original + 1e-6 };
}
export function adjustProjectForAudio(project, audioDurations = [], options = {}) {
  const scenes = project.scenes.map((scene, i) => ({ ...scene, duration: fitNarrationTiming(scene.duration, audioDurations[i], options).duration }));
  return { ...project, scenes, duration: scenes.reduce((sum, scene) => sum + scene.duration, 0) };
}
