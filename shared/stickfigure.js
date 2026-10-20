// Stick-figure animation engine (pure math, no DOM).
//
// A pose is a set of absolute segment angles in degrees (0 = pointing down,
// 90 = pointing forward (+x), 180 = up). Limbs are solved with forward
// kinematics from the hip, so every limb rotates around its joint, including
// articulated knees, elbows, wrists/hands, ankles/feet, spine curve, and neck.
import { ACTIONS } from './constants.js';

const D2R = Math.PI / 180;
const TAU = Math.PI * 2;

// Proportions in "figure heights" (total standing height ≈ 1.0).
export const BODY = {
  head: 0.12,
  neckLen: 0.032,
  torso: 0.29,
  shoulderSpread: 0.09,
  hipSpread: 0.06,
  upper: 0.155,
  fore: 0.145,
  thigh: 0.215,
  shin: 0.215,
};

export const BASE_POSE = {
  torso: 180,
  spineCurve: 0,
  headTilt: 0,
  gaze: 0,
  mouth: 0,
  smile: 0.25,
  eye: 1,
  brow: 0, // -1 angry, +1 worried/raised
  tears: 0,
  lArm: -16,
  lFore: -6,
  rArm: 16,
  rFore: 8,
  lThigh: -6,
  lShin: -4,
  rThigh: 6,
  rShin: 4,
  lift: 0,
  crouch: 0,
  jitter: 0,
  dist: 0,
  infection: 0, // 0..1 progressive zombie transformation
  prop: '', // optional prop hint: 'phone', 'plank', 'zzz', 'alert'
};

const pose = (o) => ({ ...BASE_POSE, ...o });
const smooth = (x) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};
const clamp01 = (x) => Math.min(1, Math.max(0, x));

function mix(a, b, k) {
  const out = {};
  for (const key of Object.keys(BASE_POSE)) {
    const va = a[key];
    const vb = b[key];
    out[key] = typeof va === 'number' && typeof vb === 'number' ? va + (vb - va) * k : (k < 0.5 ? va : vb);
  }
  return out;
}

/** Interpolate keyframes [[time, pose], ...] with eased segments. Optional loop period. */
export function keyframes(t, keys, period = 0) {
  const u = period > 0 ? t % period : t;
  if (u <= keys[0][0]) return { ...keys[0][1] };
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, p0] = keys[i];
    const [t1, p1] = keys[i + 1];
    if (u <= t1) return mix(p0, p1, smooth((u - t0) / Math.max(0.0001, t1 - t0)));
  }
  return { ...keys[keys.length - 1][1] };
}

/** Swap left/right limbs (used for alternating punches/combos). */
function mirror(p) {
  return {
    ...p,
    lArm: p.rArm, rArm: p.lArm,
    lFore: p.rFore, rFore: p.lFore,
    lThigh: p.rThigh, rThigh: p.lThigh,
    lShin: p.rShin, rShin: p.lShin,
  };
}

/** Natural walking/running gait with articulated knee bend during swing phase, arm counter-swing, and hip bob. */
function gait(t, { freq, swing, knee, lean, bob, armSwing, armBend, speed, smile = 0.2, brow = 0 }) {
  const ph = TAU * freq * t;
  const s = Math.sin(ph);
  const c = Math.cos(ph);
  // Knee bends mostly when leg is swinging forward (lifting foot clear of ground)
  const lKneeBend = knee * Math.max(0, c);
  const rKneeBend = knee * Math.max(0, -c);
  const lT = swing * s + lean * 0.25;
  const rT = -swing * s + lean * 0.25;
  const aSwing = armSwing ?? swing * 0.85;
  return pose({
    torso: 180 - lean + 1.5 * Math.sin(ph * 2),
    spineCurve: lean * 0.15,
    headTilt: -lean * 0.25 + 2 * Math.sin(ph),
    lThigh: lT,
    rThigh: rT,
    lShin: lT - lKneeBend,
    rShin: rT - rKneeBend,
    lArm: -aSwing * s,
    rArm: aSwing * s,
    lFore: -aSwing * s + armBend + 8 * Math.max(0, -s),
    rFore: aSwing * s + armBend + 8 * Math.max(0, s),
    lift: bob * Math.abs(Math.sin(ph)),
    dist: speed * t,
    smile,
    brow,
  });
}

const breath = (t, amp = 1.2) => ({
  torso: 180 + amp * Math.sin((TAU * t) / 3.0),
  headTilt: 2.2 * Math.sin((TAU * t) / 3.8),
});

const JUMP_UP_L = 160;
const JUMP_UP_R = 200;

