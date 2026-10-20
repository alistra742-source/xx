// MP4 exporter. Frames are rendered one at a time on a single reused canvas and
// streamed as raw RGBA into ffmpeg (no frames are kept in memory). Scenes are
// rendered sequentially. Narration (if any) is built per scene and muxed once.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, open, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { ASPECT_RATIOS } from '../shared/constants.js';
import { renderFrame } from '../shared/renderer.js';
import { subtitleCues } from '../shared/subtitles.js';
import { fitNarrationTiming } from '../shared/audio-timing.js';
// Subtitle style scaling is shared with the browser preview (pure function, no DOM).
import { subtitleStyle } from '../src/render.js';

export class ExportError extends Error {}
export class ExportCancelled extends Error {
  constructor() { super('Export was cancelled.'); this.name = 'AbortError'; }
}

/** Output pixel size. `resolution` is the short side (or the height for 16:9). */
export function frameSize(aspectRatio, resolution) {
  const r = ASPECT_RATIOS[aspectRatio] ?? ASPECT_RATIOS['9:16'];
  const even = (n) => Math.max(2, Math.round(n / 2) * 2);
  if (r.w === r.h) return { W: even(resolution), H: even(resolution) };
  if (r.w < r.h) return { W: even(resolution), H: even((resolution * r.h) / r.w) };
  return { W: even((resolution * r.w) / r.h), H: even(resolution) };
}

function runFfmpeg(bin, args, { signal, timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { if (err.length < 4000) err += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    const onAbort = () => child.kill('SIGKILL');
    signal?.addEventListener('abort', onAbort, { once: true });
    child.on('error', (e) => { clearTimeout(timer); reject(new ExportError(`ffmpeg failed to start: ${e.message}`)); });
    child.on('close', (code) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (signal?.aborted) return reject(new ExportCancelled());
      if (code === 0) resolve();
      else reject(new ExportError(`ffmpeg exited with code ${code}: ${err.trim().split('\n').slice(-3).join(' ')}`));
    });
  });
}

// Decode first rather than trusting compressed-file duration estimates. Read only
// the WAV header and file size, not minutes of raw audio into JS memory.
async function wavDuration(path) {
  const file = await open(path, 'r');
  try {
    const header = Buffer.alloc(4096);
    const { bytesRead } = await file.read(header, 0, header.length, 0);
    const info = await file.stat(); let byteRate = 0;
    if (header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE') throw new ExportError('Narration could not be decoded as audio.');
    for (let pos = 12; pos + 8 <= bytesRead;) {
      const name = header.toString('ascii', pos, pos + 4), size = header.readUInt32LE(pos + 4);
      if (name === 'fmt ' && pos + 20 <= bytesRead) byteRate = header.readUInt32LE(pos + 16);
      if (name === 'data' && byteRate > 0) {
        const seconds = Math.min(size, info.size - pos - 8) / byteRate;
        if (seconds > 0 && Number.isFinite(seconds)) return seconds;
      }
      pos += 8 + size + (size % 2);
    }
    throw new ExportError('Narration contains no decodable audio samples.');
  } finally { await file.close(); }
}

/** Build one WAV per scene. Updates this working project's scene durations to
 * preserve complete narration; renderMp4 passes a clone, never the caller object. */
export async function buildNarration({ project, tts, dir, lang, signal, bin, fps }) {
  if (!project.narration) return null;
  const requestedScenes = project.scenes.filter((sc) => String(sc.narration || '').trim());
  if (requestedScenes.length === 0) throw new ExportError('Narration is enabled, but the story has no narration text. Regenerate the script or turn narration off.');
  if (!tts?.enabled) throw new ExportError(tts?.error || 'Natural narration is unavailable. Set ELEVENLABS_API or ELEVENLABS_API_KEY on the server, or turn narration off.');
  const segs = [];
  for (let i = 0; i < project.scenes.length; i++) {
    if (signal?.aborted) throw new ExportCancelled();
    const sc = project.scenes[i];
    if (!String(sc.narration || '').trim()) {
      sc.duration = fitNarrationTiming(sc.duration, 0, { fps }).duration;
      const seg = join(dir, `seg${i}.wav`);
      await runFfmpeg(bin, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', String(sc.duration), seg], { signal });
      segs.push(seg);
      continue;
    }
    const raw = join(dir, `voice${i}.wav`);
    const seg = join(dir, `seg${i}.wav`);
    let voice = null;
    if (sc.narration) {
      try { voice = await tts.synth(sc.narration, raw, lang); } catch (err) {
        throw new ExportError(`Narration failed for scene ${i + 1}: ${err.message || 'TTS provider unavailable'}`);
      }
      if (!voice) throw new ExportError(`Narration is enabled, but no voice was generated for scene ${i + 1}. Set TTS_PROVIDER=none to export without voice.`);
    }
    if (voice) {
      const decoded = join(dir, `decoded${i}.wav`);
      await runFfmpeg(bin, ['-hide_banner', '-loglevel', 'error', '-y', '-i', voice, '-vn', '-ar', '44100', '-ac', '1', '-c:a', 'pcm_s16le', decoded], { signal });
      const seconds = await wavDuration(decoded);
      // A tiny tail absorbs atempo/filter rounding without dropping final words.
      const timing = fitNarrationTiming(sc.duration, seconds + 0.04, { fps });
      sc.duration = timing.duration;
      const fitFilter = `atempo=${timing.playbackRate.toFixed(8)},apad=whole_dur=${sc.duration}`;
      await runFfmpeg(bin, ['-hide_banner', '-loglevel', 'error', '-y', '-i', decoded,
        '-af', fitFilter, '-t', String(sc.duration), '-ar', '44100', '-ac', '1', '-c:a', 'pcm_s16le', seg], { signal });
    } else {
      await runFfmpeg(bin, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono',
        '-t', String(sc.duration), seg], { signal });
    }
    segs.push(seg);
  }
  project.duration = project.scenes.reduce((sum, scene) => sum + scene.duration, 0);
  const list = join(dir, 'segments.txt');
  await writeFile(list, segs.map((s) => `file '${s}'`).join('\n'));
  const out = join(dir, 'narration.wav');
  await runFfmpeg(bin, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out], { signal });
  return out;
}

