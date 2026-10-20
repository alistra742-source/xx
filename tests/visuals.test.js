import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { renderFrame, layoutFor, bedroomStaging, BACKGROUND_INFO } from '../shared/renderer.js';
import { bedroomLayout } from '../shared/scenery.js';
import { ACTIONS, solvePose, buildSkeleton } from '../shared/stickfigure.js';

const sceneFor = (action, background = 'street') => ({
  duration: 8, background, effects: ['rain', 'zoom'],
  characters: [{ id: 'hero', action, emotion: 'determined', position: { x: 0.5, y: 0.8 }, facing: 1 }],
});

test('all supported actions produce finite articulated poses, including long scenes', () => {
  for (const action of ACTIONS) for (const time of [0, 0.15, 0.7, 1.4, 4, 8, 60]) {
    const pose = solvePose(action, time, 'neutral', 8);
    for (const [key, value] of Object.entries(pose)) {
      if (typeof value === 'number') assert.ok(Number.isFinite(value), `${action}/${time}/${key}`);
    }
    const sk = buildSkeleton(pose, { x: 320, groundY: 288, scale: 220, facing: -1 });
    for (const value of Object.values(sk)) if (Array.isArray(value)) {
      assert.ok(value.every(Number.isFinite), `${action}/${time}: invalid joint`);
    }
  }
});

test('procedural scene frames are deterministic and independent of render order', () => {
  const canvas = createCanvas(320, 180), ctx = canvas.getContext('2d');
  const scene = sceneFor('walk');
  renderFrame(ctx, scene, 2.4, { W: 320, H: 180 });
  const expected = canvas.toBuffer('image/png');
  renderFrame(ctx, sceneFor('turn_zombie', 'lab'), 7, { W: 320, H: 180 });
  renderFrame(ctx, scene, 2.4, { W: 320, H: 180 });
  assert.deepEqual(canvas.toBuffer('image/png'), expected);
  renderFrame(ctx, scene, 3.1, { W: 320, H: 180 });
  assert.notDeepEqual(canvas.toBuffer('image/png'), expected);
});

test('every background and action draws opaque finite samples in all aspect ratios', () => {
  for (const [W, H] of [[256, 144], [144, 256], [180, 180]]) {
    const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
    const guarded = new Proxy(ctx, {
      get(target, key) {
        const value = Reflect.get(target, key, target);
        if (typeof value !== 'function') return value;
        return (...args) => {
          for (const arg of args) if (typeof arg === 'number') assert.ok(Number.isFinite(arg), `invalid ${String(key)} argument`);
          return value.apply(target, args);
        };
      },
      set(target, key, value) { Reflect.set(target, key, value, target); return true; },
    });
    const backgrounds = Object.keys(BACKGROUND_INFO);
    for (let i = 0; i < Math.max(ACTIONS.length, backgrounds.length); i++) {
      const scene = sceneFor(ACTIONS[i % ACTIONS.length], backgrounds[i % backgrounds.length]);
      scene.characters[0].position.x = i % 2 ? 0.05 : 0.95;
      for (const time of [0, 4, 8]) {
        renderFrame(guarded, scene, time, { W, H });
        const pixels = ctx.getImageData(0, 0, W, H).data;
        for (let k = 3; k < pixels.length; k += 4) assert.equal(pixels[k], 255);
      }
    }
  }
});

test('one-shot jumps, dodges, attacks and infection do not restart at old loop boundaries', () => {
  for (const [action, boundary] of [['jump', 1.4], ['dodge', 1.8], ['fight', 1.4], ['infect', 2.2]]) {
    const a = solvePose(action, boundary - 0.001);
    const b = solvePose(action, boundary + 0.001);
    for (const key of ['torso', 'lArm', 'rArm', 'lThigh', 'rThigh', 'dist', 'lift']) {
      assert.ok(Math.abs(a[key] - b[key]) < 1, `${action}/${key} resets`);
    }
    const late = solvePose(action, 20), end = solvePose(action, 21);
    assert.equal(late.torso, end.torso);
    assert.equal(late.dist, end.dist);
  }
  assert.ok(Math.abs(solvePose('wake_up', 7, 'neutral', 8).torso - solvePose('wake_up', 1, 'neutral', 8).torso) > 50);
});

test('composition keeps a single character readable in landscape and portrait', () => {
  assert.ok(layoutFor(1920, 1080).scale > 600);
  assert.ok(layoutFor(1080, 1920).scale > 850);
  assert.ok(layoutFor(1080, 1920, 6).scale < layoutFor(1080, 1920, 1).scale);
});

test('bedroom blocking puts sleep on mattress, wake beside bed and gaze toward props', () => {
  for (const [W, H] of [[640, 360], [360, 640], [480, 480]]) {
    const { bed, ground, window, tv } = bedroomLayout(W, H);
    const scale = layoutFor(W, H).scale;
    for (const action of ['sleep', 'wake_up']) {
      const stage = bedroomStaging(action, 0, W, H, scale);
      const sk = buildSkeleton(solvePose(action, 0, 'neutral', 8), { x: stage.x, groundY: stage.groundY, scale: stage.scale, facing: stage.facing });
      const offset = stage.hipY - sk.hip[1];
      assert.ok(sk.head[0] - sk.headR >= bed.x, `${W} ${action}: head off bed`);
      assert.ok(Math.max(sk.lFoot[0], sk.rFoot[0]) <= bed.x + bed.w, `${W} ${action}: feet off bed`);
      assert.ok(Math.abs(sk.head[1] + offset + sk.headR - bed.mattressY) < stage.scale * 0.04, `${W} ${action}: head not on pillow`);
    }
    const end = bedroomStaging('wake_up', 1, W, H, scale);
    assert.ok(end.x > bed.x + bed.w);
    assert.equal(end.groundY, ground);
    const endSk = buildSkeleton(solvePose('wake_up', 8, 'neutral', 8), { x: end.x, groundY: ground, scale: end.scale, facing: end.facing });
    const endOffset = end.hipY - endSk.hip[1];
    assert.ok(Math.abs(Math.max(endSk.lFoot[1], endSk.rFoot[1]) + endOffset - ground) < end.scale * 0.02);
    assert.ok(bedroomStaging('watch_tv', 0.5, W, H, scale).x < tv.x);
    const look = bedroomStaging('look_window', 0.5, W, H, scale);
    assert.ok(look.x >= window.x - look.scale * 0.1 && look.x < window.x + window.w);
    const lookSk = buildSkeleton(solvePose('look_window', 4, 'neutral', 8), { x: look.x, groundY: ground, scale: look.scale, facing: look.facing });
    assert.ok(lookSk.head[1] > window.y && lookSk.head[1] < window.y + window.h);
    const canvas = createCanvas(W, H);
    for (const action of ['sleep', 'wake_up', 'look_window', 'watch_tv']) for (const time of [0, 3.5, 8]) {
      renderFrame(canvas.getContext('2d'), sceneFor(action, 'bedroom'), time, { W, H });
    }
  }
});