// Each action returns a pose for local time t (seconds since the scene started).
const ACTION_FNS = {
  idle: (t) => pose({
    ...breath(t, 1.4),
    lArm: -14 + 3 * Math.sin((TAU * t) / 2.8),
    lFore: -4 + 4 * Math.sin((TAU * t) / 2.8),
    rArm: 14 - 3 * Math.sin((TAU * t) / 2.8),
    rFore: 6 - 4 * Math.sin((TAU * t) / 2.8),
  }),

  stand: (t) => pose(breath(t, 0.8)),

  sit: (t) => pose({
    ...breath(t, 0.8),
    torso: 174 + 0.8 * Math.sin((TAU * t) / 3.2),
    lThigh: 88, rThigh: 88, lShin: 4, rShin: -2,
    lArm: 36, lFore: 82, rArm: 28, rFore: 74,
    smile: 0.35,
  }),

  walk: (t) => gait(t, {
    freq: 1.15, swing: 28, knee: 28, lean: 5, bob: 0.018, armSwing: 24, armBend: 24, speed: 0.22,
  }),

  run: (t) => gait(t, {
    freq: 2.1, swing: 48, knee: 68, lean: 18, bob: 0.055, armSwing: 46, armBend: 72, speed: 0.48,
    smile: -0.2, brow: -0.4,
  }),

  sneak: (t) => {
    const ph = TAU * 0.75 * t;
    const s = Math.sin(ph);
    const c = Math.cos(ph);
    return pose({
      torso: 158 + 2 * Math.sin(ph * 2),
      spineCurve: 8,
      headTilt: 10 + 6 * Math.sin((TAU * t) / 2.2),
      gaze: 0.7 * Math.sin((TAU * t) / 1.8),
      lThigh: 32 + 22 * s,
      rThigh: 32 - 22 * s,
      lShin: -28 - 20 * Math.max(0, c),
      rShin: -28 - 20 * Math.max(0, -c),
      lArm: 45 + 18 * s, lFore: 110 + 12 * s,
      rArm: 65 - 18 * s, rFore: 125 - 12 * s,
      brow: 0.5, eye: 1.15, smile: -0.2,
      dist: 0.12 * t,
    });
  },

  crawl: (t) => {
    const ph = TAU * 1.1 * t;
    const s = Math.sin(ph);
    return pose({
      torso: 104 + 3 * Math.sin(ph * 2),
      headTilt: -22,
      lArm: 20 + 25 * s, lFore: 75 + 15 * s,
      rArm: 20 - 25 * s, rFore: 75 - 15 * s,
      lThigh: -35 + 20 * s, lShin: -85,
      rThigh: -35 - 20 * s, rShin: -85,
      dist: 0.14 * t,
      brow: 0.6, smile: -0.5,
    });
  },

  jump: (t) => keyframes(t, [
    [0, pose({ torso: 192, lThigh: 55, rThigh: 55, lShin: -35, rShin: -35, lArm: -35, rArm: 35, lFore: -45, rFore: 45, lift: 0 })],
    [0.25, pose({ torso: 178, lThigh: -10, rThigh: -10, lShin: -20, rShin: -20, lArm: JUMP_UP_L, rArm: JUMP_UP_R, lFore: 175, rFore: 185, lift: 0.15, smile: 0.8 })],
    [0.55, pose({ torso: 175, lThigh: 38, rThigh: 38, lShin: -45, rShin: -45, lArm: JUMP_UP_L, rArm: JUMP_UP_R, lFore: 175, rFore: 185, lift: 0.45, smile: 0.9 })],
    [0.95, pose({ torso: 192, lThigh: 55, rThigh: 55, lShin: -35, rShin: -35, lArm: -30, rArm: 30, lFore: -40, rFore: 40, lift: 0 })],
    [1.25, pose({})],
  ]),

  fall: (t) => keyframes(t, [
    [0, pose({})],
    [0.3, pose({ torso: 188, lArm: 165, rArm: 195, lFore: 175, rFore: 185, lThigh: -16, rThigh: 18, smile: -0.5, eye: 1.35, mouth: 0.7 })],
    [0.75, pose({ torso: 122, headTilt: 18, lArm: 145, rArm: 115, lFore: 175, rFore: 135, lThigh: 65, rThigh: 38, lShin: 40, rShin: 30, smile: -0.7, eye: 1.3, mouth: 0.8 })],
    [1.2, pose({ torso: 95, headTilt: 28, lArm: 105, rArm: 88, lFore: 125, rFore: 105, lThigh: 84, rThigh: 76, lShin: 78, rShin: 72, smile: -0.9, eye: 0.6, mouth: 0.2 })],
  ]),

  wave: (t) => pose({
    ...breath(t, 0.8),
    headTilt: 6,
    rArm: 148 + 5 * Math.sin((TAU * t) / 2),
    rFore: 152 + 42 * Math.sin(TAU * 2.2 * t),
    lArm: -14, lFore: -6,
    smile: 0.85,
  }),

  point: (t) => pose({
    ...breath(t, 0.6),
    torso: 176,
    headTilt: 5,
    rArm: 92 + 3 * Math.sin((TAU * t) / 1.8),
    rFore: 92 + 2 * Math.sin((TAU * t) / 1.8),
    lArm: -18, lFore: 10,
    smile: 0.1, brow: -0.3,
  }),

  talk: (t) => pose({
    ...breath(t, 0.8),
    headTilt: 3 * Math.sin(TAU * 1.1 * t),
    mouth: 0.45 + 0.45 * Math.sin(TAU * 4.8 * t),
    lArm: -18 + 16 * Math.sin(TAU * 1.4 * t),
    lFore: 25 + 28 * Math.sin(TAU * 1.4 * t + 0.8),
    rArm: 28 + 20 * Math.sin(TAU * 1.2 * t + 1),
    rFore: 68 + 24 * Math.sin(TAU * 1.2 * t + 1.8),
    smile: 0.3,
  }),

  think: (t) => pose({
    ...breath(t, 0.5),
    torso: 178,
    headTilt: -9 + 2 * Math.sin((TAU * t) / 3),
    gaze: 0.6,
    rArm: 132, rFore: 204,
    lArm: 20, lFore: 85,
    smile: -0.05, brow: 0.4,
  }),

  laugh: (t) => pose({
    torso: 178 + 6 * Math.sin(TAU * 3.2 * t),
    headTilt: 8 * Math.sin(TAU * 3.2 * t),
    lArm: 145 + 16 * Math.sin(TAU * 3.2 * t), lFore: 172,
    rArm: 215 - 16 * Math.sin(TAU * 3.2 * t), rFore: 188,
    mouth: 0.55 + 0.45 * Math.sin(TAU * 6 * t),
    smile: 1, eye: 0.65,
    lift: 0.022 * Math.abs(Math.sin(TAU * 3.2 * t)),
  }),

  cry: (t) => pose({
    torso: 168,
    spineCurve: 6,
    headTilt: 24 + 3 * Math.sin(TAU * 2.5 * t),
    lArm: 132, lFore: 205,
    rArm: 118, rFore: 212,
    smile: -1, tears: 1, eye: 0.65, brow: 0.8,
    jitter: 0.005 * Math.sin(TAU * 5 * t),
  }),

  fight: (t) => {
    const cycle = Math.min(t, 1.4);
    const half = cycle < 0.7;
    const p = keyframes(half ? cycle : cycle - 0.7, [
      [0, pose({ torso: 170, lArm: 135, lFore: 195, rArm: 120, rFore: 185, lThigh: -24, rThigh: 26, lShin: -12, rShin: 10, smile: -0.4, brow: -0.8 })],
      [0.18, pose({ torso: 158, lArm: 140, lFore: 195, rArm: 92, rFore: 90, lThigh: -28, rThigh: 32, lShin: -14, rShin: 14, smile: -0.7, brow: -1, headTilt: 8, dist: 0.05 })],
      [0.38, pose({ torso: 160, lArm: 140, lFore: 195, rArm: 92, rFore: 90, lThigh: -26, rThigh: 30, lShin: -12, rShin: 12, smile: -0.7, brow: -1, headTilt: 6, dist: 0.04 })],
      [0.7, pose({ torso: 170, lArm: 135, lFore: 195, rArm: 120, rFore: 185, lThigh: -24, rThigh: 26, lShin: -12, rShin: 10, smile: -0.4, brow: -0.8, dist: 0 })],
    ]);
    return half ? p : mix(p, mirror(p), smooth((cycle - 0.7) / 0.12));
  },

  dodge: (t) => keyframes(t, [
    [0, pose({ dist: 0, lArm: 140, lFore: 195, rArm: 130, rFore: 190 })],
    [0.2, pose({ torso: 204, headTilt: -10, dist: -0.14, lThigh: 28, rThigh: -18, lShin: -22, rShin: -15, lArm: 150, lFore: 200, rArm: 145, rFore: 195, smile: -0.4, eye: 1.3 })],
    [0.55, pose({ torso: 202, headTilt: -8, dist: -0.14, lThigh: 28, rThigh: -18, lShin: -22, rShin: -15, lArm: 150, lFore: 200, rArm: 145, rFore: 195, smile: -0.4, eye: 1.25 })],
    [0.95, pose({ dist: 0, lArm: 140, lFore: 195, rArm: 130, rFore: 190 })],
  ]),

  celebrate: (t) => pose({
    torso: 180 + 4 * Math.sin(TAU * 2 * t),
    headTilt: 5 * Math.sin(TAU * t),
    lift: 0.065 * Math.abs(Math.sin(TAU * 1.6 * t)),
    lArm: 162 + 15 * Math.sin(TAU * 3 * t), lFore: 172 + 12 * Math.sin(TAU * 3 * t),
    rArm: 198 - 15 * Math.sin(TAU * 3 * t), rFore: 188 - 12 * Math.sin(TAU * 3 * t),
    lThigh: -14 + 12 * Math.sin(TAU * 1.6 * t), rThigh: 14 - 12 * Math.sin(TAU * 1.6 * t),
    smile: 1, eye: 1.15, mouth: 0.4 + 0.3 * Math.sin(TAU * 2 * t),
  }),

  look_left: (t) => pose({
    ...breath(t, 0.7),
    gaze: -(0.7 + 0.3 * Math.sin((TAU * t) / 1.8)),
    headTilt: -6 + 3 * Math.sin((TAU * t) / 1.8),
    rArm: 35, rFore: 95,
  }),

  look_right: (t) => pose({
    ...breath(t, 0.7),
    gaze: 0.7 + 0.3 * Math.sin((TAU * t) / 1.8),
    headTilt: 6 + 3 * Math.sin((TAU * t) / 1.8),
    lArm: -35, lFore: -95,
  }),

  surprised: (t) => keyframes(t, [
    [0, pose({})],
    [0.14, pose({ torso: 190, lArm: 162, rArm: 198, lFore: 185, rFore: 175, lThigh: -16, rThigh: 16, eye: 1.55, mouth: 0.95, smile: -0.2, brow: 0.9, lift: 0.06, headTilt: -6 })],
    [0.45, pose({ torso: 186, lArm: 152, rArm: 205, lFore: 195, rFore: 165, lThigh: -12, rThigh: 12, eye: 1.5, mouth: 0.85, smile: -0.2, brow: 0.85, lift: 0, headTilt: -4 })],
  ]),

  scared: (t) => pose({
    torso: 190 + 2 * Math.sin(TAU * 6 * t),
    jitter: 0.009 * Math.sin(TAU * 9 * t),
    lArm: 145 + 10 * Math.sin(TAU * 5 * t), lFore: 205,
    rArm: 158 - 10 * Math.sin(TAU * 5 * t + 1), rFore: 205,
    lThigh: -16, rThigh: 16, lShin: -12, rShin: 8,
    eye: 1.5, smile: -0.85, mouth: 0.65, brow: 0.9,
    dist: -0.06 * Math.min(t, 1.5),
  }),

  defeated: (t) => keyframes(t, [
    [0, pose({})],
    [0.45, pose({ torso: 96, headTilt: 28, lThigh: 72, rThigh: 62, lShin: 82, rShin: 76, lArm: 118, lFore: 148, rArm: 102, rFore: 128, smile: -1, eye: 0.5 })],
    [1.0, pose({ torso: 93, headTilt: 32, lThigh: 74, rThigh: 64, lShin: 84, rShin: 78, lArm: 115, lFore: 145, rArm: 100, rFore: 125, smile: -1, eye: 0.35 })],
  ]),

  hide: (t) => pose({
    torso: 156,
    spineCurve: 10,
    headTilt: 16,
    lThigh: 72, rThigh: 72, lShin: -28, rShin: -28,
    lArm: 148, lFore: 205, rArm: 138, rFore: 205,
    smile: -0.6, eye: 1.25, brow: 0.8,
    jitter: 0.005 * Math.sin(TAU * 7 * t),
  }),

  // ---- Story & Cinematic Actions ----

  sleep: (t) => pose({
    torso: 270 + 0.7 * Math.sin((TAU * t) / 2.6),
    headTilt: 1 + Math.sin((TAU * t) / 2.6),
    lThigh: 89, rThigh: 90,
    lShin: 89, rShin: 90,
    lArm: 100, lFore: 110,
    rArm: 88, rFore: 96,
    eye: 0.08, // closed eyes
    smile: 0.15,
    mouth: 0.15 * Math.max(0, Math.sin((TAU * t) / 2.6)),
    prop: 'zzz',
  }),

  wake_up: (t) => keyframes(t, [
    [0, pose({ torso: 270, lThigh: 89, rThigh: 90, lShin: 89, rShin: 90, lArm: 100, lFore: 110, rArm: 88, rFore: 96, eye: 0.08, smile: 0 })],
    [0.25, pose({ torso: 266, headTilt: -4, lThigh: 89, rThigh: 90, lShin: 89, rShin: 90, lArm: 100, lFore: 110, rArm: 88, rFore: 96, eye: 0.5, smile: -0.2 })],
    [0.85, pose({ torso: 184, headTilt: -6, lThigh: 88, rThigh: 84, lShin: 10, rShin: 6, lArm: 35, lFore: 88, rArm: 130, rFore: 190, eye: 1.5, mouth: 0.8, smile: -0.6, brow: 1.0, prop: 'alert' })],
    [1.25, pose({ torso: 174, headTilt: -5, lThigh: 82, rThigh: 78, lShin: 8, rShin: 4, lArm: 28, lFore: 85, rArm: 120, rFore: 185, eye: 1.5, mouth: 0.6, smile: -0.5, brow: 0.9 })],
    [1.8, pose({ torso: 178, headTilt: 8, gaze: -0.8, lThigh: -10, rThigh: 12, lShin: -6, rShin: 6, lArm: 145, lFore: 195, rArm: 165, rFore: 185, eye: 1.5, mouth: 0.6, smile: -0.5, brow: 0.9, prop: 'alert' })],
    [2.1, pose({ torso: 176, headTilt: -6, gaze: 0.9, lThigh: -12, rThigh: 14, lShin: -6, rShin: 6, lArm: 135, lFore: 190, rArm: 150, rFore: 195, eye: 1.45, mouth: 0.5, smile: -0.6, brow: 0.9 })],
  ]),

  watch_tv: (t) => {
    const shock = t > 1.0 ? Math.min(1, (t - 1.0) / 0.4) : 0;
    return pose({
      torso: 172 + shock * 12 + 1.2 * Math.sin(TAU * 2 * t),
      headTilt: 4 - shock * 8,
      gaze: 0.85,
      lThigh: -10, rThigh: 14, lShin: -6, rShin: 4,
      lArm: -18 + shock * 145, lFore: 25 + shock * 165,
      rArm: 42 + shock * 95, rFore: 98 + shock * 90,
      eye: 1.15 + shock * 0.45,
      mouth: shock * 0.75,
      smile: -0.2 - shock * 0.6,
      brow: 0.3 + shock * 0.7,
      jitter: shock * 0.004 * Math.sin(TAU * 8 * t),
      prop: shock > 0.4 ? 'alert' : 'remote',
    });
  },

  look_window: (t) => {
    const recoil = t > 2.2 ? Math.min(1, (t - 2.2) / 0.45) : 0;
    return pose({
      torso: 166 + recoil * 22,
      spineCurve: 6 - recoil * 6,
      headTilt: 16 - recoil * 20,
      gaze: 0.9,
      lThigh: -8 - recoil * 10, rThigh: 18 - recoil * 6,
      lShin: -6, rShin: 6,
      // Right hand shades brow / presses window, then clutches face on recoil
      rArm: 128 + recoil * 25,
      rFore: 192 + recoil * 15,
      lArm: 35 + recoil * 105,
      lFore: 88 + recoil * 110,
      eye: 1.3 + recoil * 0.3,
      mouth: 0.3 + recoil * 0.6,
      smile: -0.5 - recoil * 0.4,
      brow: 0.7 + recoil * 0.3,
      dist: (1 - recoil) * 0.04 - recoil * 0.08,
    });
  },

  barricade: (t) => {
    const hit = Math.sin(TAU * 2.4 * t);
    return pose({
      torso: 158 + 6 * hit,
      headTilt: 8,
      lThigh: -26, rThigh: 32, lShin: -14, rShin: 12,
      lArm: 85 + 22 * hit, lFore: 105 + 25 * hit,
      rArm: 75 - 22 * hit, rFore: 95 - 25 * hit,
      eye: 1.25, smile: -0.5, brow: -0.7,
      prop: 'plank',
    });
  },

  panic: (t) => {
    const s = Math.sin(TAU * 3.2 * t);
    return pose({
      torso: 182 + 8 * s,
      headTilt: 10 * Math.cos(TAU * 3.2 * t),
      gaze: 0.8 * Math.sin(TAU * 2.5 * t),
      lArm: 158 + 12 * s, lFore: 222,
      rArm: 202 - 12 * s, rFore: 138,
      lThigh: -22 * s, rThigh: 22 * s,
      lShin: -18 * Math.max(0, s), rShin: -18 * Math.max(0, -s),
      lift: 0.03 * Math.abs(s),
      jitter: 0.008 * Math.sin(TAU * 10 * t),
      eye: 1.6, mouth: 0.9, smile: -0.9, brow: 1.0,
      prop: 'alert',
    });
  },

  phone_scroll: (t) => pose({
    ...breath(t, 0.6),
    torso: 173,
    headTilt: 20,
    gaze: 0.5,
    rArm: 42, rFore: 128 + 4 * Math.sin(TAU * 2 * t),
    lArm: -12, lFore: 10,
    prop: 'phone',
  }),

  // ---- Zombie & Outbreak Actions ----

  zombie_walk: (t) => {
    const ph = TAU * 0.95 * t;
    const s = Math.sin(ph);
    const limp = Math.max(0, Math.cos(ph));
    return pose({
      torso: 152 + 5 * Math.sin(ph * 2),
      spineCurve: 14,
      headTilt: 22 + 7 * Math.sin(ph),
      gaze: 0.8,
      // Both arms outstretched forward like a classic zombie
      lArm: 82 + 8 * Math.sin(ph + 0.5),
      lFore: 94 + 10 * Math.sin(ph),
      rArm: 92 - 8 * Math.sin(ph),
      rFore: 86 - 10 * Math.sin(ph + 0.8),
      // Asymmetric dragging gait
      lThigh: 28 * s + 8,
      rThigh: -22 * s + 4,
      lShin: 28 * s - 28 * limp,
      rShin: -22 * s - 10,
      lift: 0.012 * limp,
      dist: 0.18 * t,
      eye: 1.35,
      mouth: 0.65 + 0.2 * Math.sin(ph * 2),
      smile: -0.7,
      brow: -0.8,
      infection: 1,
    });
  },

  zombie_chase: (t) => {
    const ph = TAU * 1.85 * t;
    const s = Math.sin(ph);
    const c = Math.cos(ph);
    return pose({
      torso: 144 + 6 * Math.sin(ph * 2),
      spineCurve: 16,
      headTilt: 18 + 6 * s,
      gaze: 0.9,
      // Clawing / lunging arms reaching forward
      lArm: 78 + 22 * s,
      lFore: 98 + 18 * c,
      rArm: 96 - 22 * s,
      rFore: 88 - 18 * c,
      lThigh: 42 * s + 10,
      rThigh: -42 * s + 10,
      lShin: 42 * s - 52 * Math.max(0, c),
      rShin: -42 * s - 52 * Math.max(0, -c),
      lift: 0.04 * Math.abs(s),
      dist: 0.38 * t,
      eye: 1.45,
      mouth: 0.85,
      smile: -0.85,
      brow: -1,
      infection: 1,
    });
  },

  infect: (t) => {
    const u = t;
    return keyframes(u, [
      [0, pose({ torso: 150, spineCurve: 14, headTilt: 18, lArm: 88, lFore: 96, rArm: 94, rFore: 88, lThigh: -18, rThigh: 24, eye: 1.4, mouth: 0.8, smile: -0.8, brow: -1, infection: 1 })],
      [0.35, pose({ torso: 132, spineCurve: 18, headTilt: 28, lArm: 72, lFore: 115, rArm: 78, rFore: 110, lThigh: -28, rThigh: 38, lShin: -18, rShin: 16, dist: 0.14, eye: 1.6, mouth: 1.0, smile: -0.9, brow: -1, infection: 1 })],
      [0.85, pose({ torso: 126, spineCurve: 20, headTilt: 34, lArm: 65, lFore: 128, rArm: 70, rFore: 122, lThigh: -26, rThigh: 36, lShin: -16, rShin: 14, dist: 0.16, jitter: 0.008 * Math.sin(TAU * 12 * t), eye: 1.6, mouth: 0.95, smile: -0.9, brow: -1, infection: 1 })],
      [1.5, pose({ torso: 162, spineCurve: 12, headTilt: -8, lArm: 115, lFore: 145, rArm: 108, rFore: 138, lThigh: -14, rThigh: 20, dist: 0.06, eye: 1.4, mouth: 0.85, smile: -0.7, brow: -1, infection: 1 })],
      [2.2, pose({ torso: 150, spineCurve: 14, headTilt: 18, lArm: 88, lFore: 96, rArm: 94, rFore: 88, lThigh: -18, rThigh: 24, dist: 0.08, eye: 1.4, mouth: 0.8, smile: -0.8, brow: -1, infection: 1 })],
    ]);
  },

  turn_zombie: (t) => {
    const inf = clamp01((t - 0.3) / 1.8);
    const p = keyframes(t, [
      // Bit / shocked recoil
      [0, pose({ torso: 188, headTilt: -10, lArm: 145, lFore: 195, rArm: 155, rFore: 200, lThigh: -16, rThigh: 16, eye: 1.55, mouth: 0.9, smile: -0.8, brow: 0.9, infection: 0 })],
      // Clutching head/chest, convulsing on knees
      [0.6, pose({ torso: 148, spineCurve: 16, headTilt: 26, lArm: 135, lFore: 215, rArm: 128, rFore: 210, lThigh: 58, rThigh: 52, lShin: -45, rShin: -40, eye: 1.5, mouth: 0.8, smile: -0.9, brow: 0.8, infection: 0.35 })],
      [1.25, pose({ torso: 136, spineCurve: 20, headTilt: 32, lArm: 45, lFore: 60, rArm: 35, rFore: 50, lThigh: 64, rThigh: 58, lShin: -50, rShin: -45, eye: 0.4, mouth: 0.4, smile: -0.7, brow: -0.5, infection: 0.75 })],
      // Rising up as a hunched green zombie with arms outstretched
      [1.9, pose({ torso: 152, spineCurve: 15, headTilt: 22, lArm: 84, lFore: 96, rArm: 92, rFore: 88, lThigh: -12, rThigh: 18, lShin: -8, rShin: 6, eye: 1.45, mouth: 0.85, smile: -0.8, brow: -1, infection: 1 })],
      [3.0, pose({ torso: 150, spineCurve: 14, headTilt: 20, lArm: 86, lFore: 94, rArm: 94, rFore: 86, lThigh: 18, rThigh: -14, lShin: 8, rShin: -12, dist: 0.12, eye: 1.45, mouth: 0.8, smile: -0.8, brow: -1, infection: 1 })],
    ]);
    p.infection = inf;
    p.jitter = (t > 0.2 && t < 1.7) ? 0.012 * Math.sin(TAU * 14 * t) : 0;
    return p;
  },
};

