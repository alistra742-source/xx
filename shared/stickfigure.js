// Stick-figure animation engine (pure math, no DOM).
//
// A pose is a set of absolute segment angles in degrees (0 = pointing down,
// 90 = pointing forward (+x), 180 = up). Limbs are solved with forward
// kinematics from the hip, so every limb rotates around its joint. The figure
// is then grounded automatically: its lowest foot touches the ground line
// unless a `lift` (jump) offset is applied.
import { ACTIONS } from './constants.js';

const D2R = Math.PI / 180;
const TAU = Math.PI * 2;

// Segment lengths in "figure heights" (the whole figure is roughly 1.0 tall).
export const BODY = { head: 0.085, torso: 0.3, upper: 0.16, fore: 0.15, thigh: 0.22, shin: 0.22 };

export const BASE_POSE = {
  torso: 180, headTilt: 0, gaze: 0, mouth: 0, smile: 0.3, eye: 1, tears: 0,
  lArm: -14, lFore: -6, rArm: 14, rFore: 6,
  lThigh: -5, lShin: -3, rThigh: 5, rShin: 3,
  lift: 0, jitter: 0, dist: 0,
};

const pose = (o) => ({ ...BASE_POSE, ...o });
const smooth = (x) => x * x * (3 - 2 * x);
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
    if (u <= t1) return mix(p0, p1, smooth((u - t0) / (t1 - t0)));
  }
  return { ...keys[keys.length - 1][1] };
}

/** Swap left/right limbs (used for alternating punches). */
function mirror(p) {
  return { ...p, lArm: p.rArm, rArm: p.lArm, lFore: p.rFore, rFore: p.lFore, lThigh: p.rThigh, rThigh: p.lThigh, lShin: p.rShin, rShin: p.lShin };
}

/** Walking/running gait: alternating legs, opposite arms, knee bend, hip bob. */
function gait(t, { freq, swing, knee, lean, bob, armBend, speed }) {
  const ph = TAU * freq * t;
  const s = Math.sin(ph);
  const bend = knee * (0.5 + 0.5 * Math.cos(ph));
  const lT = swing * s;
  const rT = -swing * s;
  return pose({
    torso: 180 - lean,
    headTilt: -lean * 0.2,
    lThigh: lT, rThigh: rT,
    lShin: lT - bend, rShin: rT - knee * (0.5 - 0.5 * Math.cos(ph)),
    lArm: -0.8 * swing * s, rArm: 0.8 * swing * s,
    lFore: -0.8 * swing * s + armBend, rFore: 0.8 * swing * s + armBend,
    lift: bob * Math.abs(Math.cos(ph)),
    dist: speed * t,
    smile: 0.5,
  });
}

const breath = (t, amp = 1.2) => ({
  torso: 180 + amp * Math.sin((TAU * t) / 3.2),
  headTilt: 2 * Math.sin((TAU * t) / 4),
});

const JUMP_UP_L = 160;
const JUMP_UP_R = 200;

