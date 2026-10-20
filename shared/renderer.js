// Frame renderer shared by the browser preview and the server-side MP4 exporter.
// Draws atmospheric scenery, articulated stick-figure characters with custom drip
// (hats, hoodies, suits, shades, chains, headphones, weapons), zombie green infection
// transformations, props, and dynamic effects.
import { solvePose, buildSkeleton } from './stickfigure.js';
import { drawBackground, drawTint, BACKGROUND_INFO, bedroomLayout } from './scenery.js';
import { ZOMBIE_COLOR, ZOMBIE_GLOW } from './constants.js';

const TWO_PI = Math.PI * 2;

/** Scene and project geometry for a given output size. */
export function layoutFor(W, H, characterCount = 1) {
  // Frame-aware composition keeps the latest larger figures readable in both
  // wide and portrait output without cropping their shoes or expressive heads.
  const n = Math.max(1, characterCount);
  const scale = Math.min(H * (n > 3 ? 0.56 : 0.66), W * (n === 1 ? 0.86 : n === 2 ? 0.64 : 1.55 / n));
  return { W, H, scale, groundFraction: BACKGROUND_INFO.white.ground };
}

/** Furniture-aware blocking, shared with tests and independent of canvas. */
export function bedroomStaging(action, progress, W, H, requestedScale) {
  const { bed, ground, window, tv } = bedroomLayout(W, H);
  const ease = (a, b, p) => {
    const k = Math.max(0, Math.min(1, p));
    return a + (b - a) * k * k * (3 - 2 * k);
  };
  if (action === 'sleep' || action === 'wake_up') {
    const scale = Math.min(requestedScale, bed.w / 1.10);
    const p = action === 'sleep' ? 0 : progress;
    const sitX = bed.x + bed.w - scale * 0.035;
    const standX = bed.x + bed.w + scale * 0.11;
    const x = p < 0.58 ? ease(bed.x + bed.w * 0.56, sitX, (p - 0.12) / 0.29) : ease(sitX, standX, (p - 0.58) / 0.28);
    const seatedY = bed.mattressY - scale * 0.035;
    const hipY = p < 0.58 ? ease(bed.mattressY - scale * 0.11, seatedY, (p - 0.12) / 0.29) : ease(seatedY, ground - scale * 0.424, (p - 0.58) / 0.28);
    return { x, scale, hipY, groundY: ground, facing: 1, inBed: p < 0.58 };
  }
  if (action === 'look_window') return { x: window.x + window.w * 0.28 - requestedScale * 0.05, scale: Math.min(requestedScale, H * 0.60, W * 0.70), groundY: ground, facing: 1 };
  if (action === 'watch_tv') return { x: tv.x - W * 0.13, scale: Math.min(requestedScale, H * 0.43, W * 0.65), groundY: ground, facing: 1 };
  return null;
}

function parseHex(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  if (!m) return [245, 245, 245];
  return [ parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16) ];
}

function lerpColor(hexA, hexB, t) {
  const k = Math.min(1, Math.max(0, t));
  if (k <= 0) return hexA;
  if (k >= 1) return hexB;
  const a = parseHex(hexA);
  const b = parseHex(hexB);
  const r = Math.round(a[0] + (b[0] - a[0]) * k);
  const g = Math.round(a[1] + (b[1] - a[1]) * k);
  const bl = Math.round(a[2] + (b[2] - a[2]) * k);
  return `rgb(${r},${g},${bl})`;
}

