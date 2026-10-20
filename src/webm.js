// Real-time browser fallback using the same natural narration timing as MP4.
import { canvasSize, drawProject, locate, totalSeconds } from './render.js';
import { adjustProjectForAudio, fitNarrationTiming } from '../shared/audio-timing.js';

export function webmSupported() {
  return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement !== 'undefined'
    && !!HTMLCanvasElement.prototype.captureStream && MediaRecorder.isTypeSupported('video/webm');
}
function metadata(audio) {
  if (audio.readyState >= 1 && Number.isFinite(audio.duration) && audio.duration > 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = (error) => { clearTimeout(timer); audio.removeEventListener('loadedmetadata', ready); audio.removeEventListener('error', failed); error ? reject(error) : resolve(); };
    const ready = () => finish(Number.isFinite(audio.duration) && audio.duration > 0 ? null : new Error('Narration has invalid audio duration.'));
    const failed = () => finish(new Error('Narration could not be decoded.'));
    const timer = setTimeout(() => finish(new Error('Narration metadata timed out. Please retry.')), 15000);
    audio.addEventListener('loadedmetadata', ready); audio.addEventListener('error', failed); audio.load();
  });
}

/** Metadata is loaded before timing/recording; complete narration is retained.
 * onProjectTiming(adjustedProject) receives changed scene durations for the UI. */
export async function recordWebm(project, { fps = 24, subs, narration = true, onProgress = () => {}, onProjectTiming = () => {} } = {}) {
  if (!webmSupported()) throw new Error('This browser does not support WebM recording. Use server MP4 export.');
  const { W, H } = canvasSize(project.aspectRatio, 720);
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d'), voiceTracks = new Map();
  let videoStream, stream, audioContext, raf, recorder, finished = false;
  const cleanup = () => {
    cancelAnimationFrame(raf);
    for (const { audio, url } of voiceTracks.values()) { audio.pause(); URL.revokeObjectURL(url); }
    if (audioContext && audioContext.state !== 'closed') audioContext.close().catch(() => {});
    for (const track of stream?.getTracks() || videoStream?.getTracks() || []) track.stop();
  };
  try {
    const durations = [];
    let destination;
    if (narration && project.narration) {
      audioContext = new AudioContext(); await audioContext.resume();
      destination = audioContext.createMediaStreamDestination();
      for (let i = 0; i < project.scenes.length; i++) {
        const scene = project.scenes[i]; if (!scene.narration?.trim()) continue;
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 120000);
        try {
          const response = await fetch('/api/voice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: scene.narration, language: project.language }), signal: controller.signal });
          if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || `Voice narration unavailable (${response.status})`); }
          const blob = await response.blob(); if (blob.size < 44) throw new Error('Narration returned empty audio.');
          const url = URL.createObjectURL(blob), audio = new Audio(url); audio.preload = 'auto';
          voiceTracks.set(i, { audio, url });
          await metadata(audio); // Never compute playback rates using NaN metadata.
          durations[i] = audio.duration + 0.04;
          const source = audioContext.createMediaElementSource(audio);
          source.connect(destination); source.connect(audioContext.destination);
        } finally { clearTimeout(timer); }
      }
    }
    const adjusted = adjustProjectForAudio(project, durations, { fps });
    if (adjusted.scenes.some((scene, i) => Math.abs(scene.duration - project.scenes[i].duration) > 1e-6)) onProjectTiming(adjusted);
    project = adjusted;
    const total = totalSeconds(project);
    videoStream = canvas.captureStream(fps);
    stream = destination ? new MediaStream([...videoStream.getVideoTracks(), ...destination.stream.getAudioTracks()]) : videoStream;
    recorder = new MediaRecorder(stream, { mimeType: 'video/webm', videoBitsPerSecond: 2_500_000 });
    const chunks = [];
    return await new Promise((resolve, reject) => {
      const fail = (error) => {
        if (finished) return; finished = true;
        if (recorder.state !== 'inactive') recorder.stop();
        cleanup(); reject(error);
      };
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => fail(new Error('Browser video recording failed. Try server MP4 export.'));
      recorder.onstop = () => { if (finished) return; finished = true; cleanup(); resolve(new Blob(chunks, { type: 'video/webm' })); };
      drawProject(ctx, project, 0, W, H, subs); recorder.start(250);
      const startedAt = performance.now(), frameMs = 1000 / fps;
      let last = -frameMs, voiceScene = -1;
      const tick = async (now) => {
        if (finished) return;
        try {
          const elapsed = (now - startedAt) / 1000, time = Math.min(elapsed, total);
          if (now - last >= frameMs * 0.9) {
            drawProject(ctx, project, time, W, H, subs);
            const at = locate(project, time);
            if (at.index !== voiceScene) {
              for (const { audio } of voiceTracks.values()) audio.pause();
              voiceScene = at.index;
              const voice = voiceTracks.get(at.index);
              if (voice) {
                const rate = fitNarrationTiming(project.scenes[at.index].duration, voice.audio.duration + 0.04).playbackRate;
                voice.audio.playbackRate = rate; voice.audio.preservesPitch = true;
                if (at.local * rate < voice.audio.duration) { voice.audio.currentTime = Math.max(0, at.local * rate); await voice.audio.play(); }
              }
            }
            last = now; onProgress(Math.min(1, elapsed / total));
          }
          if (elapsed < total) raf = requestAnimationFrame(tick);
          else { drawProject(ctx, project, total, W, H, subs); recorder.stop(); }
        } catch (error) { fail(new Error(`Narrated WebM export failed: ${error.message || 'audio playback failed'}`)); }
      };
      raf = requestAnimationFrame(tick);
    });
  } catch (error) { cleanup(); throw error; }
}