// Each action returns a pose for local time t (seconds since the action started).
const ACTION_FNS = {
  idle: (t) => pose({ ...breath(t), lArm: -12 + 2 * Math.sin(TAU * t / 3), rArm: 12 - 2 * Math.sin(TAU * t / 3) }),
  stand: (t) => pose(breath(t, 0.6)),
  sit: (t) => pose({
    ...breath(t, 0.8), torso: 172 + 0.8 * Math.sin((TAU * t) / 3.2),
    lThigh: 90, rThigh: 90, lShin: 2, rShin: -2,
    lArm: 40, lFore: 80, rArm: 30, rFore: 70, smile: 0.4,
  }),
  walk: (t) => gait(t, { freq: 1.0, swing: 26, knee: 16, lean: 4, bob: 0.02, armBend: 22, speed: 0.7 }),
  run: (t) => gait(t, { freq: 1.9, swing: 42, knee: 60, lean: 14, bob: 0.045, armBend: 65, speed: 1.6 }),
  jump: (t) => keyframes(t, [
    [0, pose({ torso: 190, lThigh: 55, rThigh: 55, lShin: 25, rShin: 25, lArm: -30, rArm: 30, lFore: -40, rFore: 40, lift: 0 })],
    [0.25, pose({ torso: 178, lThigh: -8, rThigh: -8, lShin: -18, rShin: -18, lArm: JUMP_UP_L, rArm: JUMP_UP_R, lFore: 175, rFore: 185, lift: 0, smile: 0.9 })],
    [0.6, pose({ torso: 176, lThigh: 35, rThigh: 35, lShin: 60, rShin: 60, lArm: JUMP_UP_L, rArm: JUMP_UP_R, lFore: 175, rFore: 185, lift: 0.5, smile: 0.9 })],
    [0.95, pose({ torso: 190, lThigh: 55, rThigh: 55, lShin: 25, rShin: 25, lArm: -30, rArm: 30, lFore: -40, rFore: 40, lift: 0 })],
  ], 1.6),
  fall: (t) => keyframes(t, [
    [0, pose({})],
    [0.35, pose({ torso: 186, lArm: 170, rArm: 190, lFore: 175, rFore: 185, lThigh: -12, rThigh: 14, smile: -0.4, eye: 1.3 })],
    [0.9, pose({ torso: 118, headTilt: 15, lArm: 150, rArm: 120, lFore: 180, rFore: 140, lThigh: 70, rThigh: 40, lShin: 60, rShin: 50, smile: -0.5, eye: 1.2, mouth: 0.6 })],
    [1.4, pose({ torso: 100, headTilt: 28, lArm: 110, rArm: 95, lFore: 130, rFore: 115, lThigh: 85, rThigh: 75, lShin: 80, rShin: 75, smile: -0.8, eye: 0.7 })],
  ]),
  wave: (t) => pose({
    ...breath(t, 0.8), headTilt: 6,
    rArm: 150 + 4 * Math.sin(TAU * t / 2), rFore: 150 + 40 * Math.sin(TAU * 2 * t),
    lArm: -14, lFore: -6, smile: 0.9,
  }),
  point: (t) => pose({
    ...breath(t, 0.6), headTilt: 8,
    rArm: 90 + 3 * Math.sin(TAU * t / 2), rFore: 90 + 2 * Math.sin(TAU * t / 2),
    lArm: -14, lFore: -6, smile: 0.2,
  }),
  talk: (t) => pose({
    ...breath(t, 0.6),
    headTilt: 2 * Math.sin(TAU * 1.2 * t),
    mouth: 0.5 + 0.5 * Math.sin(TAU * 4.5 * t),
    lArm: -20 + 14 * Math.sin(TAU * 1.6 * t), lFore: -30 + 25 * Math.sin(TAU * 1.6 * t + 1),
    rArm: 25 + 16 * Math.sin(TAU * 1.3 * t + 1), rFore: 55 + 20 * Math.sin(TAU * 1.3 * t + 2),
    smile: 0.3,
  }),
  think: (t) => pose({
    ...breath(t, 0.5), torso: 178, headTilt: -8 + 2 * Math.sin(TAU * t / 3), gaze: 0.6,
    rArm: 135, rFore: 200, lArm: -10, lFore: -20, smile: 0,
  }),
  laugh: (t) => pose({
    torso: 178 + 5 * Math.sin(TAU * 3 * t), headTilt: 6 * Math.sin(TAU * 3 * t),
    lArm: 150 + 15 * Math.sin(TAU * 3 * t), lFore: 170,
    rArm: 210 - 15 * Math.sin(TAU * 3 * t), rFore: 190,
    mouth: 0.5 + 0.5 * Math.sin(TAU * 6 * t), smile: 1, eye: 0.6,
    lift: 0.02 * Math.abs(Math.sin(TAU * 3 * t)),
  }),
  cry: (t) => pose({
    torso: 172, headTilt: 22 + 2 * Math.sin(TAU * 2 * t),
    lArm: 130, lFore: 200, rArm: 115, rFore: 210,
    smile: -1, tears: 1, eye: 0.7, mouth: 0,
    jitter: 0.004 * Math.sin(TAU * 4 * t),
  }),
  fight: (t) => {
    const half = (t % 1.8) < 0.9;
    const p = keyframes(t % 0.9, [
      [0, pose({ torso: 172, lArm: 150, lFore: 200, rArm: 150, rFore: 200, lThigh: -20, rThigh: 22, lShin: -8, rShin: 8, smile: -0.3 })],
      [0.25, pose({ torso: 162, lArm: 150, lFore: 200, rArm: 90, rFore: 90, lThigh: -20, rThigh: 22, lShin: -8, rShin: 8, smile: -0.6, headTilt: 8 })],
      [0.5, pose({ torso: 162, lArm: 150, lFore: 200, rArm: 90, rFore: 90, lThigh: -20, rThigh: 22, lShin: -8, rShin: 8, smile: -0.6, headTilt: 8 })],
      [0.9, pose({ torso: 172, lArm: 150, lFore: 200, rArm: 150, rFore: 200, lThigh: -20, rThigh: 22, lShin: -8, rShin: 8, smile: -0.3 })],
    ]);
    return half ? p : mirror(p);
  },
  dodge: (t) => keyframes(t, [
    [0, pose({ dist: 0, lArm: 150, lFore: 200, rArm: 150, rFore: 200 })],
    [0.2, pose({ torso: 205, headTilt: -6, dist: -0.15, lArm: 150, lFore: 200, rArm: 150, rFore: 200, smile: -0.4, eye: 1.2 })],
    [0.6, pose({ torso: 205, headTilt: -6, dist: -0.15, lArm: 150, lFore: 200, rArm: 150, rFore: 200, smile: -0.4, eye: 1.2 })],
    [0.95, pose({ dist: 0, lArm: 150, lFore: 200, rArm: 150, rFore: 200 })],
  ], 2.5),
  celebrate: (t) => pose({
    torso: 180 + 3 * Math.sin(TAU * 2 * t), headTilt: 4 * Math.sin(TAU * t),
    lift: 0.06 * Math.abs(Math.sin(TAU * 1.5 * t)),
    lArm: 165 + 12 * Math.sin(TAU * 3 * t), lFore: 175 + 10 * Math.sin(TAU * 3 * t),
    rArm: 195 - 12 * Math.sin(TAU * 3 * t), rFore: 185 - 10 * Math.sin(TAU * 3 * t),
    smile: 1, eye: 1.1, mouth: 0.4 + 0.3 * Math.sin(TAU * 2 * t),
  }),
  look_left: (t) => pose({ ...breath(t, 0.6), gaze: -(0.6 + 0.4 * Math.sin((TAU * t) / 2.4)), headTilt: -6 }),
  look_right: (t) => pose({ ...breath(t, 0.6), gaze: 0.6 + 0.4 * Math.sin((TAU * t) / 2.4), headTilt: 6 }),
  surprised: (t) => keyframes(t, [
    [0, pose({})],
    [0.12, pose({ torso: 188, lArm: 170, rArm: 190, lFore: 185, rFore: 175, eye: 1.5, mouth: 0.9, smile: -0.1, lift: 0.06, headTilt: -4 })],
    [0.4, pose({ torso: 186, lArm: 165, rArm: 195, lFore: 180, rFore: 180, eye: 1.5, mouth: 0.9, smile: -0.1, lift: 0, headTilt: -4 })],
  ]),
  scared: (t) => pose({
    torso: 192 + 2 * Math.sin(TAU * 6 * t),
    jitter: 0.01 * Math.sin(TAU * 9 * t),
    lArm: 150 + 10 * Math.sin(TAU * 5 * t), lFore: 200,
    rArm: 160 - 10 * Math.sin(TAU * 5 * t + 1), rFore: 200,
    lThigh: -14, rThigh: 14, lShin: -6, rShin: 6,
    eye: 1.4, smile: -0.8, mouth: 0.5,
    dist: -0.1 * Math.min(t, 1.5),
  }),
  defeated: (t) => keyframes(t, [
    [0, pose({})],
    [0.5, pose({ torso: 96, headTilt: 30, lThigh: 70, rThigh: 60, lShin: 80, rShin: 75, lArm: 120, lFore: 150, rArm: 105, rFore: 130, smile: -1, eye: 0.6 })],
    [1.0, pose({ torso: 94, headTilt: 32, lThigh: 70, rThigh: 60, lShin: 80, rShin: 75, lArm: 120, lFore: 150, rArm: 105, rFore: 130, smile: -1, eye: 0.6, tears: 0 })],
  ]),
  hide: (t) => pose({
    torso: 160, headTilt: 15,
    lThigh: 75, rThigh: 75, lShin: -20, rShin: -20,
    lArm: 150, lFore: 200, rArm: 140, rFore: 200,
    smile: -0.5, eye: 0.8, mouth: 0,
    jitter: 0.006 * Math.sin(TAU * 7 * t),
  }),
};