function drawTopDrip(ctx, sk, drip, lineWidth, ink) {
  const top = drip?.top || 'none';
  if (top === 'none') return;
  const col = drip?.outfitColor || '#3b82f6';
  const acc = drip?.accentColor || '#facc15';
  const [sx, sy] = sk.shoulder;
  const [hx, hy] = sk.hip;
  const [lsx, lsy] = sk.lShoulder;
  const [rsx, rsy] = sk.rShoulder;
  const dx = hx - sx;
  const dy = hy - sy;
  const torsoLen = Math.hypot(dx, dy) || 1;
  const nx = -dy / torsoLen; // perpendicular to torso
  const ny = dx / torsoLen;
  const wTop = Math.max(lineWidth * 2.1, torsoLen * 0.26);
  const wBot = Math.max(lineWidth * 1.8, torsoLen * 0.22);

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // A shaded silhouette gives every jacket a little volume instead of reading as a flat shape.
  const garment = ctx.createLinearGradient(sx - nx * wTop, sy - ny * wTop, sx + nx * wTop, sy + ny * wTop);
  garment.addColorStop(0, lerpColor(col, '#07111f', 0.22));
  garment.addColorStop(0.48, col);
  garment.addColorStop(1, lerpColor(col, '#ffffff', 0.16));
  ctx.fillStyle = garment;
  ctx.strokeStyle = 'rgba(2,6,23,0.78)';
  ctx.lineWidth = Math.max(1.5, lineWidth * 0.34);
  ctx.beginPath();
  ctx.moveTo(sx - nx * wTop, sy - ny * wTop);
  ctx.lineTo(sx + nx * wTop, sy + ny * wTop);
  ctx.lineTo(hx + nx * wBot, hy + ny * wBot);
  ctx.lineTo(hx - nx * wBot, hy - ny * wBot);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Sleeves along upper arms
  const sleeveFrac = top === 'tshirt' || top === 'vest' ? (top === 'vest' ? 0 : 0.48) : 0.85;
  if (sleeveFrac > 0) {
    for (const [sh, el] of [[sk.lShoulder, sk.lElbow], [sk.rShoulder, sk.rElbow]]) {
      const ex = sh[0] + (el[0] - sh[0]) * sleeveFrac;
      const ey = sh[1] + (el[1] - sh[1]) * sleeveFrac;
      ctx.strokeStyle = 'rgba(2,6,23,0.68)';
      ctx.lineWidth = lineWidth * (top === 'puff_jacket' ? 2.1 : 1.72);
      ctx.beginPath(); ctx.moveTo(sh[0], sh[1]); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = garment;
      ctx.lineWidth = lineWidth * (top === 'puff_jacket' ? 1.78 : 1.4);
      ctx.beginPath(); ctx.moveTo(sh[0], sh[1]); ctx.lineTo(ex, ey); ctx.stroke();
    }
  }

  // Fine seams, zipper and pocket stitching add readable fabric detail at short-video size.
  ctx.strokeStyle = 'rgba(255,255,255,0.30)';
  ctx.lineWidth = Math.max(0.9, lineWidth * 0.12);
  ctx.beginPath();
  ctx.moveTo(sx + nx * wTop * 0.12, sy + ny * wTop * 0.12);
  ctx.lineTo(hx + nx * wBot * 0.12, hy + ny * wBot * 0.12);
  ctx.stroke();
  const pocketX = sx + dx * 0.60 + nx * wTop * 0.27;
  const pocketY = sy + dy * 0.60 + ny * wTop * 0.27;
  const pocketW = wTop * 0.42;
  const pocketH = torsoLen * 0.15;
  ctx.fillStyle = 'rgba(2,6,23,0.16)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(pocketX - pocketW / 2, pocketY - pocketH / 2, pocketW, pocketH, Math.max(1, lineWidth * 0.12));
  else ctx.rect(pocketX - pocketW / 2, pocketY - pocketH / 2, pocketW, pocketH);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.beginPath();
  ctx.moveTo(pocketX - pocketW * 0.38, pocketY - pocketH * 0.12);
  ctx.lineTo(pocketX + pocketW * 0.38, pocketY - pocketH * 0.12);
  ctx.stroke();

  // Style-specific details
  if (top === 'tshirt' || top === 'vest' || top === 'lab_coat') {
    const shirt = top === 'lab_coat' ? '#e2e8f0' : '#f5f5f4';
    ctx.fillStyle = shirt;
    ctx.strokeStyle = '#101522';
    ctx.lineWidth = Math.max(1.5, lineWidth * 0.35);
    ctx.beginPath();
    ctx.moveTo(sx - nx * wTop * 0.36, sy + dy * 0.06);
    ctx.lineTo(sx + nx * wTop * 0.36, sy + dy * 0.06);
    ctx.lineTo(hx + nx * wBot * 0.35, hy - ny * wBot * 0.2);
    ctx.lineTo(hx - nx * wBot * 0.35, hy - ny * wBot * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (top === 'lab_coat') {
      ctx.strokeStyle = acc;
      ctx.lineWidth = Math.max(1.4, lineWidth * 0.28);
      ctx.beginPath();
      ctx.moveTo(sx + dx * 0.1, sy);
      ctx.lineTo(hx + dx * 0.15, hy);
      ctx.stroke();
    }
  } else if (top === 'hoodie') {
    // Hoodie collar bunched around neck + front kangaroo pocket + drawstrings
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(sk.neck[0], sk.neck[1] + lineWidth * 0.3, wTop * 0.9, lineWidth * 0.85, 0, 0, TWO_PI);
    ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = Math.max(1.2, lineWidth * 0.25);
    ctx.beginPath();
    ctx.moveTo(sx - nx * wTop * 0.25, sy);
    ctx.lineTo(sx - nx * wTop * 0.25 + dx * 0.32, sy + dy * 0.32);
    ctx.moveTo(sx + nx * wTop * 0.25, sy);
    ctx.lineTo(sx + nx * wTop * 0.25 + dx * 0.32, sy + dy * 0.32);
    ctx.stroke();
  } else if (top === 'suit') {
    // Crisp white shirt V + red/accent tie
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(sx - nx * wTop * 0.4, sy);
    ctx.lineTo(sx + nx * wTop * 0.4, sy);
    ctx.lineTo(sx + dx * 0.48, sy + dy * 0.48);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = Math.max(2, lineWidth * 0.42);
    ctx.beginPath();
    ctx.moveTo(sx, sy + dy * 0.06);
    ctx.lineTo(sx + dx * 0.65, sy + dy * 0.65);
    ctx.stroke();
  } else if (top === 'puff_jacket') {
    // Horizontal puffer ribs + center zip
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = Math.max(1.2, lineWidth * 0.28);
    for (const f of [0.28, 0.55, 0.8]) {
      const rx = sx + dx * f, ry = sy + dy * f;
      ctx.beginPath();
      ctx.moveTo(rx - nx * wTop * 0.95, ry - ny * wTop * 0.95);
      ctx.lineTo(rx + nx * wTop * 0.95, ry + ny * wTop * 0.95);
      ctx.stroke();
    }
  } else if (top === 'tracksuit') {
    // Side racing stripes
    ctx.strokeStyle = acc;
    ctx.lineWidth = Math.max(1.5, lineWidth * 0.3);
    ctx.beginPath();
    ctx.moveTo(lsx, lsy); ctx.lineTo(sk.lElbow[0], sk.lElbow[1]);
    ctx.moveTo(rsx, rsy); ctx.lineTo(sk.rElbow[0], sk.rElbow[1]);
    ctx.stroke();
  } else if (top === 'tattered') {
    // Zombie / survivor ripped hem notches
    ctx.fillStyle = '#1a2e05';
    ctx.beginPath();
    ctx.arc(sx + dx * 0.5, sy + dy * 0.5, lineWidth * 0.55, 0, TWO_PI);
    ctx.fill();
  }
  ctx.restore();
}

function drawHatDrip(ctx, sk, drip, lineWidth) {
  const hat = drip?.hat || 'none';
  if (hat === 'none') return;
  const col = drip?.outfitColor || '#ef4444';
  const acc = drip?.accentColor || '#facc15';
  const [hx, hy] = sk.head;
  const r = sk.headR;
  const dir = sk.facing || 1;

  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate((sk.headAngle || 0) * 0.35);

  if (hat === 'cap' || hat === 'backwards_cap') {
    const visorDir = hat === 'cap' ? dir : -dir;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(0, -r * 0.18, r * 1.06, Math.PI, TWO_PI);
    ctx.closePath();
    ctx.fill();
    // Visor brim
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(3, lineWidth * 0.65);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(visorDir * r * 0.2, -r * 0.22);
    ctx.lineTo(visorDir * r * 1.65, -r * 0.12);
    ctx.stroke();
  } else if (hat === 'beanie') {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(0, -r * 0.22, r * 1.08, Math.PI * 0.95, TWO_PI * 1.02);
    ctx.fill();
    // Folded ribbed cuff & pom-pom
    ctx.fillStyle = acc;
    ctx.fillRect(-r * 1.1, -r * 0.38, r * 2.2, r * 0.32);
    ctx.beginPath();
    ctx.arc(0, -r * 1.32, r * 0.26, 0, TWO_PI);
    ctx.fill();
  } else if (hat === 'crown') {
    ctx.fillStyle = '#facc15';
    ctx.strokeStyle = '#ca8a04';
    ctx.lineWidth = Math.max(1.5, lineWidth * 0.3);
    ctx.beginPath();
    ctx.moveTo(-r * 0.95, -r * 0.72);
    ctx.lineTo(-r * 0.85, -r * 1.55);
    ctx.lineTo(-r * 0.32, -r * 1.05);
    ctx.lineTo(0, -r * 1.7);
    ctx.lineTo(r * 0.32, -r * 1.05);
    ctx.lineTo(r * 0.85, -r * 1.55);
    ctx.lineTo(r * 0.95, -r * 0.72);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Gems
    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.arc(0, -r * 1.0, r * 0.14, 0, TWO_PI); ctx.fill();
  } else if (hat === 'top_hat') {
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-r * 0.85, -r * 2.0, r * 1.7, r * 1.25);
    ctx.fillStyle = col;
    ctx.fillRect(-r * 0.85, -r * 1.0, r * 1.7, r * 0.22);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-r * 1.35, -r * 0.82, r * 2.7, r * 0.22);
  } else if (hat === 'headband' || hat === 'bandana') {
    ctx.fillStyle = col;
    ctx.fillRect(-r * 1.06, -r * 0.55, r * 2.12, r * 0.34);
    // Flowing headband tails behind head
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(2.5, lineWidth * 0.5);
    ctx.beginPath();
    ctx.moveTo(-dir * r * 1.0, -r * 0.4);
    ctx.lineTo(-dir * r * 1.7, -r * 0.15);
    ctx.moveTo(-dir * r * 1.0, -r * 0.35);
    ctx.lineTo(-dir * r * 1.55, r * 0.15);
    ctx.stroke();
  } else if (hat === 'hood_up') {
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(4, lineWidth * 0.95);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.16, Math.PI * 0.65, Math.PI * 2.35);
    ctx.stroke();
  } else if (hat === 'helmet') {
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.arc(0, -r * 0.1, r * 1.15, Math.PI * 0.88, TWO_PI * 1.06);
    ctx.fill();
  } else if (hat === 'halo') {
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = Math.max(2.5, lineWidth * 0.5);
    ctx.beginPath();
    ctx.ellipse(0, -r * 1.45, r * 0.95, r * 0.26, 0, 0, TWO_PI);
    ctx.stroke();
  } else if (hat === 'horns') {
    ctx.fillStyle = '#ef4444';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * r * 0.45, -r * 0.75);
      ctx.lineTo(s * r * 1.15, -r * 1.55);
      ctx.lineTo(s * r * 0.85, -r * 0.55);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawAccessoryDrip(ctx, sk, drip, lineWidth, gazeShift) {
  const acc = drip?.accessory || 'none';
  if (acc === 'none') return;
  const [hx, hy] = sk.head;
  const r = sk.headR;
  const eyeY = hy - r * 0.12;

  ctx.save();
  if (acc === 'shades') {
    // Cool dark deal-with-it sunglasses with white glint
    ctx.fillStyle = '#090d16';
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = Math.max(1.2, lineWidth * 0.25);
    const lx = hx - r * 0.68 + gazeShift * 0.5;
    const rx = hx + r * 0.08 + gazeShift * 0.5;
    const w = r * 0.6, h = r * 0.36;
    ctx.fillRect(lx, eyeY - h * 0.5, w, h);
    ctx.strokeRect(lx, eyeY - h * 0.5, w, h);
    ctx.fillRect(rx, eyeY - h * 0.5, w, h);
    ctx.strokeRect(rx, eyeY - h * 0.5, w, h);
    ctx.beginPath();
    ctx.moveTo(hx - r * 0.98, eyeY - h * 0.2);
    ctx.lineTo(hx + r * 0.98, eyeY - h * 0.2);
    ctx.stroke();
  } else if (acc === 'glasses') {
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = Math.max(1.5, lineWidth * 0.32);
    ctx.beginPath();
    ctx.arc(hx - r * 0.36 + gazeShift * 0.5, eyeY, r * 0.28, 0, TWO_PI);
    ctx.arc(hx + r * 0.36 + gazeShift * 0.5, eyeY, r * 0.28, 0, TWO_PI);
    ctx.stroke();
  } else if (acc === 'chain') {
    // Gold chain hanging from neck over chest
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = Math.max(2, lineWidth * 0.42);
    ctx.beginPath();
    ctx.arc(sk.shoulder[0], sk.shoulder[1] + r * 0.1, r * 0.55, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  } else if (acc === 'headphones') {
    ctx.strokeStyle = drip?.accentColor || '#ef4444';
    ctx.lineWidth = Math.max(3, lineWidth * 0.55);
    ctx.beginPath();
    ctx.arc(hx, hy, r * 1.12, Math.PI * 0.95, TWO_PI * 1.05);
    ctx.stroke();
    ctx.fillStyle = drip?.accentColor || '#ef4444';
    ctx.beginPath();
    ctx.ellipse(hx - r * 1.08, hy, r * 0.24, r * 0.38, 0, 0, TWO_PI);
    ctx.ellipse(hx + r * 1.08, hy, r * 0.24, r * 0.38, 0, 0, TWO_PI);
    ctx.fill();
  } else if (acc === 'scarf') {
    ctx.strokeStyle = drip?.accentColor || '#ef4444';
    ctx.lineWidth = Math.max(4, lineWidth * 0.85);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sk.neck[0] - r * 0.55, sk.neck[1] + r * 0.1);
    ctx.lineTo(sk.neck[0] + r * 0.55, sk.neck[1] + r * 0.1);
    ctx.lineTo(sk.neck[0] + r * 0.35, sk.neck[1] + r * 0.95);
    ctx.stroke();
  } else if (acc === 'mask') {
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(hx, hy + r * 0.18, r * 0.88, 0, Math.PI);
    ctx.fill();
  } else if (acc === 'katana' || acc === 'bat') {
    ctx.strokeStyle = acc === 'katana' ? '#e2e8f0' : '#a16207';
    ctx.lineWidth = Math.max(2.5, lineWidth * 0.55);
    ctx.beginPath();
    ctx.moveTo(sk.shoulder[0] - sk.facing * r * 0.5, sk.shoulder[1] + r * 0.6);
    ctx.lineTo(sk.shoulder[0] - sk.facing * r * 1.4, sk.shoulder[1] - r * 1.3);
    ctx.stroke();
  }
  ctx.restore();
}