// Make sure every supported action has an implementation.
for (const name of ACTIONS) {
  if (!ACTION_FNS[name]) throw new Error(`Missing animation for action ${name}`);
}

const EMOTION_FACE = {
  neutral: { smile: 0, eye: 1, headTilt: 0, brow: 0 },
  happy: { smile: 0.55, eye: 1.05, headTilt: 0, brow: 0.2 },
  sad: { smile: -0.7, eye: 0.8, headTilt: 6, brow: 0.7 },
  scared: { smile: -0.55, eye: 1.4, headTilt: -2, brow: 0.9 },
  angry: { smile: -0.65, eye: 0.85, headTilt: -4, brow: -1 },
  surprised: { smile: -0.1, eye: 1.45, headTilt: -3, brow: 0.9 },
  determined: { smile: -0.2, eye: 0.9, headTilt: -2, brow: -0.7 },
  confused: { smile: -0.2, eye: 1.1, headTilt: 9, brow: 0.5 },
  infected: { smile: -0.75, eye: 1.35, headTilt: 14, brow: -0.9 },
};

/**
 * Pose for an action at local time t, blended in from the standing pose
 * over 0.22s (except actions that begin lying down like sleep/wake_up),
 * with the scene emotion applied to the face.
 * Unknown actions fall back to idle.
 */