// Make sure every supported action has an implementation.
for (const name of ACTIONS) {
  if (!ACTION_FNS[name]) throw new Error(`Missing animation for action ${name}`);
}

const EMOTION_FACE = {
  neutral: { smile: 0, eye: 1, headTilt: 0 },
  happy: { smile: 0.5, eye: 1, headTilt: 0 },
  sad: { smile: -0.7, eye: 0.8, headTilt: 6 },
  scared: { smile: -0.4, eye: 1.4, headTilt: 0 },
  angry: { smile: -0.6, eye: 0.7, headTilt: -4 },
  surprised: { smile: 0, eye: 1.4, headTilt: -3 },
  determined: { smile: -0.2, eye: 0.8, headTilt: -2 },
  confused: { smile: -0.2, eye: 1.1, headTilt: 9 },
};

/**
 * Pose for an action at local time t, blended in from the standing pose
 * over 0.3s, with the scene emotion applied to the face.
 * Unknown actions fall back to idle.
 */
export function solvePose(action, t, emotion = 'neutral') {
  const fn = ACTION_FNS[action] ?? ACTION_FNS.idle;
  const time = Math.max(0, Number.isFinite(t) ? t : 0);
  let p = fn(time);
  const blend = clamp01(time / 0.3);
  if (blend < 1) p = mix(ACTION_FNS.stand(0), p, smooth(blend));
  const e = EMOTION_FACE[emotion] ?? EMOTION_FACE.neutral;
  return {
    ...p,
    smile: p.smile + e.smile,
    eye: p.eye * e.eye,
    headTilt: p.headTilt + e.headTilt,
  };
}