function drawProp(ctx, sk, scale, t) {
  const prop = sk.prop;
  if (!prop) return;
  const [hx, hy] = sk.head;
  const r = sk.headR;
  ctx.save();
  if (prop === 'zzz') {
    ctx.fillStyle = '#93c5fd';
    ctx.font = `bold ${Math.round(r * 0.65)}px sans-serif`;
    for (let i = 0; i < 3; i++) {
      const phase = (t * 0.6 + i * 0.33) % 1;
      ctx.globalAlpha = 1 - phase;
      ctx.fillText('Z', hx + r * (0.6 + phase * 1.2), hy - r * (0.9 + phase * 1.6));
    }
  } else if (prop === 'alert') {
    // Red/yellow shock rays above head
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = Math.max(2.5, scale * 0.012);
    for (const a of [-0.5, 0, 0.5]) {
      const ang = -Math.PI / 2 + a;
      ctx.beginPath();
      ctx.moveTo(hx + Math.cos(ang) * r * 1.35, hy + Math.sin(ang) * r * 1.35);
      ctx.lineTo(hx + Math.cos(ang) * r * 1.85, hy + Math.sin(ang) * r * 1.85);
      ctx.stroke();
    }
  } else if (prop === 'phone' || prop === 'remote') {
    const [rx, ry] = sk.rHand;
    const phone = prop === 'phone';
    const pw = Math.max(8, r * (phone ? 0.54 : 0.46));
    const ph = Math.max(12, r * (phone ? 0.96 : 0.72));
    const bob = Math.sin(t * 2.4 + hx * 0.01) * r * 0.025;
    ctx.save();
    ctx.translate(rx, ry + bob);
    ctx.rotate(0.08 + Math.sin(t * 1.8 + hx * 0.02) * 0.045);
    const corner = Math.max(2, r * 0.09);
    const caseGradient = ctx.createLinearGradient(-pw / 2, -ph / 2, pw / 2, ph / 2);
    caseGradient.addColorStop(0, phone ? '#334155' : '#475569');
    caseGradient.addColorStop(0.5, '#080d17');
    caseGradient.addColorStop(1, '#1e293b');
    ctx.shadowColor = phone ? 'rgba(56,189,248,0.72)' : 'rgba(148,163,184,0.35)';
    ctx.shadowBlur = phone ? r * (0.25 + 0.12 * (0.5 + 0.5 * Math.sin(t * 3))) : r * 0.08;
    ctx.fillStyle = caseGradient;
    ctx.strokeStyle = 'rgba(226,232,240,0.7)';
    ctx.lineWidth = Math.max(1, r * 0.035);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-pw / 2, -ph / 2, pw, ph, corner);
    else ctx.rect(-pw / 2, -ph / 2, pw, ph);
    ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    if (phone) {
      const screen = ctx.createLinearGradient(0, -ph * 0.38, 0, ph * 0.38);
      screen.addColorStop(0, '#164e78'); screen.addColorStop(1, '#081525');
      ctx.fillStyle = screen;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-pw * 0.38, -ph * 0.39, pw * 0.76, ph * 0.78, corner * 0.55);
      else ctx.rect(-pw * 0.38, -ph * 0.39, pw * 0.76, ph * 0.78);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      ctx.fillRect(-pw * 0.24, -ph * 0.30, pw * 0.19, Math.max(0.8, r * 0.025));
      ctx.fillRect(-pw * 0.01, -ph * 0.30, pw * 0.11, Math.max(0.8, r * 0.025));
      ctx.fillStyle = 'rgba(255,255,255,0.76)';
      ctx.beginPath(); ctx.arc(-pw * 0.19, -ph * 0.08, Math.max(1, r * 0.065), 0, TWO_PI); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-pw * 0.02, -ph * 0.15, pw * 0.27, Math.max(1.5, ph * 0.12), corner * 0.3);
      else ctx.rect(-pw * 0.02, -ph * 0.15, pw * 0.27, Math.max(1.5, ph * 0.12));
      ctx.fill();
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-pw * 0.24, ph * 0.06, pw * 0.42, Math.max(1.5, ph * 0.13), corner * 0.3);
      else ctx.rect(-pw * 0.24, ph * 0.06, pw * 0.42, Math.max(1.5, ph * 0.13));
      ctx.fill();
      const pulse = 0.55 + 0.45 * Math.sin(t * 4.2);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath(); ctx.arc(pw * 0.29, -ph * 0.33, Math.max(1.2, r * 0.055), 0, TWO_PI); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath(); ctx.arc(0, ph * 0.43, Math.max(1, r * 0.035), 0, TWO_PI); ctx.fill();
    } else {
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = ['#ef4444', '#facc15', '#22c55e', '#3b82f6', '#94a3b8'][i];
        ctx.beginPath(); ctx.arc(0, -ph * 0.28 + i * ph * 0.14, Math.max(1, r * 0.05), 0, TWO_PI); ctx.fill();
      }
    }
    // A small thumb overlaps the glass so the device feels held rather than floating.
    ctx.fillStyle = 'rgba(241,245,249,0.92)';
    ctx.beginPath(); ctx.ellipse(pw * 0.39, ph * 0.18, Math.max(1.5, r * 0.075), Math.max(2, r * 0.13), 0.28, 0, TWO_PI); ctx.fill();
    ctx.restore();
  } else if (prop === 'plank') {
    const [lx, ly] = sk.lHand;
    const [rx, ry] = sk.rHand;
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = Math.max(5, scale * 0.032);
    ctx.beginPath();
    ctx.moveTo(lx - r * 0.6, ly - r * 0.4);
    ctx.lineTo(rx + r * 0.6, ry + r * 0.4);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFigure(ctx, sk, { ink, lineWidth, face, shadowColor, scale, drip, isZombie, t }) {
  const seg = (a, b) => { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); };
  const inf = isZombie ? 1 : (sk.infection || 0);

  // Ground shadow first (under feet).
  if (shadowColor) {
    const footY = Math.max(sk.lFoot[1], sk.rFoot[1], sk.lKnee[1], sk.rKnee[1]);
    const cx = (sk.lFoot[0] + sk.rFoot[0] + sk.hip[0]) / 3;
    ctx.fillStyle = inf > 0.4 ? 'rgba(34,197,94,0.22)' : shadowColor;
    ctx.beginPath();
    ctx.ellipse(cx, footY + 3, scale * 0.22, scale * 0.026, 0, 0, TWO_PI);
    ctx.fill();
  }

  // Zombie toxic aura / spores when infected
  if (inf > 0.25) {
    ctx.save();
    ctx.fillStyle = ZOMBIE_GLOW;
    for (let i = 0; i < 4; i++) {
      const p = (t * 0.9 + i * 0.25) % 1;
      ctx.globalAlpha = 0.45 * inf * (1 - p);
      ctx.beginPath();
      ctx.arc(
        sk.chest[0] + Math.sin(t * 3 + i * 2) * scale * 0.14,
        sk.chest[1] - p * scale * 0.28,
        scale * 0.018,
        0,
        TWO_PI,
      );
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Filled articulated anatomy retains the latest inked contour and soft
  // mitten styling, with actual clothing, denim volume and rounded sneakers.
  const outline = '#172334';
  const skin = inf > 0 ? lerpColor('#fff9e9', '#a3d978', inf) : '#fff9ed';
  const defaultShirt = ['#f8fafc', '#0f172a', ZOMBIE_COLOR].includes(ink) ? '#ed873d' : ink;
  const outfit = { top: 'tshirt', outfitColor: defaultShirt, accentColor: '#f8d481', ...drip };
  if (outfit.top === 'none') outfit.top = 'tshirt';
  const shirt = outfit.outfitColor || '#ed873d';
  const limb = (a, b, width, color, light = true) => {
    ctx.strokeStyle = outline; ctx.lineWidth = width + scale * 0.012; seg(a, b);
    ctx.strokeStyle = color; ctx.lineWidth = width; seg(a, b);
    if (light) {
      ctx.strokeStyle = 'rgba(255,245,216,0.18)'; ctx.lineWidth = width * 0.18;
      seg([a[0] - width * 0.22, a[1]], [b[0] - width * 0.22, b[1]]);
    }
  };
  for (const [hip, knee, foot, col] of [
    [sk.lHip, sk.lKnee, sk.lFoot, '#283e56'],
    [sk.rHip, sk.rKnee, sk.rFoot, '#37516c'],
  ]) {
    limb(hip, knee, scale * 0.064, col);
    limb(knee, foot, scale * 0.052, col);
    ctx.save(); ctx.translate(foot[0], foot[1]); ctx.scale(sk.facing || 1, 1);
    ctx.fillStyle = '#152536'; ctx.strokeStyle = outline; ctx.lineWidth = scale * 0.009;
    ctx.beginPath(); ctx.moveTo(-scale * 0.035, -scale * 0.032);
    ctx.quadraticCurveTo(scale * 0.045, -scale * 0.047, scale * 0.076, -scale * 0.009);
    ctx.lineTo(scale * 0.077, scale * 0.012); ctx.lineTo(-scale * 0.038, scale * 0.012);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#d9e4e6'; ctx.lineWidth = scale * 0.009;
    seg([-scale * 0.03, scale * 0.003], [scale * 0.068, scale * 0.003]);
    ctx.strokeStyle = '#a7bacb'; ctx.lineWidth = scale * 0.004;
    seg([scale * 0.012, -scale * 0.023], [scale * 0.032, -scale * 0.012]);
    ctx.restore();
  }
  limb(sk.lHip, sk.rHip, scale * 0.065, '#31475d');
  const arm = (sh, el, hand) => {
    limb(sh, el, scale * 0.048, skin);
    limb(el, hand, scale * 0.038, skin);
    const long = !['tshirt', 'vest', 'tattered'].includes(outfit.top);
    if (outfit.top !== 'vest') {
      const end = long ? el : [sh[0] + (el[0] - sh[0]) * 0.52, sh[1] + (el[1] - sh[1]) * 0.52];
      limb(sh, end, scale * (outfit.top === 'puff_jacket' ? 0.076 : 0.065), shirt);
      if (long) limb(el, [el[0] + (hand[0] - el[0]) * 0.84, el[1] + (hand[1] - el[1]) * 0.84], scale * 0.051, shirt);
    }
    ctx.fillStyle = skin; ctx.strokeStyle = outline; ctx.lineWidth = scale * 0.007;
    ctx.beginPath(); ctx.ellipse(hand[0], hand[1], scale * 0.027, scale * 0.032, -0.25, 0, TWO_PI); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(hand[0] - scale * 0.02, hand[1] - scale * 0.006, scale * 0.012, 0, TWO_PI); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(93,64,48,0.35)'; ctx.lineWidth = scale * 0.003;
    seg([hand[0] + scale * 0.003, hand[1] + scale * 0.009], [hand[0] + scale * 0.018, hand[1] + scale * 0.012]);
  };
  arm(sk.lShoulder, sk.lElbow, sk.lHand);
  limb(sk.shoulder, sk.neck, scale * 0.055, skin);
  drawTopDrip(ctx, sk, outfit, scale * 0.039, outline);
  ctx.save(); ctx.translate(sk.shoulder[0], sk.shoulder[1]); ctx.rotate(sk.torsoAngle || 0);
  const torsoH = Math.hypot(sk.hip[0] - sk.shoulder[0], sk.hip[1] - sk.shoulder[1]);
  const fabric = ctx.createLinearGradient(-scale * 0.07, 0, scale * 0.07, 0);
  fabric.addColorStop(0, 'rgba(255,232,176,0.30)'); fabric.addColorStop(0.45, 'rgba(255,255,255,0)'); fabric.addColorStop(1, 'rgba(38,29,48,0.28)');
  ctx.fillStyle = fabric;
  ctx.beginPath(); ctx.moveTo(-scale * 0.073, 0); ctx.lineTo(scale * 0.073, 0); ctx.lineTo(scale * 0.06, torsoH); ctx.lineTo(-scale * 0.06, torsoH); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(66,35,26,0.4)'; ctx.lineWidth = scale * 0.005;
  ctx.beginPath(); ctx.arc(0, -scale * 0.008, scale * 0.027, 0, Math.PI); ctx.stroke();
  seg([-scale * 0.052, torsoH - scale * 0.013], [scale * 0.052, torsoH - scale * 0.013]);
  ctx.restore();
  arm(sk.rShoulder, sk.rElbow, sk.rHand);

  // Soft porcelain face with an inked edge, cheek glow and tiny moving eye blinks.
  const [hx, hy] = sk.head;
  const r = sk.headR;
  const faceGradient = ctx.createLinearGradient(hx - r * 0.78, hy - r * 0.92, hx + r * 0.52, hy + r * 0.94);
  if (inf > 0.3) {
    faceGradient.addColorStop(0, lerpColor('#f0fdf4', '#dcfce7', inf));
    faceGradient.addColorStop(0.58, lerpColor('#ccfbf1', '#4ade80', inf));
    faceGradient.addColorStop(1, lerpColor('#a5f3fc', '#14532d', inf));
  } else {
    faceGradient.addColorStop(0, '#ffffff');
    faceGradient.addColorStop(0.55, '#f3f8fa');
    faceGradient.addColorStop(1, '#a9e3ec');
  }
  const faceInk = inf > 0.45 ? '#102a1c' : '#07111f';
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.42)';
  ctx.shadowBlur = r * 0.18;
  ctx.shadowOffsetY = r * 0.08;
  ctx.fillStyle = faceGradient;
  ctx.strokeStyle = faceInk;
  ctx.lineWidth = Math.max(2, r * 0.105);
  ctx.beginPath(); ctx.arc(hx, hy, r, 0, TWO_PI); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.stroke();
  ctx.fillStyle = 'rgba(238,149,112,0.20)';
  for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.ellipse(hx + side * r * 0.59, hy + r * 0.24, r * 0.18, r * 0.1, 0, 0, TWO_PI); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(73,82,88,0.5)'; ctx.lineWidth = scale * 0.004;
  ctx.beginPath(); ctx.moveTo(hx + face.gaze * r * 0.12, hy + r * 0.01); ctx.quadraticCurveTo(hx + r * 0.13, hy + r * 0.15, hx + r * 0.03, hy + r * 0.18); ctx.stroke();

  // Soft painted highlight along the forehead.
  ctx.strokeStyle = inf > 0.3 ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.78)';
  ctx.lineWidth = Math.max(1.2, r * 0.045);
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(hx - r * 0.04, hy - r * 0.02, r * 0.82, Math.PI * 1.13, Math.PI * 1.62); ctx.stroke();

  // solvePose supplies natural blinking independently of camera coordinates.
  const eyeOpen = face.eye;
  const eyeR = Math.max(1.5, r * 0.125 * Math.min(1.65, Math.max(0.5, eyeOpen)));
  const gazeShift = face.gaze * r * 0.22;
  const eyeY = hy - r * 0.10;
  const lEyeX = hx - r * 0.34 + gazeShift;
  const rEyeX = hx + r * 0.34 + gazeShift;
  ctx.fillStyle = inf > 0.45 ? '#ef4444' : faceInk;
  if (eyeOpen < 0.25) {
    ctx.strokeStyle = faceInk;
    ctx.lineWidth = Math.max(1.5, r * 0.065);
    for (const eyeX of [lEyeX, rEyeX]) {
      ctx.beginPath(); ctx.moveTo(eyeX - r * 0.14, eyeY);
      ctx.quadraticCurveTo(eyeX, eyeY + r * 0.06, eyeX + r * 0.14, eyeY); ctx.stroke();
    }
  } else {
    ctx.beginPath(); ctx.arc(lEyeX, eyeY, eyeR, 0, TWO_PI); ctx.arc(rEyeX, eyeY, eyeR, 0, TWO_PI); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.beginPath();
    ctx.arc(lEyeX - eyeR * 0.28, eyeY - eyeR * 0.34, Math.max(0.65, eyeR * 0.24), 0, TWO_PI);
    ctx.arc(rEyeX - eyeR * 0.28, eyeY - eyeR * 0.34, Math.max(0.65, eyeR * 0.24), 0, TWO_PI);
    ctx.fill();
  }

  // Curved brows make fear, worry and anger read clearly in a tiny vertical frame.
  const brow = Math.max(-1, Math.min(1, face.brow || 0));
  if (Math.abs(brow) > 0.12 || face.smile < -0.35) {
    ctx.strokeStyle = faceInk;
    ctx.lineWidth = Math.max(1.6, r * 0.06);
    for (const [eyeX, side] of [[lEyeX, -1], [rEyeX, 1]]) {
      const by = eyeY - r * 0.27;
      const tilt = brow * side * r * 0.14;
      ctx.beginPath(); ctx.moveTo(eyeX - r * 0.17, by - tilt);
      ctx.quadraticCurveTo(eyeX, by - r * 0.045, eyeX + r * 0.17, by + tilt);
      ctx.stroke();
    }
  }

  // Mouth: a clean, high-contrast line or an animated open expression.
  const mouthY = hy + r * 0.38;
  ctx.strokeStyle = faceInk;
  ctx.fillStyle = inf > 0.5 ? '#166534' : faceInk;
  ctx.lineWidth = Math.max(1.6, r * 0.065);
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (face.mouth > 0.22) {
    ctx.ellipse(hx + gazeShift * 0.3, mouthY, r * 0.20, Math.max(1.2, r * 0.22 * face.mouth), 0, 0, TWO_PI);
    ctx.fill();
  } else {
    ctx.moveTo(hx - r * 0.31, mouthY);
    ctx.quadraticCurveTo(hx, mouthY + face.smile * r * 0.34, hx + r * 0.31, mouthY);
    ctx.stroke();
  }

  if (face.tears > 0.3) {
    ctx.fillStyle = '#38bdf8';
    for (const dx of [-0.34, 0.34]) {
      const tx = hx + r * dx + gazeShift;
      const ty = eyeY + r * 0.30;
      ctx.beginPath(); ctx.ellipse(tx, ty, r * 0.07, r * 0.13, 0, 0, TWO_PI); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath(); ctx.arc(tx - r * 0.02, ty - r * 0.05, r * 0.025, 0, TWO_PI); ctx.fill();
      ctx.fillStyle = '#38bdf8';
    }
  }
  ctx.restore();

  // Accessories (shades, glasses, chains, headphones, weapons) & Hats
  drawAccessoryDrip(ctx, sk, drip, lineWidth, gazeShift);
  drawHatDrip(ctx, sk, drip, lineWidth);
  drawProp(ctx, sk, scale, t);
  ctx.restore();
}

