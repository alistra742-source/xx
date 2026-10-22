// Procedural vector backgrounds. Every background is drawn with rich 2D
// canvas primitives (gradients, layered buildings, windows, lighting, props)
// so it works identically in the browser and on the server-side canvas.

export const BACKGROUND_INFO = {
  white: { dark: false, ground: 0.8 },
  black: { dark: true, ground: 0.8 },
  bedroom: { dark: true, ground: 0.82 },
  street: { dark: true, ground: 0.8 },
  city: { dark: true, ground: 0.8 },
  school: { dark: false, ground: 0.81 },
  office: { dark: false, ground: 0.81 },
  forest: { dark: true, ground: 0.81 },
  desert: { dark: false, ground: 0.8 },
  battlefield: { dark: true, ground: 0.8 },
  horror: { dark: true, ground: 0.8 },
  landscape: { dark: false, ground: 0.8 },
  rooftop: { dark: true, ground: 0.78 },
  bunker: { dark: true, ground: 0.82 },
  lab: { dark: true, ground: 0.82 },
};

/** Shared furniture anchors: actors and set dressing use the same geometry. */
export function bedroomLayout(W, H) {
  const ground = H * BACKGROUND_INFO.bedroom.ground;
  const bed = { x: W * 0.04, w: Math.min(W * 0.65, H * 0.64), mattressY: ground - H * 0.17 };
  const window = { x: W * 0.50, y: H * 0.16, w: W * 0.28, h: H * 0.34 };
  const tv = { x: W * 0.74, y: H * 0.42, w: W * 0.22, h: Math.min(H * 0.16, W * 0.22 * 0.64) };
  return { ground, bed, window, tv };
}

function rect(ctx, color, x, y, w, h) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

// ---- AI-drawn scenery ----
// The language model describes a setting as sky/ground colours plus a short list
// of vector shapes in 0-1 coordinates (x across the frame, y down from the top).
// normalizeScenery clamps everything, so any model output is safe to draw.
const SHAPE_TYPES = ['rect', 'ellipse', 'poly', 'line'];
const MAX_SHAPES = 30;
const MAX_POINTS = 12;

const hexColor = (v) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : null);
const unit = (v, fallback) => {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
};

function luminance(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

function normalizeShape(s) {
  if (!s || typeof s !== 'object' || !SHAPE_TYPES.includes(s.type)) return null;
  const color = hexColor(s.color);
  if (!color) return null;
  const base = { type: s.type, color, alpha: unit(s.alpha, 1) };
  if (s.type === 'rect') {
    const x = unit(s.x, null), y = unit(s.y, null), w = unit(s.w, null), h = unit(s.h, null);
    return [x, y, w, h].includes(null) ? null : { ...base, x, y, w, h };
  }
  if (s.type === 'ellipse') {
    const cx = unit(s.cx, null), cy = unit(s.cy, null), rx = unit(s.rx, null), ry = unit(s.ry, null);
    return [cx, cy, rx, ry].includes(null) ? null : { ...base, cx, cy, rx, ry };
  }
  const points = (Array.isArray(s.points) ? s.points : []).slice(0, MAX_POINTS)
    .map((p) => (Array.isArray(p) ? [unit(p[0], null), unit(p[1], null)] : null))
    .filter((p) => p && p[0] !== null && p[1] !== null);
  if (points.length < (s.type === 'poly' ? 3 : 2)) return null;
  return { ...base, points, width: unit(s.width, 0.006) };
}

/** Validate an AI-written scenery spec. Returns null when it is unusable (the named background is used instead). */
export function normalizeScenery(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const sky = (Array.isArray(raw.sky) ? raw.sky : []).map(hexColor).filter(Boolean);
  const ground = hexColor(raw.ground);
  if (sky.length === 0 || !ground) return null;
  const skyColors = [sky[0], sky[sky.length - 1]];
  const horizon = unit(raw.horizon, 0.8);
  const shapes = (Array.isArray(raw.shapes) ? raw.shapes : []).slice(0, MAX_SHAPES).map(normalizeShape).filter(Boolean);
  const avgLum = [...skyColors, ground].reduce((sum, c) => sum + luminance(c), 0) / 3;
  return {
    sky: skyColors,
    ground,
    horizon: Math.min(0.92, Math.max(0.55, horizon)),
    dark: avgLum < 0.5,
    shapes,
  };
}

function drawShape(ctx, s, W, H) {
  ctx.save();
  ctx.globalAlpha = s.alpha;
  ctx.fillStyle = s.color;
  ctx.strokeStyle = s.color;
  ctx.beginPath();
  if (s.type === 'rect') {
    ctx.rect(s.x * W, s.y * H, s.w * W, s.h * H);
    ctx.fill();
  } else if (s.type === 'ellipse') {
    ctx.ellipse(s.cx * W, s.cy * H, Math.max(1, s.rx * W), Math.max(1, s.ry * H), 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (s.type === 'poly') {
    s.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * W, y * H) : ctx.lineTo(x * W, y * H)));
    ctx.closePath();
    ctx.fill();
  } else {
    s.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * W, y * H) : ctx.lineTo(x * W, y * H)));
    ctx.lineWidth = Math.max(1, s.width * H);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  ctx.restore();
}

/** Draw a normalized AI scenery spec filling W x H (sky gradient, ground, then shapes in order). */
export function drawScenery(ctx, spec, W, H) {
  const groundY = H * spec.horizon;
  const sky = vGrad(ctx, 0, groundY, [[0, spec.sky[0]], [1, spec.sky[1]]]);
  rect(ctx, sky, 0, 0, W, groundY);
  rect(ctx, spec.ground, 0, groundY, W, H - groundY);
  spec.shapes.forEach((s) => drawShape(ctx, s, W, H));
}

function roundRect(ctx, color, x, y, w, h, r = 6) {
  ctx.fillStyle = color;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
  ctx.fill();
}

function circle(ctx, color, x, y, r) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function poly(ctx, color, points) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  ctx.fill();
}

function vGrad(ctx, y0, y1, stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [p, c] of stops) g.addColorStop(p, c);
  return g;
}

// Deterministic pseudo-random so the same scene always looks identical.
function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return (s % 10000) / 10000;
  };
}

