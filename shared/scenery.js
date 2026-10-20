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
      const bx = W * 0.04, bw = W * 0.36, bedTop = groundY - H * 0.16;
      roundRect(ctx, '#451a03', bx, bedTop - H * 0.09, W * 0.035, H * 0.25, 4); // headboard
      roundRect(ctx, '#5c2d16', bx, groundY - H * 0.07, bw, H * 0.07, 3); // frame
      roundRect(ctx, '#e2e8f0', bx + W * 0.03, bedTop - H * 0.01, bw - W * 0.03, H * 0.06, 6); // mattress
      roundRect(ctx, '#f8fafc', bx + W * 0.04, bedTop - H * 0.045, W * 0.09, H * 0.04, 8); // pillow
      roundRect(ctx, '#2563eb', bx + W * 0.11, bedTop - H * 0.008, bw - W * 0.11, H * 0.065, 6); // blanket

      // TV Stand & Wide-screen TV on right side (Emergency Broadcast!)
      const tx = W * 0.74, tw = W * 0.22, ty = groundY - H * 0.26, th = H * 0.14;
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
        const dx = ((i * W) / 6 - (t * 25) % (W / 6));
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
        const sy = H * 0.25 - ((t * 14 + i * 25) % 60);
        circle(ctx, 'rgba(41,37,36,0.45)', sx, sy, Math.min(W, H) * 0.09);
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
}

/** Overlay tint for day/night/alarm effects. */
export function drawTint(ctx, W, H, color) {
  rect(ctx, color, 0, 0, W, H);
}
