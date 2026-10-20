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
  space: { dark: true, ground: 0.8 },
  beach: { dark: false, ground: 0.78 },
  snow: { dark: false, ground: 0.8 },
  castle: { dark: true, ground: 0.8 },
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

      // Bed on left side
      const bedroom = bedroomLayout(W, H);
      const bx = bedroom.bed.x, bw = bedroom.bed.w, bedTop = bedroom.bed.mattressY + H * 0.01;
      roundRect(ctx, '#451a03', bx, bedTop - H * 0.09, W * 0.035, H * 0.25, 4); // headboard
      roundRect(ctx, '#5c2d16', bx, groundY - H * 0.07, bw, H * 0.07, 3); // frame
      roundRect(ctx, '#e2e8f0', bx + W * 0.03, bedTop - H * 0.01, bw - W * 0.03, H * 0.06, 6); // mattress
      roundRect(ctx, '#f8fafc', bx + bw * 0.035, bedTop - H * 0.045, bw * 0.25, H * 0.04, 8); // pillow
      roundRect(ctx, '#2563eb', bx + bw * 0.29, bedTop - H * 0.008, bw * 0.71, H * 0.065, 6); // blanket

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
      // Lockers on left
      for (let i = 0; i < 3; i++) {
        rect(ctx, '#2563eb', W * 0.02 + i * (W * 0.035), groundY - H * 0.32, W * 0.032, H * 0.32);
      }
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
      // Desk
      rect(ctx, '#475569', W * 0.55, groundY - H * 0.14, W * 0.36, 10);
      rect(ctx, '#334155', W * 0.58, groundY - H * 0.14, 8, H * 0.14);
      rect(ctx, '#334155', W * 0.86, groundY - H * 0.14, 8, H * 0.14);
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
      rect(ctx, vGrad(ctx, groundY, H, [[0, '#143829'], [1, '#091c14']]), 0, groundY, W, H - groundY);
      break;
    }

    case 'desert': {
      rect(ctx, vGrad(ctx, 0, groundY, [[0, '#fb923c'], [0.55, '#fde047'], [1, '#fed7aa']]), 0, 0, W, groundY);
      circle(ctx, '#fffbeb', W * 0.76, H * 0.18, Math.min(W, H) * 0.075);
      poly(ctx, '#d97706', [[0, groundY], [W * 0.32, groundY - H * 0.15], [W * 0.68, groundY]]);
      poly(ctx, '#b45309', [[W * 0.38, groundY], [W * 0.78, groundY - H * 0.12], [W, groundY]]);
      rect(ctx, vGrad(ctx, groundY, H, [[0, '#f59e0b'], [1, '#b45309']]), 0, groundY, W, H - groundY);
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
      // Concrete roof ledge & AC unit
      rect(ctx, '#334155', 0, groundY - 14, W, 14);
      rect(ctx, '#1e293b', 0, groundY, W, H - groundY);
      roundRect(ctx, '#475569', W * 0.08, groundY - H * 0.14, W * 0.16, H * 0.14, 4);
      break;
    }

    case 'space': {
      // Alien moon surface under a starfield, ringed planet and a distant nebula.
      rect(ctx, vGrad(ctx, 0, groundY, [[0, '#02030a'], [0.6, '#0b0f2e'], [1, '#1b1146']]), 0, 0, W, groundY);
      circle(ctx, 'rgba(168,85,247,0.14)', W * 0.3, H * 0.25, Math.min(W, H) * 0.35);
      drawStars(ctx, W, groundY, rnd, 90, t);
      const px = W * 0.76, py = H * 0.2, pr = Math.min(W, H) * 0.09;
      circle(ctx, '#f97316', px, py, pr);
      circle(ctx, 'rgba(0,0,0,0.28)', px + pr * 0.3, py + pr * 0.2, pr * 0.82);
      ctx.strokeStyle = 'rgba(253,230,138,0.7)';
      ctx.lineWidth = Math.max(2, pr * 0.1);
      ctx.beginPath(); ctx.ellipse(px, py, pr * 1.7, pr * 0.4, -0.35, 0, Math.PI * 2); ctx.stroke();
      // Far crater ridge
      poly(ctx, '#2a2550', [[0, groundY], [0, groundY - H * 0.06], [W * 0.2, groundY - H * 0.1], [W * 0.45, groundY - H * 0.05], [W * 0.7, groundY - H * 0.11], [W, groundY - H * 0.06], [W, groundY]]);
      rect(ctx, vGrad(ctx, groundY, H, [[0, '#4b4a6b'], [1, '#26253f']]), 0, groundY, W, H - groundY);
      for (let i = 0; i < 6; i++) {
        const cx = rnd() * W, cy = groundY + (H - groundY) * (0.25 + rnd() * 0.6);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.ellipse(cx, cy, W * 0.05, H * 0.012, 0, 0, Math.PI * 2); ctx.fill();
      }
      // Crashed rocket
      const rx = W * 0.1;
      poly(ctx, '#e2e8f0', [[rx, groundY], [rx + W * 0.05, groundY - H * 0.2], [rx + W * 0.1, groundY]]);
      circle(ctx, '#38bdf8', rx + W * 0.05, groundY - H * 0.1, W * 0.014);
      poly(ctx, '#ef4444', [[rx - W * 0.015, groundY], [rx + W * 0.012, groundY - H * 0.06], [rx + W * 0.02, groundY]]);
      break;
    }

    case 'beach': {
      rect(ctx, vGrad(ctx, 0, groundY, [[0, '#38bdf8'], [0.7, '#bae6fd'], [1, '#fef3c7']]), 0, 0, W, groundY);
      circle(ctx, 'rgba(254,240,138,0.4)', W * 0.2, H * 0.16, Math.min(W, H) * 0.13);
      circle(ctx, '#fde047', W * 0.2, H * 0.16, Math.min(W, H) * 0.065);
      // Clouds drifting
      for (let i = 0; i < 3; i++) {
        const cx = ((i * 0.37 + t * 0.01) % 1.2) * W - W * 0.1, cy = H * (0.1 + i * 0.07);
        circle(ctx, 'rgba(255,255,255,0.85)', cx, cy, W * 0.04);
        circle(ctx, 'rgba(255,255,255,0.85)', cx + W * 0.04, cy + 4, W * 0.05);
        circle(ctx, 'rgba(255,255,255,0.85)', cx + W * 0.09, cy, W * 0.035);
      }
      // Sea with moving wave lines
      const seaTop = groundY - H * 0.14;
      rect(ctx, vGrad(ctx, seaTop, groundY, [[0, '#0ea5e9'], [1, '#22d3ee']]), 0, seaTop, W, groundY - seaTop);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      for (let r = 0; r < 3; r++) {
        ctx.beginPath();
        for (let x = 0; x <= W; x += 12) {
          const y = seaTop + (groundY - seaTop) * (0.25 + r * 0.28) + Math.sin(x * 0.03 + t * 1.5 + r) * 3;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // Sand
      rect(ctx, vGrad(ctx, groundY, H, [[0, '#fde68a'], [1, '#f2c879']]), 0, groundY, W, H - groundY);
      rect(ctx, 'rgba(255,255,255,0.7)', 0, groundY - 3, W, 4);
      // Palm tree
      const tx = W * 0.86;
      ctx.strokeStyle = '#92400e'; ctx.lineWidth = Math.max(6, W * 0.015); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(tx, groundY + H * 0.04); ctx.quadraticCurveTo(tx - W * 0.03, groundY - H * 0.2, tx + W * 0.01, groundY - H * 0.36); ctx.stroke();
      ctx.strokeStyle = '#16a34a'; ctx.lineWidth = Math.max(5, W * 0.012);
      for (const a of [-2.7, -2.1, -1.5, -0.9, -0.3]) {
        const sway = Math.sin(t * 1.4 + a) * 0.06;
        const ex = tx + W * 0.01 + Math.cos(a + sway) * W * 0.11, ey = groundY - H * 0.36 + Math.sin(a + sway) * H * 0.09 + H * 0.05;
        ctx.beginPath(); ctx.moveTo(tx + W * 0.01, groundY - H * 0.36); ctx.quadraticCurveTo((tx + ex) / 2, groundY - H * 0.42, ex, ey); ctx.stroke();
      }
      // Umbrella
      const ux = W * 0.12;
      rect(ctx, '#78350f', ux - 2, groundY - H * 0.12, 4, H * 0.13);
      poly(ctx, '#ef4444', [[ux - W * 0.09, groundY - H * 0.12], [ux, groundY - H * 0.2], [ux + W * 0.09, groundY - H * 0.12]]);
      poly(ctx, '#fef2f2', [[ux - W * 0.03, groundY - H * 0.12], [ux, groundY - H * 0.2], [ux + W * 0.03, groundY - H * 0.12]]);
      break;
    }

    case 'snow': {
      rect(ctx, vGrad(ctx, 0, groundY, [[0, '#94a3b8'], [0.6, '#cbd5e1'], [1, '#f1f5f9']]), 0, 0, W, groundY);
      circle(ctx, 'rgba(255,255,255,0.5)', W * 0.78, H * 0.16, Math.min(W, H) * 0.07);
      // Mountains with snowcaps
      const peaks = [[0.1, 0.34], [0.32, 0.46], [0.58, 0.38], [0.82, 0.5]];
      for (const [px, ph] of peaks) {
        const x = W * px, h = H * ph, w = W * 0.3;
        poly(ctx, '#64748b', [[x - w, groundY], [x, groundY - h], [x + w, groundY]]);
        poly(ctx, '#f8fafc', [[x - w * 0.28, groundY - h * 0.72], [x, groundY - h], [x + w * 0.28, groundY - h * 0.72], [x + w * 0.1, groundY - h * 0.8], [x, groundY - h * 0.7], [x - w * 0.1, groundY - h * 0.78]]);
      }
      rect(ctx, vGrad(ctx, groundY, H, [[0, '#f8fafc'], [1, '#dbeafe']]), 0, groundY, W, H - groundY);
      // Pine trees
      for (const [fx, sc] of [[0.06, 1.1], [0.16, 0.8], [0.9, 1.0], [0.97, 0.7]]) {
        const x = W * fx, base = groundY + H * 0.02, th = H * 0.26 * sc;
        rect(ctx, '#78350f', x - 4, base - H * 0.03, 8, H * 0.03);
        for (let k = 0; k < 3; k++) {
          const w = W * 0.05 * sc * (1 - k * 0.22), y = base - H * 0.03 - k * th * 0.28;
          poly(ctx, '#14532d', [[x - w, y], [x, y - th * 0.38], [x + w, y]]);
          poly(ctx, '#f8fafc', [[x - w * 0.55, y - th * 0.14], [x, y - th * 0.38], [x + w * 0.55, y - th * 0.14]]);
        }
      }
      // Falling snow
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (let i = 0; i < 70; i++) {
        const x = (rnd() * W + Math.sin(t + i) * 10 + W) % W;
        const y = ((rnd() * H + t * (40 + (i % 5) * 14)) % H);
        ctx.beginPath(); ctx.arc(x, y, 1.4 + (i % 3), 0, Math.PI * 2); ctx.fill();
      }
      break;
    }

    case 'castle': {
      rect(ctx, vGrad(ctx, 0, groundY, [[0, '#1e1b4b'], [0.55, '#6d28d9'], [1, '#f59e0b']]), 0, 0, W, groundY);
      circle(ctx, '#fef3c7', W * 0.72, H * 0.2, Math.min(W, H) * 0.06);
      drawStars(ctx, W, groundY * 0.4, rnd, 30, t);
      // Rolling hills
      poly(ctx, '#312e81', [[0, groundY], [0, groundY - H * 0.1], [W * 0.3, groundY - H * 0.16], [W * 0.6, groundY - H * 0.08], [W, groundY - H * 0.14], [W, groundY]]);
      // Castle: keep, towers, gate
      const cx = W * 0.5, cw = W * 0.5, base = groundY - H * 0.04;
      rect(ctx, '#3b3a5c', cx - cw / 2, base - H * 0.3, cw, H * 0.3);
      for (let i = 0; i < 9; i++) rect(ctx, '#3b3a5c', cx - cw / 2 + i * (cw / 8.4), base - H * 0.34, cw / 16, H * 0.04);
      for (const sx of [-cw / 2, cw / 2 - W * 0.07]) {
        rect(ctx, '#4a4975', cx + sx, base - H * 0.5, W * 0.07, H * 0.5);
        poly(ctx, '#7f1d1d', [[cx + sx - 6, base - H * 0.5], [cx + sx + W * 0.035, base - H * 0.62], [cx + sx + W * 0.07 + 6, base - H * 0.5]]);
        rect(ctx, '#fde047', cx + sx + W * 0.028, base - H * 0.4, W * 0.014, H * 0.045);
      }
      roundRect(ctx, '#1c1917', cx - W * 0.05, base - H * 0.16, W * 0.1, H * 0.16, 30);
      // Banner flutter
      const flap = Math.sin(t * 3) * 6;
      rect(ctx, '#94a3b8', cx - 2, base - H * 0.5, 4, H * 0.2);
      poly(ctx, '#dc2626', [[cx + 2, base - H * 0.5], [cx + W * 0.06, base - H * 0.48 + flap], [cx + 2, base - H * 0.44]]);
      // Grass + dirt path
      rect(ctx, vGrad(ctx, groundY, H, [[0, '#365314'], [1, '#1a2e05']]), 0, groundY, W, H - groundY);
      poly(ctx, '#78716c', [[cx - W * 0.04, groundY - H * 0.04], [cx + W * 0.04, groundY - H * 0.04], [cx + W * 0.2, H], [cx - W * 0.2, H]]);
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
