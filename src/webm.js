// Browser WebM fallback. Used only when the server cannot render MP4 (no ffmpeg).
// It records the animation in real time, so it takes as long as the video.
import { canvasSize, drawProject, totalSeconds } from './render.js';

export function webmSupported() {
  return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement !== 'undefined'
    && !!HTMLCanvasElement.prototype.captureStream && MediaRecorder.isTypeSupported('video/webm');
}

/**
 * @param {object} project normalized project
 * @param {object} opts { fps, subs, onProgress(0..1) }
 * @returns {Promise<Blob>}
 */
export async function recordWebm(project, { fps = 24, subs, narration = true, onProgress = () => {} } = {}) {
  const { W, H } = canvasSize(project.aspectRatio, 720);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const total = totalSeconds(project);
  const videoStream = canvas.captureStream(fps);
  let stream = videoStream;
  let audioContext = null;
  const voiceTracks = new Map();

  // Prepare real narration audio from the same server TTS provider used by MP4.
  if (narration && project.narration) {
    audioContext = new AudioContext();
    await audioContext.resume();
    const destination = audioContext.createMediaStreamDestination();
    try {
      for (let i = 0; i < project.scenes.length; i++) {
        const scene = project.scenes[i];
        if (!scene.narration?.trim()) continue;
        const response = await fetch('/api/voice', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: scene.narration, language: project.language }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || `Voice narration unavailable (${response.status})`);
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.preload = 'auto';
        const source = audioContext.createMediaElementSource(audio);
        source.connect(destination);
        source.connect(audioContext.destination);
        voiceTracks.set(i, { audio, url });
      }
    } catch (err) {
      for (const { audio, url } of voiceTracks.values()) { audio.pause(); URL.revokeObjectURL(url); }
      await audioContext.close();
      throw err;
    }
    stream = new MediaStream([...videoStream.getVideoTracks(), ...destination.stream.getAudioTracks()]);
  }

  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm', videoBitsPerSecond: 2_500_000 });
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      for (const { audio, url } of voiceTracks.values()) {
        audio.pause();
        URL.revokeObjectURL(url);
      }
      audioContext?.close();
      for (const track of stream.getTracks()) track.stop();
    };
    recorder.onerror = (e) => { cleanup(); reject(new Error(`Recording failed: ${e.error?.message || 'unknown error'}`)); };
    recorder.onstop = () => { cleanup(); resolve(new Blob(chunks, { type: 'video/webm' })); };
    drawProject(ctx, project, 0, W, H, subs);
    recorder.start(250);
    const startedAt = performance.now();
    const frameMs = 1000 / fps;
    let last = -frameMs;
    let voiceScene = -1;
    const tick = (now) => {
      const elapsed = (now - startedAt) / 1000;
      if (now - last >= frameMs * 0.9) {
        const time = Math.min(elapsed, total);
        drawProject(ctx, project, time, W, H, subs);
        if (voiceTracks.size) {
          let sceneStart = 0;
          let idx = project.scenes.length - 1;
          for (let i = 0; i < project.scenes.length; i++) {
            if (time < sceneStart + project.scenes[i].duration || i === project.scenes.length - 1) { idx = i; break; }
            sceneStart += project.scenes[i].duration;
          }
          if (idx !== voiceScene) {
            for (const { audio } of voiceTracks.values()) audio.pause();
            voiceScene = idx;
            const voice = voiceTracks.get(idx);
            if (voice) {
              voice.audio.currentTime = Math.max(0, time - sceneStart);
              voice.audio.play().catch(() => {});
            }
          }
        }
        last = now;
        onProgress(Math.min(1, elapsed / total));
      }
      if (elapsed < total) requestAnimationFrame(tick);
      else {
        drawProject(ctx, project, total, W, H, subs);
        setTimeout(() => recorder.stop(), 150);
      }
    };
    requestAnimationFrame(tick);
  });
}