export function solvePose(action, t, emotion = 'neutral', sceneDuration = 0) {
  const fn = ACTION_FNS[action] ?? ACTION_FNS.idle;
  const time = Math.max(0, Number.isFinite(t) ? t : 0);
  // One-shot story actions progress through the scene rather than restarting
  // a short GIF. Gaits stay cyclic while their travel remains continuous.
  const storyEnd = { jump: 1.25, dodge: 0.95, fight: 1.4, fall: 1.2, defeated: 1, wake_up: 2.1, infect: 2.2, turn_zombie: 3 }[action];
  const actionTime = storyEnd && sceneDuration > storyEnd ? time * storyEnd / sceneDuration : time;
  let p = fn(actionTime);
  // Gestures have an intention: gather, express, release. Their internal motion
  // can remain organic without waving/pointing at full force for an entire shot.
  // No duration means the legacy instantaneous animation API stays unchanged.
  if (sceneDuration > 0 && ['wave', 'point', 'celebrate', 'think'].includes(action)) {
    const progress = clamp01(time / sceneDuration);
    const engage = smooth(progress / 0.16);
    const release = 1 - smooth((progress - 0.78) / 0.22);
    p = mix(ACTION_FNS.stand(time), p, engage * release);
  }
  const noStandBlend = action === 'sleep' || action === 'wake_up' || action === 'crawl';
  const blend = noStandBlend ? 1 : clamp01(time / 0.22);
  if (blend < 1) p = mix(ACTION_FNS.stand(0), p, smooth(blend));
  const e = EMOTION_FACE[emotion] ?? EMOTION_FACE.neutral;
  const blinkPhase = ((time + 1.17) % 4.73);
  const blink = blinkPhase < 0.15 ? 1 - Math.sin(Math.PI * blinkPhase / 0.15) * 0.96 : 1;
  return {
    ...p,
    smile: p.smile + e.smile,
    eye: p.eye * e.eye * blink,
    headTilt: p.headTilt + e.headTilt,
    brow: clamp01(Math.abs(p.brow)) > 0.1 ? p.brow : e.brow,
    infection: emotion === 'infected' ? Math.max(p.infection, 1) : p.infection,
  };
}

