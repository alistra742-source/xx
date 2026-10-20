import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeProject } from '../shared/schema.js';
import { renderMp4, frameSize } from '../server/exporter.js';
import { createTts } from '../server/tts.js';

const FFMPEG = process.env.FFMPEG_BIN || 'ffmpeg';
const hasFfmpeg = spawnSync(FFMPEG, ['-version'], { stdio: 'ignore' }).status === 0;

test('frameSize keeps even dimensions for each aspect ratio', () => {
  // The resolution is the short side: 720p vertical is 720x1280, 720p horizontal is 1280x720.
  assert.deepEqual(frameSize('9:16', 720), { W: 720, H: 1280 });
  assert.deepEqual(frameSize('16:9', 720), { W: 1280, H: 720 });
  assert.deepEqual(frameSize('1:1', 720), { W: 720, H: 720 });
});

test('renders a playable MP4 with the expected duration and size', { skip: hasFfmpeg ? false : 'ffmpeg not installed' }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'exp-test-'));
  try {
    const project = normalizeProject({
      title: 'Test', duration: 10, aspectRatio: '16:9', narration: false,
      scenes: [
        { duration: 5, background: 'street', characters: [{ id: 'hero', action: 'run' }], narration: 'The hero runs.', effects: ['motion_lines'] },
        { duration: 5, background: 'horror', characters: [{ id: 'hero', action: 'scared' }], narration: 'Something is wrong.', effects: ['shake'] },
      ],
      subtitles: { enabled: true },
    }, {});
    const outPath = join(dir, 'out.mp4');
    const tts = await createTts({ ttsProvider: 'none' });
    const result = await renderMp4({
      project, options: { resolution: 240, fps: 12 }, outPath, workDir: join(dir, 'work'),
      tts, ffmpegBin: FFMPEG,
    });
    const st = await stat(outPath);
    assert.ok(st.size > 2000, 'output file should be non-trivial');
    assert.equal(result.audio, false);

    // ffmpeg -i prints stream/duration info to stderr; ffprobe is not required.
    const probe = spawnSync(FFMPEG, ['-hide_banner', '-i', outPath], { encoding: 'utf8' });
    const text = probe.stderr || '';
    const dur = /Duration: (\d+):(\d+):([\d.]+)/.exec(text);
    assert.ok(dur, `no duration in ffmpeg output: ${text.slice(0, 300)}`);
    const seconds = Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]);
    assert.ok(Math.abs(seconds - 10) < 0.5, `duration ${seconds}`);
    assert.match(text, /Video: h264/);
    assert.match(text, /426x240/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('long narration extends video naturally, preserves full audio, and returns adjusted project', { skip: !hasFfmpeg }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'exp-long-'));
  try {
    const voice = join(dir, 'voice.wav');
    assert.equal(spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=3', voice]).status, 0);
    const project = { aspectRatio: '16:9', narration: true, duration: 1, subtitles: { enabled: true }, scenes: [{ duration: 1, background: 'street', characters: [], narration: 'All words must be preserved.' }] };
    const result = await renderMp4({ project, options: { resolution: 120, fps: 12 }, outPath: join(dir, 'out.mp4'), workDir: join(dir, 'work'), tts: { enabled: true, synth: async () => voice }, ffmpegBin: FFMPEG });
    assert.ok(result.seconds >= 3 / 1.2);
    assert.ok(result.seconds < 3);
    assert.equal(result.project.duration, result.seconds);
    assert.equal(result.frames / 12, result.seconds);
    assert.equal(result.timingAdjusted, true);
    assert.equal(project.scenes[0].duration, 1);
    const probe = spawnSync(FFMPEG, ['-hide_banner', '-i', result.path], { encoding: 'utf8' }).stderr;
    assert.match(probe, /Audio: aac/);
    const match = /Duration: (\d+):(\d+):([\d.]+)/.exec(probe);
    assert.ok(Math.abs(Number(match[3]) - result.seconds) < 0.15);
    // Pitch must remain close to 220 Hz, not the ~264 Hz chipmunk result of resampling.
    const pcm = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-i', result.path, '-vn', '-f', 's16le', '-ac', '1', '-ar', '44100', 'pipe:1'], { maxBuffer: 4e6 }).stdout;
    let crosses = 0; for (let i = 2; i < Math.min(pcm.length, 88200); i += 2) if (pcm.readInt16LE(i - 2) < 0 && pcm.readInt16LE(i) >= 0) crosses++;
    assert.ok(crosses > 205 && crosses < 235, `pitch ${crosses} Hz`);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
