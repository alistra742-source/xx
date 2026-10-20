// Frame renderer shared by the browser preview and the server-side MP4 exporter.
// It only uses basic 2D canvas calls so the same code runs in both places.
import { solvePose, buildSkeleton } from './stickfigure.js';
import { drawBackground, drawTint, BACKGROUND_INFO } from './scenery.js';

const TWO_PI = Math.PI * 2;

/** Scene and project geometry for a given output size. */
export function layoutFor(W, H, characterCount = 1) {
  const scale = Math.min(W, H) * (characterCount > 2 ? 0.3 : 0.36);
  return { W, H, scale, groundFraction: BACKGROUND_INFO.white.ground };
}

function drawFigure(ctx, sk, { ink, lineWidth, face, shadowColor, scale }) {
  const seg = (a, b) => { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); };

  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Limbs: upper segment, then forearm/shin, with joints drawn as rounded corners.
  seg(sk.shoulder, sk.lElbow); seg(sk.lElbow, sk.lHand);
  seg(sk.shoulder, sk.rElbow); seg(sk.rElbow, sk.rHand);
  seg(sk.hip, sk.lKnee); seg(sk.lKnee, sk.lFoot);
  seg(sk.hip, sk.rKnee); seg(sk.rKnee, sk.rFoot);
  // Torso.
  seg(sk.hip, sk.neck);

  // Hands and feet.
  for (const p of [sk.lHand, sk.rHand]) { ctx.beginPath(); ctx.arc(p[0], p[1], lineWidth * 0.8, 0, TWO_PI); ctx.fill(); }
  for (const p of [sk.lFoot, sk.rFoot]) {
    seg([p[0] - scale * 0.03, p[1]], [p[0] + scale * 0.05, p[1]]);
  }

  // Head.
  const [hx, hy] = sk.head;
  const r = sk.headR;
  ctx.beginPath();
  ctx.arc(hx, hy, r, 0, TWO_PI);
  ctx.stroke();

  // Face.
  const eyeR = Math.max(1.2, r * 0.12 * face.eye);
  const gazeShift = face.gaze * r * 0.22;
  const eyeY = hy - r * 0.12;
  ctx.beginPath();
  ctx.arc(hx - r * 0.35 + gazeShift, eyeY, eyeR, 0, TWO_PI);
  ctx.arc(hx + r * 0.35 + gazeShift, eyeY, eyeR, 0, TWO_PI);
  ctx.fill();

  const mouthY = hy + r * 0.42;
  ctx.beginPath();
  if (face.mouth > 0.2) {
    ctx.ellipse(hx, mouthY, r * 0.18, Math.max(1, r * 0.22 * face.mouth), 0, 0, TWO_PI);
    ctx.fill();
  } else {
    // Smile when smile > 0 (control point below the line), frown when < 0.
    ctx.moveTo(hx - r * 0.35, mouthY);
    ctx.quadraticCurveTo(hx, mouthY + face.smile * r * 0.35, hx + r * 0.35, mouthY);
    ctx.stroke();
  }

  if (face.tears > 0.3) {
    ctx.fillStyle = '#7fc8ff';
    for (const dx of [-0.35, 0.35]) {
      ctx.beginPath();
      ctx.arc(hx + r * dx + gazeShift, eyeY + r * 0.35, r * 0.07, 0, TWO_PI);
      ctx.fill();
    }
    ctx.fillStyle = ink;
  }

  // Ground shadow.
  if (shadowColor) {
    const footY = Math.max(sk.lFoot[1], sk.rFoot[1]);
    const cx = (sk.lFoot[0] + sk.rFoot[0]) / 2;
    ctx.fillStyle = shadowColor;
    ctx.beginPath();
    ctx.ellipse(cx, footY + 2, scale * 0.22, scale * 0.02, 0, 0, TWO_PI);
    ctx.fill();
    ctx.fillStyle = ink;
  }
}