/**
 * Forward kinematics. Returns pixel joints for drawing an articulated character.
 * origin: { x (hip x in px), groundY (px), scale (px per figure height), facing (1|-1), disableDist?: boolean }
 */
export function buildSkeleton(p, origin) {
  const { x, groundY, scale, facing, disableDist = false } = origin;
  const d = (a) => [Math.sin(a * D2R), Math.cos(a * D2R)];
  const add = (q, v, len) => [q[0] + v[0] * len, q[1] + v[1] * len];

  const hip = [0, 0];
  const torsoLowerDir = d(p.torso + (p.spineCurve || 0) * 0.5);
  const torsoUpperDir = d(p.torso - (p.spineCurve || 0) * 0.5);
  const chest = add(hip, torsoLowerDir, BODY.torso * 0.52);
  const shoulder = add(chest, torsoUpperDir, BODY.torso * 0.38);
  const neck = add(chest, torsoUpperDir, BODY.torso * 0.48);
  const headDir = d(p.torso + p.headTilt);
  const head = add(neck, headDir, BODY.head + BODY.neckLen);

  // Slight shoulder and hip anatomical offsets so limbs don't all sprout from a single point
  const lShoulder = [shoulder[0] - BODY.shoulderSpread * 0.5, shoulder[1] + 0.005];
  const rShoulder = [shoulder[0] + BODY.shoulderSpread * 0.5, shoulder[1] + 0.005];
  const lHip = [hip[0] - BODY.hipSpread * 0.5, hip[1]];
  const rHip = [hip[0] + BODY.hipSpread * 0.5, hip[1]];

  const lElbow = add(lShoulder, d(p.lArm), BODY.upper);
  const lHand = add(lElbow, d(p.lFore), BODY.fore);
  const rElbow = add(rShoulder, d(p.rArm), BODY.upper);
  const rHand = add(rElbow, d(p.rFore), BODY.fore);
  const lKnee = add(lHip, d(p.lThigh), BODY.thigh);
  const lFoot = add(lKnee, d(p.lShin), BODY.shin);
  const rKnee = add(rHip, d(p.rThigh), BODY.thigh);
  const rFoot = add(rKnee, d(p.rShin), BODY.shin);

  // Ground contact: the lowest joint (feet, knees, or torso when lying down) sits on groundY.
  const lowest = Math.max(lFoot[1], rFoot[1], lKnee[1], rKnee[1], hip[1] + 0.04, shoulder[1] + 0.04);
  const hipY = groundY - lowest * scale - p.lift * scale;
  const distOffset = disableDist ? 0 : facing * p.dist * scale;
  const hipX = x + distOffset + facing * p.jitter * scale;

  const P = (u) => [hipX + facing * u[0] * scale, hipY + u[1] * scale];
  const headPx = P(head);
  const headR = BODY.head * scale;
  return {
    hip: P(hip),
    chest: P(chest),
    neck: P(neck),
    shoulder: P(shoulder),
    lShoulder: P(lShoulder),
    rShoulder: P(rShoulder),
    lHip: P(lHip),
    rHip: P(rHip),
    head: headPx,
    headR,
    headAngle: (p.torso - 180 + p.headTilt) * facing * D2R,
    torsoAngle: (p.torso - 180) * facing * D2R,
    lElbow: P(lElbow), lHand: P(lHand),
    rElbow: P(rElbow), rHand: P(rHand),
    lKnee: P(lKnee), lFoot: P(lFoot),
    rKnee: P(rKnee), rFoot: P(rFoot),
    facing,
    infection: p.infection || 0,
    prop: p.prop || '',
    // Bounding box of the head, used to keep subtitles off faces.
    headBox: { x: headPx[0] - headR * 1.3, y: headPx[1] - headR * 1.5, w: headR * 2.6, h: headR * 2.8 },
  };
}

export const ACTION_DURATIONS_HINT = { jump: 1.4, fight: 1.4, dodge: 1.8, wake_up: 2.2, infect: 2.2, turn_zombie: 3.0 };
export { ACTIONS };