function drawEffectsBefore(ctx, effects, L, t, ink, action) {
  const { W, H, scale } = L;
  if (effects.includes('motion_lines')) {
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = Math.max(2, scale * 0.012);
    for (let i = 0; i < 5; i++) {
      const y = H * (0.45 + i * 0.06);
      const x = W * 0.06 + ((t * 260 + i * 50) % (W * 0.65));
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + W * 0.11, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  if (effects.includes('speed_lines') || action === 'run' || action === 'zombie_chase' || action === 'fight') {
    if (effects.includes('speed_lines')) {
      ctx.strokeStyle = ink;
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = 2;
      for (let i = 0; i < 14; i++) {
        const x = ((i * 137 + t * 480) % (W * 1.2)) - W * 0.1;
        const y = (i * 53) % H;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - W * 0.09, y + H * 0.015);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }
  if (effects.includes('explosion')) {
    const k = Math.min(1, t / 0.9);
    if (k < 1) {
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      const cx = W * 0.5, cy = H * 0.45, R = scale * (0.3 + 0.95 * k);
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
        const phase = (t * 1.4 + i / 3) % 1;
        ctx.globalAlpha = 0.45 * (1 - phase);
        ctx.fillStyle = '#cbd5e1';
        ctx.beginPath();
        ctx.arc(sk.hip[0] + (i - 1) * scale * 0.18 * (1 + phase), footY - phase * scale * 0.05, scale * (0.035 + phase * 0.045), 0, TWO_PI);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  if (effects.includes('infection_spores')) {
    ctx.save();
    ctx.fillStyle = '#4ade80';
    for (let i = 0; i < 16; i++) {
      const px = ((i * 97 + t * 35) % W);
      const py = H * 0.85 - ((t * 55 + i * 43) % (H * 0.65));
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 3 + i);
      ctx.beginPath();
      ctx.arc(px, py, 3 + (i % 3), 0, TWO_PI);
      ctx.fill();
    }
    ctx.restore();
  }
  if (effects.includes('rain')) {
    ctx.save();
    ctx.strokeStyle = 'rgba(186,230,253,0.35)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 28; i++) {
      const rx = ((i * 73 + t * 180) % W);
      const ry = ((i * 127 + t * 620) % H);
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 6, ry + 18);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (effects.includes('float_text') && sketches.length) {
    const sk = sketches[0];
    const symbol = sk.symbol;
    if (symbol) {
      const rise = ((t * 0.6) % 1) * scale * 0.14;
      ctx.globalAlpha = 1 - ((t * 0.6) % 1);
      ctx.fillStyle = '#facc15';
      ctx.font = `bold ${Math.round(scale * 0.15)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(symbol, sk.head[0] + sk.headR * 1.5, sk.head[1] - sk.headR * 1.2 - rise);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }
  }
}

function floatSymbol(action, emotion) {
  if (action === 'think' || emotion === 'confused') return '?';
  if (action === 'surprised' || emotion === 'surprised' || action === 'scared' || emotion === 'scared' || action === 'wake_up' || action === 'panic') return '!';
  if (action === 'zombie_walk' || action === 'zombie_chase' || action === 'infect' || action === 'turn_zombie') return '☣';
  if (action === 'laugh' || action === 'celebrate') return '★';
  return '';
}

/**
 * Subtitle position that avoids character heads. Starts at the requested band
 * and tries the other bands if the text box would cover a face.
 */
export function subtitleY(H, position, size, headBoxes) {
  const bands = { bottom: 0.9, middle: 0.5, top: 0.1 };
  const order = [position, 'bottom', 'top', 'middle'].filter((v, i, a) => a.indexOf(v) === i);
  const boxHeight = size * 1.65;
  for (const name of order) {
    const y = H * bands[name];
    const top = y - boxHeight / 2;
    const bottom = y + boxHeight / 2;
    const hit = headBoxes.some((b) => bottom > b.y && top < b.y + b.h);
    if (!hit) return y;
  }
  return H * bands[position];
}

/** Draw a punchy viral-style caption with thick outline and rounded pill backing. */
export function drawSubtitle(ctx, text, W, y, opts) {
  if (!text) return;
  const size = opts.size;
  ctx.save();
  ctx.font = `800 ${size}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const maxWidth = W * 0.9;
  const w = Math.min(maxWidth + size * 0.8, ctx.measureText(text).width + size * 1.1);
  const h = size * 1.55;
  ctx.fillStyle = 'rgba(8, 12, 22, 0.72)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(W / 2 - w / 2, y - h / 2, w, h, 10);
  else ctx.rect(W / 2 - w / 2, y - h / 2, w, h);
  ctx.fill();

  if (opts.outlineWidth > 0) {
    ctx.strokeStyle = opts.outlineColor;
    ctx.lineWidth = opts.outlineWidth;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, W / 2, y, maxWidth);
  }
  ctx.fillStyle = opts.color;
  ctx.fillText(text, W / 2, y, maxWidth);
  ctx.restore();
}

/**
 * Render one frame.
 * scene: normalized scene from shared/schema.js
 * t: seconds since the scene started
 * opts: { W, H, projectCharacters?: array, subtitle?: { text, enabled, size, position, color, outlineColor, outlineWidth } }
 */
export function renderFrame(ctx, scene, t, opts) {
  const { W, H } = opts;
  const dur = Math.max(0.001, scene.duration);
  const local = Math.max(0, Math.min(t, dur));
  const progress = local / dur;
  const bgInfo = BACKGROUND_INFO[scene.background] ?? BACKGROUND_INFO.street;
  const dark = !!bgInfo.dark;
  const defaultInk = dark ? '#f8fafc' : '#0f172a';
  const L = layoutFor(W, H, scene.characters.length);
  const effects = scene.effects || [];
  const shaken = effects.includes('shake') || effects.includes('alarm_flash');
  const breathingZoom = 1 + Math.sin(progress * Math.PI) * 0.012;
  const zoom = effects.includes('zoom') ? 1 + 0.07 * progress : breathingZoom;

  // Lookup map for character outfits/colors from project.characters
  const charMetaMap = new Map();
  if (Array.isArray(opts.projectCharacters)) {
    for (const pc of opts.projectCharacters) charMetaMap.set(pc.id, pc);
  }

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  drawBackground(ctx, scene.background, W, H, local);

  // Camera: zoom around the centre plus shake.
  const shakeAmp = effects.includes('shake') ? 0.0065 : 0.0025;
  const shakeX = shaken ? Math.sin(local * 45) * shakeAmp * W : 0;
  const shakeY = shaken ? Math.cos(local * 38) * shakeAmp * H : 0;
  ctx.translate(W / 2 + shakeX, H / 2 + shakeY);
  ctx.scale(zoom, zoom);
  ctx.translate(-W / 2, -H / 2);
  // Props and actors must share the camera or sleepers drift off pillows.
  // The first pass remains as overscan underpainting at shaken frame edges.
  if (zoom !== 1 || shaken) drawBackground(ctx, scene.background, W, H, local);

  if (effects.includes('night')) drawTint(ctx, W, H, 'rgba(8,15,45,0.32)');
  if (effects.includes('day')) drawTint(ctx, W, H, 'rgba(255,230,160,0.08)');
  if (effects.includes('alarm_flash')) {
    const redPulse = 0.14 + 0.14 * Math.sin(local * 9);
    drawTint(ctx, W, H, `rgba(220,38,38,${redPulse})`);
  }
  if (effects.includes('tv_glow')) {
    const bluePulse = 0.1 + 0.06 * Math.sin(local * 18);
    drawTint(ctx, W, H, `rgba(56,189,248,${bluePulse})`);
  }

  const sketches = [];
  const characterCount = scene.characters.length;
  const mainAction = scene.characters[0]?.action;
  drawEffectsBefore(ctx, effects, L, local, defaultInk, mainAction);

  scene.characters.forEach((c, i) => {
    const meta = charMetaMap.get(c.id) || {};
    const pose = solvePose(c.action, local, c.emotion, dur);
    const hasTarget = typeof c.targetX === 'number' && Number.isFinite(c.targetX);
    const curX = hasTarget ? c.position.x + (c.targetX - c.position.x) * progress : c.position.x;
    let px = curX * W;
    let groundY = (c.position.y ?? bgInfo.ground) * H;
    let charScale = L.scale * (c.scale || 1) * (characterCount > 3 ? 0.92 : 1);
    let facing = c.facing === -1 ? -1 : 1;
    const stage = scene.background === 'bedroom' ? bedroomStaging(c.action, progress, W, H, charScale) : null;
    if (stage) {
      px = stage.x; groundY = stage.groundY; charScale = stage.scale; facing = stage.facing;
      pose.dist = 0;
      pose.gaze = c.action === 'watch_tv' || c.action === 'look_window' ? 0.85 : pose.gaze;
    }
    // Ease travel toward safe frame limits, rather than hitting an invisible wall.
    if (!hasTarget && pose.dist) {
      const room = Math.max(charScale * 0.08, facing > 0 ? W * 0.85 - px : px - W * 0.15);
      const limit = room / charScale;
      pose.dist = limit * Math.tanh(pose.dist / limit);
    }

    const sk = buildSkeleton(pose, {
      x: px,
      groundY,
      scale: charScale,
      facing,
      disableDist: hasTarget,
    });
    // Protect the full silhouette, including extended hands, hats and shoes.
    const jointKeys = ['hip', 'chest', 'neck', 'shoulder', 'lShoulder', 'rShoulder', 'lHip', 'rHip', 'head', 'lElbow', 'lHand', 'rElbow', 'rHand', 'lKnee', 'lFoot', 'rKnee', 'rFoot'];
    if (Number.isFinite(stage?.hipY)) {
      const dy = stage.hipY - sk.hip[1];
      for (const k of jointKeys) sk[k] = [sk[k][0], sk[k][1] + dy];
      sk.headBox.y += dy;
    }
    const left = Math.min(...jointKeys.map(k => sk[k][0]), sk.head[0] - sk.headR * 1.45) - charScale * 0.045;
    const right = Math.max(...jointKeys.map(k => sk[k][0]), sk.head[0] + sk.headR * 1.45) + charScale * 0.08;
    const margin = W * (effects.includes('zoom') ? 0.055 : 0.025);
    const shiftX = left < margin ? margin - left : right > W - margin ? W - margin - right : 0;
    if (Math.abs(shiftX) > 0.5) {
      for (const k of jointKeys) {
        sk[k] = [sk[k][0] + shiftX, sk[k][1]];
      }
      sk.headBox.x += shiftX;
    }

    const isZombie = Boolean(c.isZombie || meta.isZombie || c.action === 'zombie_walk' || c.action === 'zombie_chase' || c.action === 'infect');
    const charInk = isZombie ? ZOMBIE_COLOR : (meta.color || (dark ? defaultInk : '#0f172a'));
    sk.ink = charInk;
    sk.symbol = effects.includes('float_text') && i === 0 ? floatSymbol(c.action, c.emotion) : '';
    sketches.push(sk);

    drawFigure(ctx, sk, {
      ink: charInk,
      lineWidth: Math.max(1.6, charScale * 0.022),
      face: {
        smile: pose.smile,
        eye: pose.eye,
        mouth: pose.mouth,
        tears: pose.tears,
        gaze: pose.gaze,
        brow: pose.brow,
      },
      shadowColor: stage?.inBed ? null : dark ? 'rgba(0,0,0,0.38)' : 'rgba(0,0,0,0.16)',
      scale: charScale,
      drip: c.drip || meta.drip,
      isZombie,
      t: local,
    });
  });

  drawEffectsAfter(ctx, effects, L, local, sketches);

  // A restrained edge vignette gives every shot a filmic frame without obscuring the scene.
  const vignette = ctx.createRadialGradient(W * 0.5, H * 0.45, Math.min(W, H) * 0.22, W * 0.5, H * 0.5, Math.max(W, H) * 0.78);
  vignette.addColorStop(0, 'rgba(4,8,20,0)');
  vignette.addColorStop(0.72, 'rgba(4,8,20,0.035)');
  vignette.addColorStop(1, 'rgba(4,8,20,0.18)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  if (effects.includes('impact_flash')) {
    const a = Math.max(0, 0.55 - local * 2.4);
    if (a > 0) {
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  ctx.restore();

  // Optional top HUD badge for scene textOverlay (e.g. "BREAKING NEWS", "DAY 1: OUTBREAK")
  if (scene.textOverlay) {
    ctx.save();
    const badgeH = Math.max(24, Math.round(Math.min(W, H) * 0.045));
    ctx.font = `800 ${ Math.round(badgeH * 0.58) }px system-ui, sans-serif`;
    const tw = ctx.measureText(scene.textOverlay).width + badgeH * 1.2;
    ctx.fillStyle = 'rgba(220, 38, 38, 0.88)';
    ctx.fillRect(W * 0.04, H * 0.04, tw, badgeH);
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(scene.textOverlay, W * 0.04 + badgeH * 0.6, H * 0.04 + badgeH / 2);
    ctx.restore();
  }

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
