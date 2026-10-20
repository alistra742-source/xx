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
export function recordWebm(project, { fps = 24, subs, onProgress = () => {} } = {}) {
  const { W, H } = canvasSize(project.aspectRatio, 720);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const total = totalSeconds(project);
  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm', videoBitsPerSecond: 2_500_000 });
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

  return new Promise((resolve, reject) => {
    recorder.onerror = (e) => reject(new Error(`Recording failed: ${e.error?.message || 'unknown error'}`));
    recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
    drawProject(ctx, project, 0, W, H, subs);
    recorder.start(250);
    const startedAt = performance.now();
    const frameMs = 1000 / fps;
    let last = -frameMs;
    const tick = (now) => {
      const elapsed = (now - startedAt) / 1000;
      if (now - last >= frameMs * 0.9) {
        drawProject(ctx, project, Math.min(elapsed, total), W, H, subs);
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