function drawStars(ctx, W, maxY, rnd, count = 35, t = 0) {
  for (let i = 0; i < count; i++) {
    const x = rnd() * W;
    const y = rnd() * maxY;
    const r = 0.8 + rnd() * 1.6;
    const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + i * 1.7));
    ctx.fillStyle = `rgba(255,255,255,${(0.35 + rnd() * 0.5) * twinkle})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ---- drawn object library -------------------------------------------------
   Reusable set dressing: houses, apartment blocks, doors, windows, phones,
   clothing on lines, cars and street furniture. Backgrounds compose these so
   every frame is full of recognisable things instead of empty colour fields. */

/** Paneled wood, glass shop or steel blast door with frame, handle and rivets. */
function drawDoor(ctx, x, y, w, h, opts = {}) {
  const style = opts.style || 'wood';
  const u = Math.min(w, h);
  rect(ctx, opts.trim || '#0b1220', x - w * 0.07, y - h * 0.04, w * 1.14, h * 1.04);
  const grad = ctx.createLinearGradient(x, y, x + w, y + h);
  if (style === 'steel') {
    grad.addColorStop(0, '#94a3b8'); grad.addColorStop(0.45, '#475569'); grad.addColorStop(1, '#1e293b');
  } else if (style === 'glass') {
    grad.addColorStop(0, '#0f3b57'); grad.addColorStop(0.55, '#0ea5e9'); grad.addColorStop(1, '#082f49');
  } else {
    grad.addColorStop(0, '#8b5a3c'); grad.addColorStop(0.5, '#5b3420'); grad.addColorStop(1, '#3f2417');
  }
  rect(ctx, grad, x, y, w, h);
  if (style === 'glass') {
    rect(ctx, 'rgba(255,224,166,0.45)', x + w * 0.12, y + h * 0.1, w * 0.5, h * 0.45);
    circle(ctx, '#fbbf24', x + w * 0.84, y + h * 0.55, Math.max(1.4, u * 0.03));
  } else if (style === 'steel') {
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = Math.max(1.5, u * 0.05);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.moveTo(x + w, y); ctx.lineTo(x, y + h); ctx.stroke();
    circle(ctx, '#0f172a', x + w * 0.5, y + h * 0.5, u * 0.16);
    circle(ctx, '#94a3b8', x + w * 0.5, y + h * 0.5, u * 0.11);
    circle(ctx, '#0f172a', x + w * 0.5, y + h * 0.5, u * 0.05);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      circle(ctx, '#cbd5e1', x + w * 0.5 + Math.cos(a) * u * 0.21, y + h * 0.5 + Math.sin(a) * u * 0.21, Math.max(0.8, u * 0.02));
    }
  } else {
    ctx.strokeStyle = 'rgba(0,0,0,0.32)';
    ctx.lineWidth = Math.max(1, u * 0.022);
    for (const [px, py, pw, ph] of [[0.14, 0.08, 0.72, 0.3], [0.14, 0.46, 0.72, 0.44]]) {
      ctx.strokeRect(x + w * px, y + h * py, w * pw, h * ph);
    }
    circle(ctx, '#fbbf24', x + w * 0.84, y + h * 0.54, Math.max(1.4, u * 0.04));
    rect(ctx, '#0f172a', x + w * 0.82, y + h * 0.58, Math.max(1, u * 0.014), Math.max(2, h * 0.045));
  }
  if (opts.number) {
    rect(ctx, '#0f172a', x + w * 0.28, y - h * 0.16, w * 0.44, h * 0.1);
    rect(ctx, '#e2e8f0', x + w * 0.34, y - h * 0.137, w * 0.32, h * 0.05);
  }
}

/** Mullioned window with light, blinds, curtains and an optional flower box. */
function drawWindow(ctx, x, y, w, h, opts = {}) {
  const u = Math.min(w, h);
  const warm = opts.light !== 'cool';
  rect(ctx, opts.trim || '#334155', x - w * 0.06, y - h * 0.06, w * 1.12, h * 1.16);
  rect(ctx, vGrad(ctx, y, y + h, warm ? [[0, '#fde68a'], [1, '#f59e0b']] : [[0, '#7dd3fc'], [1, '#1d4ed8']]), x, y, w, h);
  rect(ctx, 'rgba(255,255,255,0.2)', x + w * 0.08, y + h * 0.06, w * 0.3, h * 0.7);
  if (opts.blinds) {
    for (let i = 0; i < 6; i++) rect(ctx, 'rgba(15,23,42,0.55)', x, y + h * (0.08 + i * 0.15), w, Math.max(1, h * 0.055));
  }
  rect(ctx, opts.trim || '#334155', x + w * 0.46, y, Math.max(1, w * 0.08), h);
  rect(ctx, opts.trim || '#334155', x, y + h * 0.46, w, Math.max(1, h * 0.08));
  rect(ctx, opts.trim || '#334155', x - w * 0.1, y + h, w * 1.2, Math.max(1.5, h * 0.09));
  if (opts.curtain) {
    poly(ctx, opts.curtain, [[x - w * 0.16, y - h * 0.1], [x + w * 0.22, y - h * 0.1], [x + w * 0.1, y + h * 1.02], [x - w * 0.16, y + h * 1.02]]);
    poly(ctx, opts.curtain, [[x + w * 1.16, y - h * 0.1], [x + w * 0.78, y - h * 0.1], [x + w * 0.9, y + h * 1.02], [x + w * 1.16, y + h * 1.02]]);
  }
  if (opts.box) {
    roundRect(ctx, '#7c2d12', x - w * 0.06, y + h * 1.05, w * 1.12, h * 0.2, Math.max(1, u * 0.06));
    for (let i = 0; i < 4; i++) circle(ctx, i % 2 ? '#f472b6' : '#22c55e', x + w * (0.1 + i * 0.26), y + h * 1.02, Math.max(1, u * 0.08));
  }
}

/** Free-standing house: gabled roof, chimney smoke, lit windows and a front door. */
function drawHouse(ctx, x, ground, w, h, opts = {}) {
  const u = Math.min(w, h);
  const top = ground - h;
  rect(ctx, opts.wall || '#cbd5e1', x, top, w, h);
  rect(ctx, 'rgba(0,0,0,0.14)', x, top + h * 0.62, w, h * 0.38);
  poly(ctx, opts.roof || '#7f1d1d', [[x - w * 0.08, top], [x + w * 0.5, top - h * 0.6], [x + w * 1.08, top]]);
  poly(ctx, 'rgba(255,255,255,0.1)', [[x - w * 0.08, top], [x + w * 0.5, top - h * 0.6], [x + w * 0.5, top]]);
  rect(ctx, '#7c2d12', x + w * 0.72, top - h * 0.5, w * 0.1, h * 0.3);
  for (let i = 0; i < 3; i++) {
    circle(ctx, `rgba(226,232,240,${0.2 - i * 0.05})`, x + w * 0.77 + (i + 1) * w * 0.03, top - h * (0.6 + i * 0.12), u * (0.05 + i * 0.03));
  }
  drawDoor(ctx, x + w * 0.4, ground - h * 0.52, w * 0.2, h * 0.52);
  drawWindow(ctx, x + w * 0.09, top + h * 0.18, w * 0.2, h * 0.22, { light: opts.light || 'warm', box: true });
  drawWindow(ctx, x + w * 0.71, top + h * 0.18, w * 0.2, h * 0.22, { light: 'cool', box: true });
  rect(ctx, '#94a3b8', x + w * 0.34, ground - h * 0.04, w * 0.32, h * 0.04);
  if (opts.fence) drawFence(ctx, x - w * 0.14, ground, w * 0.26, h * 0.3);
  if (opts.mailbox) drawMailbox(ctx, x + w * 0.96, ground, h * 0.26);
}

/** Multi-storey apartment block with lit windows, balconies, laundry, awning and water tank. */
function drawApartmentBlock(ctx, x, ground, w, h, rnd = () => 0.5, opts = {}) {
  const top = ground - h;
  const u = Math.min(w, h);
  rect(ctx, opts.body || '#0f172a', x, top, w, h);
  rect(ctx, 'rgba(255,255,255,0.06)', x, top, w, h * 0.035);
  const floors = Math.max(3, Math.round(h / Math.max(26, u * 0.3)));
  const floorH = h / floors;
  const cols = Math.max(2, Math.round(w / Math.max(30, u * 0.34)));
  for (let f = 0; f < floors - 1; f++) {
    const y = top + f * floorH;
    for (let c = 0; c < cols; c++) {
      const wx = x + (c + 0.18) * (w / cols);
      const ww = (w / cols) * 0.64;
      const lit = rnd() > 0.38;
      drawWindow(ctx, wx, y + floorH * 0.24, ww, floorH * 0.46, { light: lit && rnd() > 0.25 ? 'warm' : 'cool', blinds: !lit && rnd() > 0.5 });
      if (c % 2 === 0 && rnd() > 0.45) {
        rect(ctx, '#334155', wx - ww * 0.14, y + floorH * 0.76, ww * 1.28, Math.max(1, floorH * 0.07));
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = Math.max(1, u * 0.008);
        for (let b = 0; b <= 4; b++) {
          const bx = wx - ww * 0.12 + (b / 4) * ww * 1.24;
          ctx.beginPath(); ctx.moveTo(bx, y + floorH * 0.76); ctx.lineTo(bx, y + floorH * 0.5); ctx.stroke();
        }
        if (rnd() > 0.55) drawClothesline(ctx, wx, y + floorH * 0.52, wx + ww, y + floorH * 0.52, 3, rnd, floorH * 1.1);
      }
    }
  }
  drawDoor(ctx, x + w * 0.36, ground - floorH * 1.02, w * 0.28, floorH * 1.02, { style: 'glass', number: true });
  poly(ctx, '#1e293b', [[x + w * 0.22, ground - floorH * 1.14], [x + w * 0.78, ground - floorH * 1.14], [x + w * 0.74, ground - floorH * 0.98], [x + w * 0.26, ground - floorH * 0.98]]);
  rect(ctx, '#475569', x + w * 0.66, top - h * 0.11, w * 0.22, h * 0.11);
  poly(ctx, '#334155', [[x + w * 0.64, top - h * 0.11], [x + w * 0.77, top - h * 0.19], [x + w * 0.9, top - h * 0.11]]);
}

/** Rope line with shirts, trousers, towels, socks and pegs. */
function drawClothesline(ctx, x1, y1, x2, y2, count = 4, rnd = () => 0.5, size = 40) {
  const sag = size * 0.45;
  ctx.strokeStyle = 'rgba(203,213,225,0.55)';
  ctx.lineWidth = Math.max(1, size * 0.02);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo((x1 + x2) / 2, y1 + sag * 2, x2, y2); ctx.stroke();
  const garments = ['#ef4444', '#f8fafc', '#3b82f6', '#facc15', '#a855f7', '#22c55e'];
  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1);
    const px = x1 + (x2 - x1) * t;
    const py = y1 + (y2 - y1) * t + sag * 2 * t * (1 - t) * 0.5;
    const cw = size * (0.34 + rnd() * 0.12);
    const ch = size * (0.5 + rnd() * 0.28);
    const color = garments[Math.floor(rnd() * garments.length) % garments.length];
    if (rnd() > 0.68) {
      rect(ctx, color, px - cw * 0.42, py, cw * 0.84, ch * 0.48);
      rect(ctx, color, px - cw * 0.4, py + ch * 0.44, cw * 0.34, ch * 0.52);
      rect(ctx, color, px + cw * 0.06, py + ch * 0.44, cw * 0.34, ch * 0.52);
    } else {
      poly(ctx, color, [[px - cw * 0.5, py], [px - cw * 0.28, py - ch * 0.06], [px + cw * 0.28, py - ch * 0.06], [px + cw * 0.5, py], [px + cw * 0.33, py + ch * 0.2], [px + cw * 0.3, py + ch * 0.7], [px - cw * 0.3, py + ch * 0.7], [px - cw * 0.33, py + ch * 0.2]]);
      circle(ctx, 'rgba(0,0,0,0.22)', px, py + ch * 0.28, Math.max(1, cw * 0.05));
    }
    rect(ctx, '#fde68a', px - Math.max(1, cw * 0.05), py - ch * 0.1, Math.max(1.5, cw * 0.1), ch * 0.12);
  }
}

/** Picket fence run. */
function drawFence(ctx, x, ground, w, h) {
  for (let i = 0; i < 6; i++) {
    const px = x + (i / 5) * w;
    poly(ctx, '#e2e8f0', [[px, ground], [px + w * 0.04, ground], [px + w * 0.04, ground - h * 0.84], [px + w * 0.02, ground - h], [px, ground - h * 0.84]]);
  }
  rect(ctx, '#94a3b8', x, ground - h * 0.62, w, Math.max(1, h * 0.06));
  rect(ctx, '#94a3b8', x, ground - h * 0.3, w, Math.max(1, h * 0.06));
}

function drawMailbox(ctx, x, ground, h) {
  rect(ctx, '#78350f', x, ground - h * 0.9, Math.max(2, h * 0.06), h * 0.9);
  roundRect(ctx, '#0ea5e9', x - h * 0.15, ground - h * 0.98, h * 0.32, h * 0.24, h * 0.08);
  rect(ctx, '#f8fafc', x - h * 0.1, ground - h * 0.9, h * 0.12, Math.max(1, h * 0.02));
}

function drawBin(ctx, x, ground, h) {
  roundRect(ctx, '#334155', x, ground - h, h * 0.44, h, h * 0.07);
  rect(ctx, '#64748b', x - h * 0.03, ground - h - h * 0.06, h * 0.5, h * 0.08);
  rect(ctx, '#1e293b', x + h * 0.09, ground - h + h * 0.12, h * 0.26, Math.max(1, h * 0.2));
}

function drawHydrant(ctx, x, ground, h) {
  rect(ctx, '#b91c1c', x - h * 0.07, ground - h * 0.72, h * 0.14, h * 0.72);
  circle(ctx, '#ef4444', x, ground - h * 0.78, h * 0.1);
  rect(ctx, '#7f1d1d', x - h * 0.14, ground - h * 0.5, h * 0.28, Math.max(1, h * 0.06));
  rect(ctx, '#7f1d1d', x - h * 0.11, ground - h * 0.34, h * 0.22, Math.max(1, h * 0.05));
}

function drawBench(ctx, x, ground, w, h) {
  for (const f of [0.28, 0.45, 0.85]) rect(ctx, '#78350f', x, ground - h * f, w, Math.max(1, h * 0.07));
  rect(ctx, '#475569', x + w * 0.08, ground - h * 0.45, Math.max(1, h * 0.06), h * 0.45);
  rect(ctx, '#475569', x + w * 0.88, ground - h * 0.45, Math.max(1, h * 0.06), h * 0.45);
}

function drawCar(ctx, x, ground, w, color = '#dc2626') {
  const h = w * 0.44;
  roundRect(ctx, color, x, ground - h * 0.66, w, h * 0.66, h * 0.14);
  poly(ctx, color, [[x + w * 0.2, ground - h * 0.66], [x + w * 0.32, ground - h], [x + w * 0.72, ground - h], [x + w * 0.84, ground - h * 0.66]]);
  rect(ctx, '#0f172a', x + w * 0.34, ground - h * 0.94, w * 0.13, h * 0.24);
  rect(ctx, '#0f172a', x + w * 0.52, ground - h * 0.94, w * 0.15, h * 0.24);
  for (const wx of [0.22, 0.8]) {
    circle(ctx, '#e2e8f0', x + w * wx, ground - h * 0.06, h * 0.13);
    circle(ctx, '#0f172a', x + w * wx, ground - h * 0.06, h * 0.065);
  }
  rect(ctx, '#fde68a', x + w * 0.95, ground - h * 0.46, w * 0.04, h * 0.12);
  rect(ctx, '#ef4444', x + w * 0.01, ground - h * 0.46, w * 0.04, h * 0.12);
}

function drawPowerLine(ctx, x1, x2, groundY, h) {
  for (const x of [x1, x2]) {
    rect(ctx, '#1e293b', x - Math.max(1, h * 0.012), groundY - h, Math.max(2, h * 0.024), h);
    rect(ctx, '#1e293b', x - h * 0.14, groundY - h * 0.86, h * 0.28, Math.max(1, h * 0.02));
  }
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = Math.max(1, h * 0.008);
  for (let w = 0; w < 3; w++) {
    const y = groundY - h * 0.84 + w * h * 0.03;
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.quadraticCurveTo((x1 + x2) / 2, y + h * 0.04, x2, y); ctx.stroke();
  }
  for (let i = 0; i < 3; i++) circle(ctx, '#0f172a', x1 + (x2 - x1) * (0.28 + i * 0.18), groundY - h * 0.83, Math.max(1, h * 0.01));
}

function drawWallPhone(ctx, x, y, s, color = '#ef4444') {
  roundRect(ctx, '#e2e8f0', x, y, s * 0.9, s * 1.4, s * 0.1);
  rect(ctx, color, x + s * 0.14, y + s * 0.12, s * 0.62, s * 0.36);
  circle(ctx, '#0f172a', x + s * 0.3, y + s * 0.9, s * 0.07);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.beginPath(); ctx.moveTo(x + s * 0.82, y + s * 1.2); ctx.bezierCurveTo(x + s * 1.5, y + s * 1.5, x + s * 1.1, y + s * 2.1, x + s * 0.5, y + s * 1.9); ctx.stroke();
}

function drawDeskPhone(ctx, x, y, s) {
  roundRect(ctx, '#1e293b', x, y, s * 1.2, s * 0.5, s * 0.08);
  roundRect(ctx, '#e2e8f0', x + s * 0.05, y - s * 0.2, s * 1.1, s * 0.22, s * 0.07);
  for (let i = 0; i < 4; i++) circle(ctx, '#94a3b8', x + s * (0.2 + i * 0.2), y + s * 0.33, s * 0.05);
}

function drawACUnit(ctx, x, y, w, h) {
  roundRect(ctx, '#94a3b8', x, y, w, h, Math.max(1, h * 0.14));
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = Math.max(1, h * 0.05);
  for (let i = 0; i < 3; i++) {
    ctx.beginPath(); ctx.moveTo(x + w * 0.1, y + h * (0.28 + i * 0.2)); ctx.lineTo(x + w * 0.7, y + h * (0.28 + i * 0.2)); ctx.stroke();
  }
  circle(ctx, '#334155', x + w * 0.85, y + h * 0.5, h * 0.22);
}

function drawPipeRun(ctx, x, y, w, h) {
  rect(ctx, '#64748b', x, y, w, h);
  rect(ctx, '#94a3b8', x, y, w, Math.max(1, h * 0.28));
  for (let i = 1; i < 6; i++) rect(ctx, '#334155', x + w * (i / 6), y, Math.max(1, w * 0.012), h);
}

function drawCrate(ctx, x, ground, w, h) {
  rect(ctx, '#78350f', x, ground - h, w, h);
  rect(ctx, '#a16207', x, ground - h, w, Math.max(1, h * 0.1));
  ctx.strokeStyle = '#451a03';
  ctx.lineWidth = Math.max(1, w * 0.03);
  ctx.beginPath(); ctx.moveTo(x, ground - h); ctx.lineTo(x + w, ground); ctx.moveTo(x + w, ground - h); ctx.lineTo(x, ground); ctx.stroke();
}

function drawLockers(ctx, x, ground, w, h, count = 3, color = '#2563eb') {
  const lw = w / count;
  for (let i = 0; i < count; i++) {
    rect(ctx, color, x + i * lw, ground - h, lw - 2, h);
    rect(ctx, 'rgba(255,255,255,0.14)', x + i * lw, ground - h, lw * 0.22, h);
    for (let v = 0; v < 3; v++) rect(ctx, '#0f172a', x + i * lw + lw * 0.26, ground - h * 0.86 + v * h * 0.09, lw * 0.4, Math.max(1, h * 0.02));
    circle(ctx, '#e2e8f0', x + i * lw + lw * 0.8, ground - h * 0.5, Math.max(1, lw * 0.07));
  }
  const jx = x + lw * 0.2;
  poly(ctx, '#ef4444', [[jx, ground - h * 0.95], [jx + lw * 0.6, ground - h * 0.95], [jx + lw * 0.5, ground - h * 0.45], [jx + lw * 0.1, ground - h * 0.45]]);
}

function drawPictureFrame(ctx, x, y, w, h, tilt = 0) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(tilt);
  rect(ctx, '#78350f', -w / 2, -h / 2, w, h);
  rect(ctx, '#93c5fd', -w / 2 + w * 0.09, -h / 2 + h * 0.09, w * 0.82, h * 0.82);
  poly(ctx, '#64748b', [[-w * 0.3, h * 0.3], [0, -h * 0.12], [w * 0.3, h * 0.3]]);
  ctx.restore();
}

function drawWallClock(ctx, x, y, r) {
  circle(ctx, '#0f172a', x, y, r);
  circle(ctx, '#f8fafc', x, y, r * 0.86);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = Math.max(1, r * 0.14);
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - r * 0.52); ctx.moveTo(x, y); ctx.lineTo(x + r * 0.38, y); ctx.stroke();
}

function drawChairWithClothes(ctx, x, ground, h) {
  rect(ctx, '#475569', x, ground - h * 0.55, h * 0.5, Math.max(1, h * 0.06));
  rect(ctx, '#334155', x + h * 0.02, ground - h * 0.55, Math.max(1, h * 0.04), h * 0.55);
  rect(ctx, '#334155', x + h * 0.42, ground - h * 0.55, Math.max(1, h * 0.04), h * 0.55);
  rect(ctx, '#475569', x + h * 0.44, ground - h, Math.max(1, h * 0.06), h * 0.5);
  poly(ctx, '#ef4444', [[x + h * 0.02, ground - h * 0.5], [x + h * 0.5, ground - h * 0.5], [x + h * 0.44, ground - h * 0.12], [x + h * 0.08, ground - h * 0.12]]);
  poly(ctx, '#3b82f6', [[x + h * 0.06, ground - h * 0.98], [x + h * 0.46, ground - h * 0.98], [x + h * 0.4, ground - h * 0.6], [x + h * 0.12, ground - h * 0.6]]);
}

/**
 * Draw a rich atmospheric background filling W x H.
 * `t` is local scene time in seconds, used for ambient motion (TV flicker, sirens, clouds, fog).
 */
export function drawBackground(ctx, name, W, H, t = 0) {
  const g = BACKGROUND_INFO[name] ? name : 'street';
  const groundY = H * BACKGROUND_INFO[g].ground;
  const rnd = seeded(g.length * 9973 + Math.round(W));
  // Opaque underpainting avoids fractional wall/floor alpha seams in exports.
  rect(ctx, BACKGROUND_INFO[g].dark ? '#101a28' : '#e7e5dc', 0, 0, W, H);

  switch (g) {
    case 'black': {
      rect(ctx, vGrad(ctx, 0, H, [[0, '#05070d'], [1, '#111625']]), 0, 0, W, H);
      rect(ctx, '#181e2e', 0, groundY, W, H - groundY);
      rect(ctx, '#2b3550', 0, groundY, W, 2);
      break;
    }

    case 'white': {
      rect(ctx, vGrad(ctx, 0, groundY, [[0, '#f8fafc'], [1, '#e2e8f0']]), 0, 0, W, groundY);
      rect(ctx, '#cbd5e1', 0, groundY, W, H - groundY);
      rect(ctx, '#94a3b8', 0, groundY, W, 2);
      break;
    }

    case 'bedroom': {
      // Cozy night apartment bedroom with bed on left, window in middle-right looking onto street, and glowing TV on right
      rect(ctx, vGrad(ctx, 0, groundY, [[0, '#131629'], [1, '#232742']]), 0, 0, W, groundY);
      // Wallpaper vertical subtle stripes
      ctx.fillStyle = 'rgba(255,255,255,0.02)';
      for (let x = 0; x < W; x += W * 0.08) ctx.fillRect(x, 0, W * 0.03, groundY);

      // Wooden floor + baseboard
      rect(ctx, '#1b1410', 0, groundY - 8, W, 8);
      rect(ctx, vGrad(ctx, groundY, H, [[0, '#3a281d'], [1, '#221710']]), 0, groundY, W, H - groundY);
      // Floor plank lines
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth = 2;
      for (let i = 1; i < 5; i++) {
        const py = groundY + ((H - groundY) * i) / 5;
        ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke();
      }
      // Rug in center
      roundRect(ctx, '#3b1d38', W * 0.25, groundY + (H - groundY) * 0.18, W * 0.5, (H - groundY) * 0.55, 10);

      // Large Apartment Window (looking down at night city & glowing green mist below)
      const wx = W * 0.50, wy = H * 0.16, ww = W * 0.28, wh = H * 0.34;
      roundRect(ctx, '#090d1a', wx - 6, wy - 6, ww + 12, wh + 12, 4);
      rect(ctx, vGrad(ctx, wy, wy + wh, [[0, '#070b18'], [0.65, '#13203d'], [1, '#153a2a']]), wx, wy, ww, wh);
      // Moon outside window
      circle(ctx, '#fef08a', wx + ww * 0.75, wy + wh * 0.22, Math.min(ww, wh) * 0.11);
      // Distant city silhouettes in window
      for (let i = 0; i < 6; i++) {
        const bw = ww / 6.2;
        const bh = wh * (0.28 + ((i * 37) % 10) * 0.035);
        rect(ctx, '#0b1020', wx + i * (ww / 6), wy + wh - bh, bw, bh);
      }
      // Red/green emergency glow pulsing outside window
      const pulse = 0.15 + 0.15 * Math.sin(t * 6);
      rect(ctx, `rgba(239,68,68,${pulse})`, wx, wy, ww, wh);
      // Window panes & sill
      rect(ctx, '#2d3552', wx + ww * 0.5 - 2, wy, 4, wh);
      rect(ctx, '#2d3552', wx, wy + wh * 0.55 - 2, ww, 4);
      rect(ctx, '#3b4468', wx - 10, wy + wh + 2, ww + 20, 8);
      // Curtains
      poly(ctx, '#312e81', [[wx - 8, wy - 6], [wx + ww * 0.18, wy - 6], [wx + ww * 0.08, wy + wh + 4], [wx - 8, wy + wh + 4]]);
      poly(ctx, '#312e81', [[wx + ww + 8, wy - 6], [wx + ww * 0.82, wy - 6], [wx + ww * 0.92, wy + wh + 4], [wx + ww + 8, wy + wh + 4]]);

      // Wall dressing: framed pictures and a clock, so the room reads as lived in.
      drawPictureFrame(ctx, W * 0.09, H * 0.17, W * 0.09, H * 0.11, -0.05);
      drawPictureFrame(ctx, W * 0.21, H * 0.2, W * 0.07, H * 0.09, 0.06);
      drawWallClock(ctx, W * 0.36, H * 0.15, Math.min(W, H) * 0.035);
      drawWallPhone(ctx, W * 0.86, H * 0.22, Math.min(W, H) * 0.04, '#2563eb');

      // Bed on left side
      const bedroom = bedroomLayout(W, H);
      const bx = bedroom.bed.x, bw = bedroom.bed.w, bedTop = bedroom.bed.mattressY + H * 0.01;
      roundRect(ctx, '#451a03', bx, bedTop - H * 0.09, W * 0.035, H * 0.25, 4); // headboard
      roundRect(ctx, '#5c2d16', bx, groundY - H * 0.07, bw, H * 0.07, 3); // frame
      roundRect(ctx, '#e2e8f0', bx + W * 0.03, bedTop - H * 0.01, bw - W * 0.03, H * 0.06, 6); // mattress
      roundRect(ctx, '#f8fafc', bx + bw * 0.035, bedTop - H * 0.045, bw * 0.25, H * 0.04, 8); // pillow
      roundRect(ctx, '#2563eb', bx + bw * 0.29, bedTop - H * 0.008, bw * 0.71, H * 0.065, 6); // blanket

      // Phone charging on the mattress, dumped clothes and slippers on the floor.
      roundRect(ctx, '#0f172a', bx + bw * 0.7, bedTop - H * 0.02, W * 0.018, H * 0.035, W * 0.004);
      rect(ctx, '#38bdf8', bx + bw * 0.706, bedTop - H * 0.014, W * 0.006, H * 0.02);
      ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = Math.max(1, W * 0.002);
      ctx.beginPath(); ctx.moveTo(bx + bw * 0.718, bedTop - H * 0.002); ctx.quadraticCurveTo(bx + bw * 0.78, bedTop + H * 0.02, bx + bw * 0.74, groundY - H * 0.01); ctx.stroke();
      drawChairWithClothes(ctx, W * 0.62, groundY + (H - groundY) * 0.06, H * 0.2);
      poly(ctx, '#f472b6', [[W * 0.3, groundY + (H - groundY) * 0.3], [W * 0.36, groundY + (H - groundY) * 0.26], [W * 0.37, groundY + (H - groundY) * 0.34], [W * 0.31, groundY + (H - groundY) * 0.38]]);
      poly(ctx, '#e2e8f0', [[W * 0.46, groundY + (H - groundY) * 0.34], [W * 0.53, groundY + (H - groundY) * 0.32], [W * 0.52, groundY + (H - groundY) * 0.4], [W * 0.47, groundY + (H - groundY) * 0.42]]);

      // TV Stand & Wide-screen TV on right side (Emergency Broadcast!)
      const { x: tx, w: tw, y: ty, h: th } = bedroom.tv;
      roundRect(ctx, '#1f2437', tx + tw * 0.08, groundY - H * 0.1, tw * 0.84, H * 0.1, 4); // cabinet
      rect(ctx, '#0f172a', tx + tw * 0.44, ty + th, tw * 0.12, H * 0.025); // stand neck
      roundRect(ctx, '#090d16', tx - 4, ty - 4, tw + 8, th + 8, 5); // bezel
      const tvFlicker = 0.85 + 0.15 * Math.sin(t * 19);
      rect(ctx, `rgba(30,58,138,${tvFlicker})`, tx, ty, tw, th);
      // Red "BREAKING NEWS / VIRUS ALERT" banner on the TV screen
      rect(ctx, '#dc2626', tx, ty + th * 0.68, tw, th * 0.24);
      rect(ctx, '#facc15', tx + tw * 0.06, ty + th * 0.14, tw * 0.35, th * 0.14);
      // News anchor silhouette on TV
      circle(ctx, '#e2e8f0', tx + tw * 0.68, ty + th * 0.36, Math.min(tw, th) * 0.12);
      roundRect(ctx, '#cbd5e1', tx + tw * 0.54, ty + th * 0.48, tw * 0.28, th * 0.2, 4);
      // TV screen ambient light cone
      poly(ctx, `rgba(56,189,248,${0.08 * tvFlicker})`, [
        [tx, ty], [tx - W * 0.28, ty - H * 0.06], [tx - W * 0.28, groundY], [tx, ty + th],
      ]);
      break;
    }

    case 'street': {
      // Dramatic urban street with buildings, streetlights, glowing windows, road markings, and mist
      rect(ctx, vGrad(ctx, 0, groundY, [[0, '#090d1a'], [0.6, '#16213e'], [1, '#1e293b']]), 0, 0, W, groundY);
      drawStars(ctx, W, groundY * 0.5, rnd, 25, t);
      circle(ctx, '#fde68a', W * 0.84, H * 0.13, Math.min(W, H) * 0.055);
      circle(ctx, 'rgba(253,230,138,0.12)', W * 0.84, H * 0.13, Math.min(W, H) * 0.11);

      // Background skyline
      for (let i = 0; i < 9; i++) {
        const bw = W * (0.11 + rnd() * 0.06);
        const bh = H * (0.28 + rnd() * 0.26);
        const bx = i * (W / 8) - bw * 0.3;
        rect(ctx, i % 2 === 0 ? '#111827' : '#172033', bx, groundY - bh, bw, bh);
        // Windows
        for (let wy = groundY - bh + 14; wy < groundY - 24; wy += 24) {
          for (let wx = bx + 8; wx < bx + bw - 14; wx += 18) {
            if (rnd() > 0.45) {
              rect(ctx, rnd() > 0.2 ? 'rgba(253,224,71,0.75)' : 'rgba(56,189,248,0.6)', wx, wy, 10, 13);
            }
          }
        }
      }

      // Houses waiting behind the shopfronts, each with its own lit door and windows.
      for (let i = 0; i < 3; i++) {
        const hw = W * 0.26;
        drawHouse(ctx, W * (0.02 + i * 0.33), groundY - H * 0.18, hw, H * 0.26, {
          wall: i % 2 ? '#b8c4c9' : '#cbbfae',
          roof: i % 2 ? '#7f1d1d' : '#3f3f46',
          mailbox: i === 0,
          fence: i === 2,
        });
      }
      drawPowerLine(ctx, W * 0.02, W * 0.98, groundY - H * 0.18, H * 0.36);

      // Sidewalk & Asphalt road
      rect(ctx, '#334155', 0, groundY - 12, W, 12);
      rect(ctx, vGrad(ctx, groundY, H, [[0, '#1e2430'], [1, '#0f131a']]), 0, groundY, W, H - groundY);
      rect(ctx, '#475569', 0, groundY, W, 3);
      // Dashed yellow road stripes
      ctx.fillStyle = '#eab308';
      for (let i = 0; i < 8; i++) {
        const dx = (i * W) / 6;
        ctx.fillRect(dx, groundY + (H - groundY) * 0.52, W * 0.08, 4);
      }

      // Streetlights with warm light cones
      for (let i = 0; i < 3; i++) {
        const lx = W * (0.18 + i * 0.34);
        const topY = groundY - H * 0.32;
        rect(ctx, '#475569', lx - 3, topY, 6, H * 0.32);
        rect(ctx, '#64748b', lx - 3, topY, 22, 5);
        circle(ctx, '#fef08a', lx + 16, topY + 5, 6);
        poly(ctx, 'rgba(254,240,138,0.07)', [[lx + 16, topY + 5], [lx - 45, groundY], [lx + 75, groundY]]);
      }
      break;
    }

    case 'city': {
      rect(ctx, vGrad(ctx, 0, groundY, [[0, '#040711'], [0.6, '#0f172a'], [1, '#1e1b4b']]), 0, 0, W, groundY);
      drawStars(ctx, W, groundY * 0.45, rnd, 30, t);
      // Distant layer
      for (let i = 0; i < 12; i++) {
        const bw = W * (0.08 + rnd() * 0.06);
        const bh = H * (0.35 + rnd() * 0.32);
        const bx = i * (W / 11) - bw * 0.4;
        rect(ctx, '#0c1326', bx, groundY - bh, bw, bh);
      }
      // Midground skyscrapers with neon accents
      for (let i = 0; i < 10; i++) {
        const bw = W * (0.08 + rnd() * 0.07);
        const bh = H * (0.22 + rnd() * 0.35);
        const bx = i * (W / 9) - bw * 0.25;
        rect(ctx, '#16203a', bx, groundY - bh, bw, bh);
        rect(ctx, i % 3 === 0 ? '#38bdf8' : '#a855f7', bx, groundY - bh, bw, 3);
        for (let wy = groundY - bh + 12; wy < groundY - 12; wy += 20) {
          for (let wx = bx + 6; wx < bx + bw - 10; wx += 14) {
            if (rnd() > 0.42) rect(ctx, 'rgba(254,240,138,0.75)', wx, wy, 7, 10);
          }
        }
      }
      // Apartment blocks with balconies, laundry and glass ground-floor doors.
      drawApartmentBlock(ctx, W * 0.01, groundY - H * 0.14, W * 0.22, H * 0.42, rnd);
      drawApartmentBlock(ctx, W * 0.76, groundY - H * 0.16, W * 0.23, H * 0.46, rnd, { body: '#131c31' });
      drawPowerLine(ctx, W * 0.2, W * 0.8, groundY - H * 0.3, H * 0.34);
      rect(ctx, '#0f172a', 0, groundY, W, H - groundY);
      rect(ctx, '#38bdf8', 0, groundY, W, 2);
      break;
    }

    case 'school': {
      rect(ctx, vGrad(ctx, 0, groundY, [[0, '#fef3c7'], [1, '#fde68a']]), 0, 0, W, groundY);
      rect(ctx, '#d97706', 0, groundY - H * 0.22, W, H * 0.22); // wainscotting
      // Chalkboard
      roundRect(ctx, '#78350f', W * 0.14 - 6, H * 0.12 - 6, W * 0.72 + 12, H * 0.28 + 12, 6);
      rect(ctx, '#14532d', W * 0.14, H * 0.12, W * 0.72, H * 0.28);
      // Chalk formulas/diagrams on board
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(W * 0.2, H * 0.2); ctx.lineTo(W * 0.42, H * 0.2);
      ctx.moveTo(W * 0.2, H * 0.26); ctx.lineTo(W * 0.36, H * 0.26);
      ctx.stroke();
      // Lockers, a hanging jacket, posters and the classroom door.
      drawLockers(ctx, W * 0.02, groundY, W * 0.15, H * 0.3, 3);
      drawPictureFrame(ctx, W * 0.2, H * 0.36, W * 0.07, H * 0.09, -0.03);
      drawWallClock(ctx, W * 0.9, H * 0.2, Math.min(W, H) * 0.035);
      drawDoor(ctx, W * 0.76, groundY - H * 0.4, W * 0.14, H * 0.4, { style: 'glass' });
      drawBin(ctx, W * 0.7, groundY, H * 0.11);
      rect(ctx, vGrad(ctx, groundY, H, [[0, '#b45309'], [1, '#78350f']]), 0, groundY, W, H - groundY);
      break;
    }

    case 'office': {
      rect(ctx, vGrad(ctx, 0, groundY, [[0, '#e2e8f0'], [1, '#cbd5e1']]), 0, 0, W, groundY);
      // Panoramic city window
      rect(ctx, '#0ea5e9', W * 0.06, H * 0.1, W * 0.42, H * 0.34);
      rect(ctx, 'rgba(255,255,255,0.35)', W * 0.06, H * 0.1, W * 0.42, H * 0.34);
      rect(ctx, '#64748b', W * 0.27, H * 0.1, 4, H * 0.34);
      // Presentation board / chart
      roundRect(ctx, '#1e293b', W * 0.56, H * 0.13, W * 0.36, H * 0.24, 6);
      rect(ctx, '#f8fafc', W * 0.575, H * 0.145, W * 0.33, H * 0.21);
      rect(ctx, '#22c55e', W * 0.61, H * 0.26, W * 0.04, H * 0.07);
      rect(ctx, '#3b82f6', W * 0.67, H * 0.22, W * 0.04, H * 0.11);
      rect(ctx, '#ef4444', W * 0.73, H * 0.18, W * 0.04, H * 0.15);
      // Desk with a landline phone and monitor, a glass office door and a coat rack.
      rect(ctx, '#475569', W * 0.55, groundY - H * 0.14, W * 0.36, 10);
      rect(ctx, '#334155', W * 0.58, groundY - H * 0.14, 8, H * 0.14);
      rect(ctx, '#334155', W * 0.86, groundY - H * 0.14, 8, H * 0.14);
      drawDeskPhone(ctx, W * 0.62, groundY - H * 0.15, W * 0.035);
      rect(ctx, '#0f172a', W * 0.72, groundY - H * 0.26, W * 0.16, H * 0.11);
      rect(ctx, '#38bdf8', W * 0.725, groundY - H * 0.255, W * 0.15, H * 0.1);
      drawDoor(ctx, W * 0.01, groundY - H * 0.38, W * 0.1, H * 0.38, { style: 'glass' });
      drawChairWithClothes(ctx, W * 0.46, groundY, H * 0.24);
      rect(ctx, '#94a3b8', 0, groundY, W, H - groundY);
      break;
    }

    case 'forest': {
      rect(ctx, vGrad(ctx, 0, groundY, [[0, '#051e18'], [0.6, '#0c382c'], [1, '#164e3f']]), 0, 0, W, groundY);
      circle(ctx, '#d9f99d', W * 0.78, H * 0.15, Math.min(W, H) * 0.055);
      // Distant mist & pine silhouettes
      for (let i = 0; i < 12; i++) {
        const x = (i / 11) * W;
        const th = H * (0.34 + rnd() * 0.18);
        poly(ctx, '#06281f', [[x - W * 0.08, groundY], [x, groundY - th], [x + W * 0.08, groundY]]);
      }
      rect(ctx, 'rgba(167,243,208,0.08)', 0, groundY - H * 0.12, W, H * 0.12);
      for (let i = 0; i < 8; i++) {
        const x = (i / 7) * W + (rnd() - 0.5) * 20;
        const th = H * (0.28 + rnd() * 0.16);
        rect(ctx, '#3f2718', x - 5, groundY - H * 0.08, 10, H * 0.08);
        poly(ctx, '#114232', [[x - W * 0.075, groundY - H * 0.05], [x, groundY - th], [x + W * 0.075, groundY - H * 0.05]]);
        poly(ctx, '#175943', [[x - W * 0.06, groundY - H * 0.14], [x, groundY - th * 1.06], [x + W * 0.06, groundY - H * 0.14]]);
      }
      // A cabin with a door, a lit window and washing strung between the trees.
      drawHouse(ctx, W * 0.6, groundY - H * 0.04, W * 0.32, H * 0.24, { wall: '#6b4f3a', roof: '#3f2a1d', light: 'warm' });
      rect(ctx, '#3f2718', W * 0.3, H * 0.3, Math.max(2, W * 0.008), groundY - H * 0.3);
      drawClothesline(ctx, W * 0.06, H * 0.34, W * 0.3, H * 0.36, 4, rnd, H * 0.08);
      drawBench(ctx, W * 0.42, groundY, W * 0.14, H * 0.1);
      rect(ctx, vGrad(ctx, groundY, H, [[0, '#143829'], [1, '#091c14']]), 0, groundY, W, H - groundY);
      break;
    }

    case 'desert': {
      rect(ctx, vGrad(ctx, 0, groundY, [[0, '#fb923c'], [0.55, '#fde047'], [1, '#fed7aa']]), 0, 0, W, groundY);
      circle(ctx, '#fffbeb', W * 0.76, H * 0.18, Math.min(W, H) * 0.075);
      poly(ctx, '#d97706', [[0, groundY], [W * 0.32, groundY - H * 0.15], [W * 0.68, groundY]]);
      poly(ctx, '#b45309', [[W * 0.38, groundY], [W * 0.78, groundY - H * 0.12], [W, groundY]]);
      rect(ctx, vGrad(ctx, groundY, H, [[0, '#f59e0b'], [1, '#b45309']]), 0, groundY, W, H - groundY);
      // An abandoned shack with a door, plus a phone pole and its wires.
      drawHouse(ctx, W * 0.04, groundY, W * 0.3, H * 0.2, { wall: '#d6b985', roof: '#8b5a2b', light: 'warm' });
      drawPowerLine(ctx, W * 0.86, W * 0.98, groundY, H * 0.3);
      // Cacti
      for (const cx of [W * 0.14, W * 0.86]) {
        roundRect(ctx, '#15803d', cx - 6, groundY - H * 0.16, 12, H * 0.16, 5);
        roundRect(ctx, '#15803d', cx - 20, groundY - H * 0.11, 16, 8, 4);
        roundRect(ctx, '#15803d', cx - 20, groundY - H * 0.15, 8, H * 0.05, 4);
        roundRect(ctx, '#15803d', cx + 4, groundY - H * 0.09, 16, 8, 4);
        roundRect(ctx, '#15803d', cx + 12, groundY - H * 0.14, 8, H * 0.06, 4);
      }
      break;
    }

    case 'battlefield': {
      rect(ctx, vGrad(ctx, 0, groundY, [[0, '#1c1917'], [0.6, '#44403c'], [1, '#7c2d12']]), 0, 0, W, groundY);
      // Broken houses with steel doorways, lit windows, sandbags and wire along the line.
      for (let i = 0; i < 3; i++) {
        const bx = W * (0.06 + i * 0.32);
        const bh = H * 0.2;
        rect(ctx, '#3f3a36', bx, groundY - bh, W * 0.16, bh);
        rect(ctx, '#57534e', bx, groundY - bh, W * 0.16, Math.max(1, H * 0.012));
        drawWindow(ctx, bx + W * 0.02, groundY - bh * 0.84, W * 0.05, H * 0.055, { light: 'cool', blinds: true });
        drawDoor(ctx, bx + W * 0.085, groundY - bh * 0.9, W * 0.06, bh * 0.9, { style: 'steel' });
        poly(ctx, '#1c1917', [[bx - W * 0.01, groundY - bh], [bx + W * 0.05, groundY - bh * 1.4], [bx + W * 0.12, groundY - bh * 0.92], [bx + W * 0.17, groundY - bh * 1.25], [bx + W * 0.17, groundY - bh]]);
      }
      for (let i = 0; i < 12; i++) {
        circle(ctx, '#78716c', W * (0.04 + i * 0.08), groundY - H * 0.03 - (i % 2) * H * 0.016, H * 0.024);
        circle(ctx, '#57534e', W * (0.04 + i * 0.08), groundY - H * 0.03 - (i % 2) * H * 0.016, H * 0.018);
      }
      // Distant fire glow & rising smoke plumes
      for (let i = 0; i < 6; i++) {
        const sx = W * (0.1 + 0.16 * i);
        const life = ((t * 0.16 + i / 6) % 1);
        const sy = H * (0.58 - life * 0.48);
        circle(ctx, `rgba(41,37,36,${0.45 * Math.sin(Math.PI * life)})`, sx + Math.sin(life * 4 + i) * W * 0.035, sy, Math.min(W, H) * (0.05 + life * 0.09));
      }
      // Ruined building silhouettes
      for (let i = 0; i < 6; i++) {
        const bx = i * (W / 5.5);
        const bh = H * (0.16 + rnd() * 0.18);
        poly(ctx, '#1c1917', [[bx, groundY], [bx, groundY - bh], [bx + W * 0.07, groundY - bh * 0.7], [bx + W * 0.14, groundY - bh * 0.9], [bx + W * 0.14, groundY]]);
      }
      rect(ctx, vGrad(ctx, groundY, H, [[0, '#292524'], [1, '#1c1917']]), 0, groundY, W, H - groundY);
      break;
    }

    case 'horror': {
      // Zombie outbreak / eerie biohazard night with blood/toxic moon, dead trees, and rolling green fog
      rect(ctx, vGrad(ctx, 0, groundY, [[0, '#07040d'], [0.55, '#180d26'], [1, '#112e21']]), 0, 0, W, groundY);
      drawStars(ctx, W, groundY * 0.5, rnd, 20, t);
      circle(ctx, 'rgba(74,222,128,0.14)', W * 0.5, H * 0.18, Math.min(W, H) * 0.12);
      circle(ctx, '#d9f99d', W * 0.5, H * 0.18, Math.min(W, H) * 0.065);
      // Dead twisted trees & ruined skyline
      for (let i = 0; i < 5; i++) {
        const x = W * (0.08 + i * 0.21);
        rect(ctx, '#09050f', x - 4, groundY - H * 0.32, 8, H * 0.32);
        ctx.strokeStyle = '#09050f';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x, groundY - H * 0.22); ctx.lineTo(x - 26, groundY - H * 0.31);
        ctx.moveTo(x, groundY - H * 0.18); ctx.lineTo(x + 24, groundY - H * 0.27);
        ctx.stroke();
      }
      // The house at the end of the road: porch, door and a fence leaning in the fog.
      drawHouse(ctx, W * 0.56, groundY - H * 0.02, W * 0.38, H * 0.3, { wall: '#1f2937', roof: '#111827', fence: true, light: 'cool' });
      drawFence(ctx, W * 0.02, groundY, W * 0.28, H * 0.14);
      drawPowerLine(ctx, W * 0.08, W * 0.92, groundY, H * 0.42);
      // Rolling toxic green ground fog
      const fogShift = Math.sin(t * 1.5) * 8;
      rect(ctx, 'rgba(74,222,128,0.12)', 0, groundY - H * 0.09 + fogShift, W, H * 0.1);
      rect(ctx, vGrad(ctx, groundY, H, [[0, '#171f1b'], [1, '#090d0b']]), 0, groundY, W, H - groundY);
      break;
    }

    case 'landscape': {
      rect(ctx, vGrad(ctx, 0, groundY, [[0, '#38bdf8'], [0.65, '#bae6fd'], [1, '#fef9c3']]), 0, 0, W, groundY);
      circle(ctx, '#fef08a', W * 0.22, H * 0.16, Math.min(W, H) * 0.06);
      poly(ctx, '#16a34a', [[0, groundY], [W * 0.35, groundY - H * 0.22], [W * 0.72, groundY]]);
      poly(ctx, '#15803d', [[W * 0.36, groundY], [W * 0.78, groundY - H * 0.18], [W, groundY]]);
      // Farmhouse and barn with doors, a fence and a washing line.
      drawHouse(ctx, W * 0.58, groundY, W * 0.34, H * 0.28, { wall: '#e7d8b8', roof: '#7f1d1d', fence: true, mailbox: true });
      rect(ctx, '#8b5e34', W * 0.05, groundY - H * 0.2, W * 0.2, H * 0.2);
      poly(ctx, '#5b3a1f', [[W * 0.04, groundY - H * 0.2], [W * 0.15, groundY - H * 0.29], [W * 0.26, groundY - H * 0.2]]);
      drawDoor(ctx, W * 0.11, groundY - H * 0.14, W * 0.07, H * 0.14);
      drawFence(ctx, W * 0.3, groundY, W * 0.26, H * 0.12);
      rect(ctx, vGrad(ctx, groundY, H, [[0, '#22c55e'], [1, '#15803d']]), 0, groundY, W, H - groundY);
      break;
    }

    case 'rooftop': {
      rect(ctx, vGrad(ctx, 0, groundY, [[0, '#040814'], [0.7, '#1e1b4b'], [1, '#31102f']]), 0, 0, W, groundY);
      drawStars(ctx, W, groundY * 0.6, rnd, 30, t);
      for (let i = 0; i < 8; i++) {
        const bw = W * 0.11;
        const bh = H * (0.2 + rnd() * 0.25);
        rect(ctx, '#0f172a', i * (W / 7.5), groundY - bh, bw, bh);
      }
      // Concrete roof ledge, stairwell door, pipes, AC unit, antenna and laundry.
      rect(ctx, '#334155', 0, groundY - 14, W, 14);
      rect(ctx, '#1e293b', 0, groundY, W, H - groundY);
      drawDoor(ctx, W * 0.72, groundY - H * 0.34, W * 0.16, H * 0.34, { style: 'steel' });
      drawPipeRun(ctx, 0, groundY - H * 0.08, W, Math.max(2, H * 0.016));
      drawACUnit(ctx, W * 0.08, groundY - H * 0.16, W * 0.16, H * 0.1);
      drawBench(ctx, W * 0.28, groundY - H * 0.02, W * 0.14, H * 0.1);
      break;
    }

    case 'bunker':
    case 'lab': {
      rect(ctx, vGrad(ctx, 0, groundY, [[0, '#0f172a'], [1, '#1e293b']]), 0, 0, W, groundY);
      // Steel wall panels & hazard stripe
      ctx.strokeStyle = 'rgba(148,163,184,0.18)';
      ctx.lineWidth = 2;
      for (let i = 1; i < 5; i++) {
        ctx.beginPath(); ctx.moveTo((W * i) / 5, 0); ctx.lineTo((W * i) / 5, groundY); ctx.stroke();
      }
      rect(ctx, '#eab308', 0, groundY - 14, W, 14);
      // Blast door, lockers with clothes, a wall phone, pipes and crates.
      drawDoor(ctx, W * 0.05, groundY - H * 0.42, W * 0.22, H * 0.42, { style: 'steel' });
      drawLockers(ctx, W * 0.74, groundY, W * 0.22, H * 0.28, 3, g === 'lab' ? '#0e7490' : '#334155');
      drawPipeRun(ctx, 0, H * 0.07, W, Math.max(2, H * 0.02));
      drawWallPhone(ctx, W * 0.6, H * 0.2, Math.min(W, H) * 0.038, '#ef4444');
      drawCrate(ctx, W * 0.3, groundY, W * 0.1, H * 0.11);
      // Biohazard / containment tube in lab
      if (g === 'lab') {
        roundRect(ctx, 'rgba(74,222,128,0.22)', W * 0.42, H * 0.14, W * 0.16, H * 0.48, 12);
        rect(ctx, '#334155', W * 0.41, H * 0.12, W * 0.18, 12);
        rect(ctx, '#334155', W * 0.41, H * 0.62, W * 0.18, 14);
      }
      rect(ctx, '#0f172a', 0, groundY, W, H - groundY);
      break;
    }

    default:
      rect(ctx, '#0f172a', 0, 0, W, H);
  }
  drawScenicFinish(ctx, g, W, H, groundY, t);
}

// Atmospheric perspective, motivated practical lights and restrained material
// texture. Spatial randomness makes scrubbing and out-of-order export stable.
function drawScenicFinish(ctx, name, W, H, ground, t) {
  const rnd = seeded(52871 + name.length * 329);
  const unit = Math.min(W, H);
  const glow = (x, y, radius, color) => {
    const light = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, radius));
    light.addColorStop(0, color); light.addColorStop(1, 'rgba(0,0,0,0)');
    rect(ctx, light, x - radius, y - radius, radius * 2, radius * 2);
  };
  ctx.save();
  if (['street', 'city', 'rooftop'].includes(name)) {
    const haze = vGrad(ctx, H * 0.32, ground, [[0, 'rgba(65,106,141,0)'], [0.72, 'rgba(90,132,164,0.14)'], [1, 'rgba(35,65,92,0)']]);
    rect(ctx, haze, 0, H * 0.32, W, ground - H * 0.32);
    if (name !== 'rooftop') {
      const shopY = ground - H * 0.19;
      for (let i = 0; i < 7; i++) {
        const x = W * (i / 6 - 0.025), w = W * 0.137;
        rect(ctx, '#172434', x, shopY, w, H * 0.172);
        rect(ctx, '#465366', x - 2, shopY, w + 4, H * 0.008);
        roundRect(ctx, i % 2 ? '#22566a' : '#684144', x + w * 0.06, shopY + H * 0.018, w * 0.88, H * 0.027, unit * 0.003);
        for (let k = 0; k < 5; k++) rect(ctx, 'rgba(255,225,157,0.7)', x + w * (0.14 + k * 0.14), shopY + H * 0.027, w * 0.07, H * 0.005);
        rect(ctx, '#0c1622', x + w * 0.08, shopY + H * 0.055, w * 0.84, H * 0.1);
        const warm = ctx.createLinearGradient(x, 0, x + w, 0);
        warm.addColorStop(0, '#976f4c'); warm.addColorStop(0.5, '#e7b875'); warm.addColorStop(1, '#7c6958');
        rect(ctx, warm, x + w * 0.12, shopY + H * 0.061, w * 0.47, H * 0.081);
        rect(ctx, '#344757', x + w * 0.35, shopY + H * 0.06, w * 0.025, H * 0.085);
        rect(ctx, '#233b4b', x + w * 0.65, shopY + H * 0.061, w * 0.22, H * 0.09);
        circle(ctx, '#d7ac6e', x + w * 0.8, shopY + H * 0.11, unit * 0.002);
        glow(x + w * 0.35, ground + H * 0.07, unit * 0.14, 'rgba(238,164,80,0.17)');
      }
      for (let i = 0; i < 105; i++) {
        const x = rnd() * W, y = ground + rnd() * (H - ground);
        rect(ctx, i % 3 ? 'rgba(116,173,198,0.13)' : 'rgba(244,191,112,0.25)', x, y, unit * (0.008 + rnd() * 0.075), Math.max(0.6, unit * 0.002));
      }
      // Foreground street furniture: bins, a hydrant, a bench and a parked car.
      drawBin(ctx, W * 0.025, ground, unit * 0.1);
      drawHydrant(ctx, W * 0.13, ground, unit * 0.11);
      drawBench(ctx, W * 0.55, ground, W * 0.15, unit * 0.12);
      drawCar(ctx, W * 0.74, ground, W * 0.23, name === 'city' ? '#facc15' : '#dc2626');
      for (const x of [W * 0.18, W * 0.52, W * 0.86]) {
        const y = ground - H * 0.32;
        rect(ctx, '#28394c', x - unit * 0.005, y, unit * 0.01, H * 0.32);
        rect(ctx, '#637688', x - unit * 0.002, y, unit * 0.002, H * 0.32);
        roundRect(ctx, '#f6d89a', x - unit * 0.009, y - unit * 0.007, unit * 0.05, unit * 0.013, unit * 0.005);
        glow(x + unit * 0.014, y, unit * 0.20, 'rgba(255,205,124,0.24)');
        glow(x, ground, unit * 0.18, 'rgba(255,197,113,0.17)');
      }
    }
    glow(W * 0.84, H * 0.13, unit * 0.32, 'rgba(123,178,213,0.13)');
  }
  if (['forest', 'horror', 'landscape', 'desert'].includes(name)) {
    const forest = name === 'forest' || name === 'horror';
    for (let layer = 0; layer < 3; layer++) {
      ctx.fillStyle = forest ? ['rgba(52,101,83,0.18)', 'rgba(20,53,43,0.42)', '#102d25'][layer] : name === 'desert' ? ['#e7ac60', '#d7984d', '#c88c46'][layer] : ['#85b585', '#609b73', '#4e8d60'][layer];
      ctx.beginPath(); ctx.moveTo(0, ground + H * 0.02);
      for (let i = 0; i <= 14; i++) {
        const x = W * i / 14;
        const y = ground - H * (0.12 - layer * 0.045) + Math.sin(i * 0.65 + layer * 1.8) * H * 0.025;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, ground + H * 0.03); ctx.closePath(); ctx.fill();
    }
    if (forest) {
      for (const side of [0.025, 0.975]) {
        const x = W * side;
        poly(ctx, '#10231e', [[x - unit * 0.03, ground], [x - unit * 0.011, H * 0.09], [x + unit * 0.018, H * 0.05], [x + unit * 0.043, ground]]);
        ctx.strokeStyle = '#214239'; ctx.lineWidth = unit * 0.005;
        ctx.beginPath(); ctx.moveTo(x, ground); ctx.bezierCurveTo(x + 9, H * 0.54, x - 8, H * 0.3, x + 2, H * 0.1); ctx.stroke();
        for (let j = 0; j < 5; j++) {
          const bx = x + (side < 0.5 ? 1 : -1) * unit * (0.03 + j * 0.025);
          ctx.strokeStyle = '#142f26'; ctx.lineWidth = unit * (0.018 - j * 0.002);
          ctx.beginPath(); ctx.moveTo(x, H * (0.17 + j * 0.045)); ctx.quadraticCurveTo(bx, H * 0.1, bx + unit * 0.03, H * 0.06); ctx.stroke();
        }
      }
      glow(W * 0.73, H * 0.28, unit * 0.5, 'rgba(175,212,162,0.12)');
    }
    for (let i = 0; i < 75; i++) {
      const x = rnd() * W, y = ground + rnd() * (H - ground);
      ctx.strokeStyle = forest ? 'rgba(124,164,103,0.25)' : 'rgba(98,75,35,0.2)'; ctx.lineWidth = Math.max(0.7, unit * 0.002);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + unit * 0.012, y - rnd() * unit * 0.012); ctx.stroke();
    }
  }
  if (['bedroom', 'school', 'office', 'bunker', 'lab'].includes(name)) {
    // Soft diagonal practical-light shafts establish depth and a readable
    // silhouette backdrop. They drift once with shot time, never snap/reseed.
    const drift = Math.tanh(t / 12) * W * 0.025;
    const cool = ['lab', 'bunker'].includes(name);
    for (const x of [W * 0.18, W * 0.72]) {
      const shaft = ctx.createLinearGradient(x, H * 0.10, x + drift, ground);
      shaft.addColorStop(0, cool ? 'rgba(175,225,239,0.085)' : 'rgba(255,227,175,0.08)');
      shaft.addColorStop(1, 'rgba(186,211,226,0)');
      poly(ctx, shaft, [[x - W * 0.025, H * 0.10], [x + W * 0.025, H * 0.10], [x + W * 0.23 + drift, ground], [x - W * 0.04 + drift, ground]]);
    }
    ctx.strokeStyle = 'rgba(120,146,163,0.12)'; ctx.lineWidth = Math.max(1, unit * 0.002);
    for (let i = -5; i <= 5; i++) {
      ctx.beginPath(); ctx.moveTo(W * 0.5 + i * W * 0.055, ground); ctx.lineTo(W * 0.5 + i * W * 0.2, H); ctx.stroke();
    }
    for (let i = 1; i < 4; i++) {
      const y = ground + (H - ground) * (i / 4) ** 1.7;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    rect(ctx, 'rgba(184,198,202,0.22)', 0, ground - unit * 0.009, W, unit * 0.003);
    if (name === 'bedroom') {
      const x = W * 0.12, y = H * 0.48;
      glow(x, y, unit * 0.33, 'rgba(255,173,84,0.19)');
      rect(ctx, '#5b4238', x - unit * 0.005, y, unit * 0.01, H * 0.15);
      poly(ctx, '#e2b67e', [[x - unit * 0.032, y - unit * 0.035], [x + unit * 0.032, y - unit * 0.035], [x + unit * 0.055, y + unit * 0.027], [x - unit * 0.055, y + unit * 0.027]]);
      glow(W * 0.64, H * 0.35, unit * 0.37, 'rgba(97,149,228,0.12)');
    } else {
      for (const x of [W * 0.2, W * 0.8]) {
        roundRect(ctx, '#d1e5e4', x - W * 0.07, H * 0.055, W * 0.14, unit * 0.01, unit * 0.004);
        glow(x, H * 0.12, unit * 0.33, 'rgba(169,223,234,0.13)');
      }
    }
  }
  const vignette = ctx.createRadialGradient(W * 0.5, H * 0.47, unit * 0.15, W * 0.5, H * 0.47, Math.hypot(W, H) * 0.62);
  vignette.addColorStop(0, 'rgba(7,15,27,0)'); vignette.addColorStop(0.6, 'rgba(7,15,27,0.03)'); vignette.addColorStop(1, 'rgba(7,15,27,0.43)');
  rect(ctx, vignette, 0, 0, W, H);
  ctx.restore();
}

/** Overlay tint for day/night/alarm effects. */
export function drawTint(ctx, W, H, color) {
  rect(ctx, color, 0, 0, W, H);
}
