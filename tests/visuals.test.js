import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { renderFrame, layoutFor, bedroomStaging, stageCast, cameraFor, BACKGROUND_INFO } from '../shared/renderer.js';
import { bedroomLayout } from '../shared/scenery.js';
import { ACTIONS, solvePose, buildSkeleton } from '../shared/stickfigure.js';
import { HATS, TOPS, ACCESSORIES } from '../shared/constants.js';

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

test('every hat, top and accessory draws something visible on the figure', () => {
  const W = 240, H = 320;
  const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
  const draw = (drip) => {
    renderFrame(ctx, sceneFor('stand', 'white'), 1, {
      W, H,
      projectCharacters: [{ id: 'hero', name: 'Guy', role: 'protagonist', color: '#3b82f6', drip: { hat: 'none', top: 'none', accessory: 'none', outfitColor: '#3b82f6', accentColor: '#facc15', ...drip } }],
    });
    return canvas.toBuffer('image/png');
  };
  const base = draw({ top: 'tshirt' });
  for (const hat of HATS.filter((h) => h !== 'none')) assert.notDeepEqual(draw({ hat }), base, `hat ${hat} is invisible`);
  // A bare torso is rendered as a plain t-shirt on purpose, so compare against that.
  for (const top of TOPS.filter((t) => t !== 'none' && t !== 'tshirt')) assert.notDeepEqual(draw({ top }), base, `top ${top} is invisible`);
  for (const accessory of ACCESSORIES.filter((a) => a !== 'none')) assert.notDeepEqual(draw({ accessory }), base, `accessory ${accessory} is invisible`);
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

test('ensemble blocking separates coincident casts with readable depth in every aspect', () => {
  for (const [W, H] of [[640, 360], [360, 640], [480, 480]]) for (const n of [1, 3, 8]) {
    const characters = Array.from({ length: n }, (_, i) => ({ id: `c${i}`, action: i % 2 ? 'point' : 'talk', position: { x: 0.5, y: 0.8 }, emotion: 'happy' }));
    const blocking = stageCast(characters, W, H);
    assert.deepEqual(blocking, stageCast(characters, W, H));
    assert.equal(new Set(blocking.map(b => `${b.x},${b.groundY}`)).size, n);
    for (const b of blocking) {
      assert.ok(b.x > 0 && b.x < W && b.groundY > 0 && b.groundY < H);
      assert.ok(b.scale > Math.min(W, H) * 0.25, 'cast became unreadably tiny');
    }
    const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
    const scene = { duration: 8, background: 'office', characters, camera: 'close', cameraMotion: 'push_in', effects: [] };
    for (const time of [0, 4, 8]) {
      renderFrame(ctx, scene, time, { W, H });
      const expected = canvas.toBuffer('image/png');
      renderFrame(ctx, scene, time, { W, H });
      assert.deepEqual(canvas.toBuffer('image/png'), expected);
      const pixels = ctx.getImageData(0, 0, W, H).data;
      for (let k = 3; k < pixels.length; k += 4) assert.equal(pixels[k], 255);
    }
  }
});

test('camera enums affect composition, stay cast-safe and leave subtitle transforms in screen space', () => {
  for (const [W, H] of [[640, 360], [360, 640], [480, 480]]) {
    const bounds = { left: W * 0.28, right: W * 0.72, top: H * 0.2, bottom: H * 0.8 };
    const wide = cameraFor({ camera: 'wide' }, 0.5, W, H, bounds);
    const close = cameraFor({ camera: 'close' }, 0.5, W, H, bounds);
    assert.ok(close.zoom > wide.zoom);
    for (const camera of ['wide', 'medium', 'close']) for (const cameraMotion of ['static', 'push_in', 'pan_left', 'pan_right']) for (const p of [0, 0.5, 1]) {
      const c = cameraFor({ camera, cameraMotion }, p, W, H, bounds);
      assert.ok(bounds.left * c.zoom + c.x >= W * 0.04 - 0.001);
      assert.ok(bounds.right * c.zoom + c.x <= W * 0.96 + 0.001);
      assert.ok(bounds.top * c.zoom + c.y >= H * 0.06 - 0.001);
      assert.ok(bounds.bottom * c.zoom + c.y <= H * 0.92 + 0.001);
    }
    const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
    const scene = sceneFor('talk', 'city'); scene.effects = [];
    const transforms = [];
    const wrapped = new Proxy(ctx, { get(target, key) {
      if (key === 'fillText') return (text, ...args) => {
        if (text === 'SCREEN CAPTION') { const m = target.getTransform(); transforms.push([m.a, m.b, m.c, m.d, m.e, m.f]); }
        return target.fillText(text, ...args);
      };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }, set(target, key, value) { Reflect.set(target, key, value, target); return true; } });
    const opts = { W, H, subtitle: { enabled: true, text: 'SCREEN CAPTION', size: 18, position: 'bottom', color: '#ffffff', outlineColor: '#000000', outlineWidth: 2 } };
    renderFrame(wrapped, { ...scene, camera: 'wide' }, 4, opts);
    const wideImage = canvas.toBuffer('image/png');
    renderFrame(wrapped, { ...scene, camera: 'close' }, 4, opts);
    assert.notDeepEqual(canvas.toBuffer('image/png'), wideImage);
    assert.deepEqual(transforms, [[1, 0, 0, 1, 0, 0], [1, 0, 0, 1, 0, 0]]);
    assert.deepEqual(cameraFor({ direction: { camera: 'close' } }, 0.5, W, H, bounds), close);
    assert.deepEqual(cameraFor({ camera: 'dramatic crane' }, 0.5, W, H, bounds), cameraFor({}, 0.5, W, H, bounds));
  }
});

test('duration-aware gestures engage and release instead of looping forever', () => {
  for (const action of ['wave', 'point', 'celebrate', 'think']) {
    const start = solvePose(action, 0, 'neutral', 8);
    const middle = solvePose(action, 4, 'neutral', 8);
    const end = solvePose(action, 8, 'neutral', 8);
    assert.ok(Math.abs(middle.rArm - end.rArm) + Math.abs(middle.lArm - end.lArm) > 5, action);
    assert.ok(Math.abs(start.rArm - end.rArm) < 2, action);
  }
});