/**
 * Forward kinematics. Returns pixel joints for drawing.
 * origin: { x (hip x in px), groundY (px), scale (px per figure height), facing (1|-1) }
 */
export function buildSkeleton(p, origin) {
  const { x, groundY, scale, facing } = origin;
  const d = (a) => [Math.sin(a * D2R), Math.cos(a * D2R)];
  const add = (q, v, len) => [q[0] + v[0] * len, q[1] + v[1] * len];

  const hip = [0, 0];
  const torsoDir = d(p.torso);
  const neck = add(hip, torsoDir, BODY.torso);
  const shoulder = add(hip, torsoDir, BODY.torso * 0.88);
  const head = add(neck, d(p.torso + p.headTilt), BODY.head + 0.02);

  const lElbow = add(shoulder, d(p.lArm), BODY.upper);
  const lHand = add(lElbow, d(p.lFore), BODY.fore);
  const rElbow = add(shoulder, d(p.rArm), BODY.upper);
  const rHand = add(rElbow, d(p.rFore), BODY.fore);
  const lKnee = add(hip, d(p.lThigh), BODY.thigh);
  const lFoot = add(lKnee, d(p.lShin), BODY.shin);
  const rKnee = add(hip, d(p.rThigh), BODY.thigh);
  const rFoot = add(rKnee, d(p.rShin), BODY.shin);

  // Ground contact: the lowest foot (largest y, since y grows downward) sits on groundY.
  const lowest = Math.max(lFoot[1], rFoot[1]);
  const hipY = groundY - lowest * scale - p.lift * scale;
  const hipX = x + facing * p.dist * scale + facing * p.jitter * scale;

  const P = (u) => [hipX + facing * u[0] * scale, hipY + u[1] * scale];
  const headPx = P(head);
  const headR = BODY.head * scale;
  return {
    hip: P(hip),
    neck: P(neck),
    shoulder: P(shoulder),
    head: headPx,
    headR,
    lElbow: P(lElbow), lHand: P(lHand),
    rElbow: P(rElbow), rHand: P(rHand),
    lKnee: P(lKnee), lFoot: P(lFoot),
    rKnee: P(rKnee), rFoot: P(rFoot),
    // Bounding box of the head, used to keep subtitles off faces.
    headBox: { x: headPx[0] - headR, y: headPx[1] - headR, w: headR * 2, h: headR * 2 },
  };
}

export const ACTION_DURATIONS_HINT = { jump: 1.6, fight: 1.8, dodge: 2.5 };
export { ACTIONS };