function drawEffectsBefore(ctx, effects, L, t, ink, action) {
  const { W, H, scale } = L;
  if (effects.includes('motion_lines')) {
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = Math.max(2, scale * 0.012);
    for (let i = 0; i < 4; i++) {
      const y = H * (0.5 + i * 0.05);
      ctx.beginPath();
      ctx.moveTo(W * 0.08 + ((t * 220 + i * 40) % (W * 0.2)), y);
      ctx.lineTo(W * 0.02 + ((t * 220 + i * 40) % (W * 0.2)) + W * 0.1, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  if (effects.includes('speed_lines') && (action === 'run' || action === 'fight')) {
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const x = ((i * 137 + t * 400) % (W * 1.2)) - W * 0.1;
      const y = (i * 53) % H;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - W * 0.08, y + H * 0.02);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  if (effects.includes('explosion')) {
    const k = Math.min(1, t / 0.8);
    if (k < 1) {
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = '#ff9d2e';
      ctx.beginPath();
      const cx = W * 0.5, cy = H * 0.45, R = scale * (0.3 + 0.9 * k);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TWO_PI;
        const rr = i % 2 ? R * 0.5 : R;
        ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

function drawEffectsAfter(ctx, effects, L, t, sketches) {
  const { W, H, scale } = L;
  if (effects.includes('dust') && sketches.length) {
    for (const sk of sketches) {
      const footY = Math.max(sk.lFoot[1], sk.rFoot[1]);
      for (let i = 0; i < 3; i++) {
        const phase = ((t * 1.2 + i / 3) % 1);
        ctx.globalAlpha = 0.5 * (1 - phase);
        ctx.fillStyle = '#c9b89a';
        ctx.beginPath();
        ctx.arc(sk.hip[0] + (i - 1) * scale * 0.2 * (1 + phase), footY - phase * scale * 0.05, scale * (0.04 + phase * 0.05), 0, TWO_PI);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  if (effects.includes('float_text') && sketches.length) {
    const sk = sketches[0];
    const symbol = sk.symbol;
    if (symbol) {
      const rise = ((t * 0.5) % 1) * scale * 0.15;
      ctx.globalAlpha = 1 - ((t * 0.5) % 1);
      ctx.fillStyle = sk.ink;
      ctx.font = `bold ${Math.round(scale * 0.14)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(symbol, sk.head[0] + sk.headR * 1.6, sk.head[1] - sk.headR * 1.3 - rise);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }
  }
}

/** Pick a symbol for float_text based on the figure's current action and emotion. */
function floatSymbol(action, emotion) {
  if (action === 'think' || emotion === 'confused') return '?';
  if (action === 'surprised' || emotion === 'surprised' || action === 'scared' || emotion === 'scared') return '!';
  if (action === 'laugh' || action === 'celebrate') return '♪';
  return '';
}

/**
 * Subtitle position that avoids character heads. Starts at the requested band
 * and tries the other bands if the text box would cover a face.
 */
export function subtitleY(H, position, size, headBoxes) {
  const bands = { bottom: 0.88, middle: 0.5, top: 0.1 };
  const order = [position, 'bottom', 'top', 'middle'].filter((v, i, a) => a.indexOf(v) === i);
  const boxHeight = size * 1.6;
  for (const name of order) {
    const y = H * bands[name];
    const top = y - boxHeight / 2;
    const bottom = y + boxHeight / 2;
    const hit = headBoxes.some((b) => bottom > b.y && top < b.y + b.h);
    if (!hit) return y;
  }
  return H * bands[position];
}

/** Draw a readable caption with outline and translucent backing. */
export function drawSubtitle(ctx, text, W, y, opts) {
  if (!text) return;
  const size = opts.size;
  ctx.font = `bold ${size}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const maxWidth = W * 0.9;
  const w = Math.min(maxWidth, ctx.measureText(text).width + size);
  const h = size * 1.5;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(W / 2 - w / 2, y - h / 2, w, h);
  if (opts.outlineWidth > 0) {
    ctx.strokeStyle = opts.outlineColor;
    ctx.lineWidth = opts.outlineWidth;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, W / 2, y, maxWidth);
  }
  ctx.fillStyle = opts.color;
  ctx.fillText(text, W / 2, y, maxWidth);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/**
 * Render one frame.
 * scene: normalized scene from shared/schema.js
 * t: seconds since the scene started
 * opts: { W, H, ink?, subtitle?: { text, enabled, size, position, color, outlineColor, outlineWidth }, characterCount }
 * Returns nothing; draws on ctx.
 */
export function renderFrame(ctx, scene, t, opts) {
  const { W, H } = opts;
  const dur = Math.max(0.001, scene.duration);
  const local = Math.max(0, Math.min(t, dur));
  const dark = !!BACKGROUND_INFO[scene.background]?.dark;
  const ink = dark ? '#f5f5f5' : '#111111';
  const L = layoutFor(W, H, scene.characters.length);
  const effects = scene.effects || [];
  const shaken = effects.includes('shake');
  const zoom = effects.includes('zoom') ? 1 + 0.06 * (local / dur) : 1;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  drawBackground(ctx, scene.background, W, H, local);

  // Camera: zoom around the centre plus a small shake.
  const shakeX = shaken ? Math.sin(local * 45) * 0.006 * W : 0;
  const shakeY = shaken ? Math.cos(local * 38) * 0.006 * H : 0;
  ctx.translate(W / 2 + shakeX, H / 2 + shakeY);
  ctx.scale(zoom, zoom);
  ctx.translate(-W / 2, -H / 2);

  if (effects.includes('night')) drawTint(ctx, W, H, 'rgba(10,20,60,0.35)');
  if (effects.includes('day')) drawTint(ctx, W, H, 'rgba(255,220,150,0.08)');

  const sketches = [];
  const characterCount = scene.characters.length;
  const mainAction = scene.characters[0]?.action;
  drawEffectsBefore(ctx, effects, L, local, ink, mainAction);

  scene.characters.forEach((c, i) => {
    const pose = solvePose(c.action, local, c.emotion);
    const px = c.position.x * W;
    const py = c.position.y * H;
    const origin = {
      x: px,
      groundY: py,
      scale: L.scale * (characterCount > 2 ? 0.95 : 1),
      facing: c.facing === -1 ? -1 : 1,
    };
    const sk = buildSkeleton(pose, origin);
    sk.ink = ink;
    sk.symbol = effects.includes('float_text') && i === 0 ? floatSymbol(c.action, c.emotion) : '';
    sketches.push(sk);
    drawFigure(ctx, sk, {
      ink,
      lineWidth: Math.max(2, origin.scale * 0.028),
      face: {
        smile: pose.smile,
        eye: pose.eye,
        mouth: pose.mouth,
        tears: pose.tears,
        gaze: pose.gaze,
      },
      shadowColor: dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
      scale: origin.scale,
    });
  });

  drawEffectsAfter(ctx, effects, L, local, sketches);

  if (effects.includes('impact_flash')) {
    const a = Math.max(0, 0.6 - local * 2.5);
    if (a > 0) {
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  ctx.restore();

  // Fade transitions and subtitles are drawn in screen space, after the camera.
  if (effects.includes('fade')) {
    const fadeIn = Math.max(0, 1 - local / 0.35);
    const fadeOut = Math.max(0, 1 - (dur - local) / 0.35);
    const a = Math.max(fadeIn, fadeOut);
    if (a > 0) {
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  const sub = opts.subtitle;
  if (sub?.enabled && sub.text) {
    const headBoxes = sketches.map((s) => s.headBox);
    const y = subtitleY(H, sub.position, sub.size, headBoxes);
    drawSubtitle(ctx, sub.text, W, y, sub);
  }
}

export { BACKGROUND_INFO };
