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