/**
 * Render a project to an MP4 file.
 * @returns {{ path: string, bytes: number, frames: number, seconds: number, audio: boolean }}
 */
export async function renderMp4({ project, options, outPath, workDir, tts, ffmpegBin = 'ffmpeg', signal, onProgress = () => {} }) {
  const originalDurations = project.scenes.map((sc) => sc.duration);
  project = { ...project, scenes: project.scenes.map((sc) => ({ ...sc })) };
  const { W, H } = frameSize(project.aspectRatio, options.resolution);
  const fps = options.fps;
  const subs = project.subtitles ?? {};
  const scenes = project.scenes;

  await mkdir(workDir, { recursive: true });
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  onProgress({ phase: 'audio', progress: 0, message: 'Preparing narration…' });
  let audio;
  try {
    audio = await buildNarration({ project, tts, dir: workDir, lang: project.language, signal, bin: ffmpegBin, fps });
  } catch (err) { await rm(workDir, { recursive: true, force: true }); throw err; }
  for (const sc of scenes) sc.duration = Math.max(1, Math.round(sc.duration * fps)) / fps;
  const totalFrames = scenes.reduce((sum, sc) => sum + Math.round(sc.duration * fps), 0);
  const totalSeconds = totalFrames / fps;
  project.duration = totalSeconds;
  const timingAdjusted = scenes.some((sc, i) => Math.abs(sc.duration - originalDurations[i]) > 1e-6);

  const args = ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(fps), '-i', 'pipe:0'];
  if (audio) args.push('-i', audio);
  args.push('-map', '0:v', ...(audio ? ['-map', '1:a', '-c:a', 'aac', '-b:a', '96k'] : []),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p',
    '-threads', '2', '-movflags', '+faststart', outPath);

  const child = spawn(ffmpegBin, args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let ffErr = '';
  child.stderr.on('data', (d) => { if (ffErr.length < 4000) ffErr += d; });
  child.stdin.on('error', () => {});
  let exited = null;
  let ffmpegSpawnError = null;
  const exitP = new Promise((resolve) => {
    child.on('close', (code) => { exited = code; resolve(code); });
    child.on('error', (err) => {
      ffmpegSpawnError = err;
      exited = -1;
      resolve(-1);
    });
  });
  const onAbort = () => child.kill('SIGKILL');
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    onProgress({ phase: 'render', progress: 0, message: 'Rendering frames…' });
    let frame = 0;
    for (let si = 0; si < scenes.length; si++) {
      const sc = scenes[si];
      const cues = subs.enabled !== false && sc.narration ? subtitleCues(sc.narration, 0, sc.duration) : [];
      const sceneFrames = Math.round(sc.duration * fps);
      for (let f = 0; f < sceneFrames; f++) {
        if (signal?.aborted) throw new ExportCancelled();
        if (exited !== null) throw new ExportError(ffmpegSpawnError
          ? `ffmpeg failed to start: ${ffmpegSpawnError.message}`
          : `ffmpeg stopped early (code ${exited}): ${ffErr.trim().slice(-300)}`);
        const t = f / fps;
        const cue = cues.find((c) => t >= c.start && t < c.end);
        renderFrame(ctx, sc, t, {
          W, H,
          projectCharacters: project.characters,
          subtitle: { ...subtitleStyle(subs, W, H), enabled: subs.enabled !== false, text: cue?.text ?? '' },
        });
        const buf = canvas.data();
        if (!child.stdin.write(buf)) await once(child.stdin, 'drain');
        frame++;
        if (frame % fps === 0 || frame === totalFrames) {
          onProgress({ phase: 'render', progress: Math.min(0.97, frame / totalFrames), message: `Rendering frame ${frame} of ${totalFrames}` });
        }
      }
    }
    child.stdin.end();
    const code = await exitP;
    if (signal?.aborted) throw new ExportCancelled();
    if (code !== 0) throw new ExportError(`ffmpeg exited with code ${code}: ${ffErr.trim().slice(-300)}`);
  } catch (err) {
    child.stdin.destroy();
    child.kill('SIGKILL');
    await exitP;
    await rm(outPath, { force: true });
    throw err;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    await rm(workDir, { recursive: true, force: true });
  }

  const st = await stat(outPath);
  if (st.size < 1000) throw new ExportError('ffmpeg produced an empty file.');
  onProgress({ phase: 'done', progress: 1, message: 'Video ready.' });
  return { path: outPath, bytes: st.size, frames: totalFrames, seconds: totalSeconds, audio: Boolean(audio), project, timingAdjusted };
}
