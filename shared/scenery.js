// Procedural vector backgrounds. Every background is drawn with basic 2D
// canvas primitives (rects, paths, arcs) so it works both in the browser and
// on the server-side canvas used for MP4 export.

// `dark` backgrounds get light ink for the figures and captions.
export const BACKGROUND_INFO = {
  white: { dark: false, ground: 0.8 },
  black: { dark: true, ground: 0.8 },
  bedroom: { dark: false, ground: 0.8 },
  street: { dark: false, ground: 0.8 },
  city: { dark: true, ground: 0.8 },
  school: { dark: false, ground: 0.8 },
  office: { dark: false, ground: 0.8 },
  forest: { dark: false, ground: 0.8 },
  desert: { dark: false, ground: 0.8 },
  battlefield: { dark: true, ground: 0.8 },
  horror: { dark: true, ground: 0.8 },
  landscape: { dark: false, ground: 0.8 },
};

function rect(ctx, color, x, y, w, h) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
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

/**
 * Draw a background filling W x H. `ground` is the y fraction of the floor line.
 * `t` is local scene time in seconds, used for slow ambient motion (clouds, fog).
 */
export function drawBackground(ctx, name, W, H, t = 0) {
  const g = BACKGROUND_INFO[name] ? name : 'white';
  const groundY = H * BACKGROUND_INFO[g].ground;
  const rnd = seeded(g.length * 9973 + Math.round(W));

  switch (g) {
    case 'black':
      rect(ctx, '#000000', 0, 0, W, H);
      rect(ctx, '#222222', 0, groundY, W, H - groundY);
      break;

    case 'white':
      rect(ctx, '#ffffff', 0, 0, W, H);
      rect(ctx, '#e6e6e6', 0, groundY, W, 2);
      break;

    case 'bedroom':
      rect(ctx, '#d9c8e8', 0, 0, W, groundY);
      rect(ctx, '#8a6a4f', 0, groundY, W, H - groundY);
      rect(ctx, '#bfe3ff', W * 0.62, H * 0.14, W * 0.26, H * 0.2);
      rect(ctx, '#ffffff', W * 0.62 + W * 0.13 - 2, H * 0.14, 4, H * 0.2);
      rect(ctx, '#5b4636', W * 0.05, groundY - H * 0.13, W * 0.45, H * 0.13);
      rect(ctx, '#a5c9ff', W * 0.05, groundY - H * 0.2, W * 0.45, H * 0.08);
      rect(ctx, '#7a5a42', W * 0.78, groundY - H * 0.25, 6, H * 0.25);
      break;

    case 'street':
      rect(ctx, '#9fd8ff', 0, 0, W, groundY);
      circle(ctx, '#ffe066', W * 0.82, H * 0.12, Math.min(W, H) * 0.05);
      rect(ctx, '#555555', 0, groundY, W, H - groundY);
      rect(ctx, '#f2f2f2', 0, groundY + (H - groundY) * 0.5, W, 4);
      for (let i = 0; i < 4; i++) {
        const x = (i * W) / 3 - (t * 30) % (W / 3);
        rect(ctx, '#777777', x, groundY - H * 0.28, 8, H * 0.28);
        rect(ctx, '#ffd98a', x - 14, groundY - H * 0.3, 22, 8);
      }
      break;

    case 'city': {
      rect(ctx, '#0b1230', 0, 0, W, H);
      for (let i = 0; i < 14; i++) {
        const bw = W * (0.06 + rnd() * 0.08);
        const bh = H * (0.2 + rnd() * 0.35);
        const bx = i * (W / 13) - bw / 2;
        rect(ctx, '#1d2748', bx, groundY - bh, bw, bh);
        for (let wy = groundY - bh + 12; wy < groundY - 10; wy += 22) {
          if (rnd() > 0.55) rect(ctx, '#ffe38a', bx + bw * 0.25, wy, bw * 0.2, 8);
        }
      }
      rect(ctx, '#111a33', 0, groundY, W, H - groundY);
      break;
    }

    case 'school':
      rect(ctx, '#f4efd9', 0, 0, W, groundY);
      rect(ctx, '#2e6b4f', W * 0.1, H * 0.12, W * 0.8, H * 0.22);
      rect(ctx, '#c8b08a', 0, groundY - H * 0.25, W, H * 0.25);
      for (let i = 0; i < 6; i++) rect(ctx, '#3f77c9', W * 0.05 + i * W * 0.15, groundY - H * 0.2, W * 0.1, H * 0.16);
      rect(ctx, '#b58b5a', 0, groundY, W, H - groundY);
      break;

    case 'office':
      rect(ctx, '#e8edf2', 0, 0, W, groundY);
      rect(ctx, '#bfe3f7', W * 0.08, H * 0.1, W * 0.35, H * 0.3);
      rect(ctx, '#7d8794', W * 0.55, groundY - H * 0.16, W * 0.38, 8);
      rect(ctx, '#7d8794', W * 0.6, groundY - H * 0.08, 8, H * 0.08);
      rect(ctx, '#7d8794', W * 0.88, groundY - H * 0.08, 8, H * 0.08);
      circle(ctx, '#3f9a5c', W * 0.6, groundY - H * 0.2, Math.min(W, H) * 0.03);
      rect(ctx, '#c0c8d0', 0, groundY, W, H - groundY);
      break;

    case 'forest':
      rect(ctx, '#cfeccc', 0, 0, W, groundY);
      rect(ctx, '#3c7a3a', 0, groundY, W, H - groundY);
      for (let i = 0; i < 9; i++) {
        const x = (i / 8) * W;
        const th = H * (0.25 + rnd() * 0.15);
        poly(ctx, '#2f6b33', [[x - W * 0.07, groundY], [x, groundY - th], [x + W * 0.07, groundY]]);
        rect(ctx, '#6b4a2b', x - 4, groundY - 10, 8, 12);
      }
      break;

    case 'desert':
      rect(ctx, '#ffd9a0', 0, 0, W, groundY);
      circle(ctx, '#ffb347', W * 0.75, H * 0.16, Math.min(W, H) * 0.07);
      poly(ctx, '#e9b26b', [[0, groundY], [W * 0.3, groundY - H * 0.12], [W * 0.6, groundY], [0, groundY]]);
      poly(ctx, '#d89a52', [[W * 0.4, groundY], [W * 0.8, groundY - H * 0.1], [W, groundY]]);
      rect(ctx, '#e0a96a', 0, groundY, W, H - groundY);
      rect(ctx, '#3c8a4a', W * 0.12, groundY - H * 0.12, 10, H * 0.12);
      rect(ctx, '#3c8a4a', W * 0.1, groundY - H * 0.07, 8, 6);
      break;

    case 'battlefield':
      rect(ctx, '#5a5150', 0, 0, W, groundY);
      for (let i = 0; i < 5; i++) circle(ctx, 'rgba(120,110,100,0.5)', W * (0.1 + 0.2 * i), H * 0.2 + ((t * 8 + i * 30) % 40), Math.min(W, H) * 0.08);
      rect(ctx, '#3b2f2a', 0, groundY, W, H - groundY);
      for (let i = 0; i < 6; i++) {
        const x = W * (0.08 + rnd() * 0.84);
        ctx.strokeStyle = '#8a7a6a';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(x, groundY);
        ctx.lineTo(x + 20, groundY - H * 0.12);
        ctx.stroke();
      }
      break;

    case 'horror':
      rect(ctx, '#1a0f1f', 0, 0, W, H);
      circle(ctx, '#e9e4c8', W * 0.5, H * 0.18, Math.min(W, H) * 0.06);
      for (let i = 0; i < 4; i++) {
        const x = W * (0.1 + i * 0.27);
        rect(ctx, '#0a0410', x - 3, groundY - H * 0.3, 6, H * 0.3);
        ctx.strokeStyle = '#0a0410';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, groundY - H * 0.22);
        ctx.lineTo(x - 22, groundY - H * 0.3);
        ctx.moveTo(x, groundY - H * 0.18);
        ctx.lineTo(x + 20, groundY - H * 0.26);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(180,170,200,0.12)';
      ctx.fillRect(0, groundY - H * 0.06 + Math.sin(t) * 6, W, H * 0.08);
      rect(ctx, '#2a2030', 0, groundY, W, H - groundY);
      break;

    case 'landscape':
      rect(ctx, '#8fd3ff', 0, 0, W, groundY);
      circle(ctx, '#fff3a0', W * 0.2, H * 0.15, Math.min(W, H) * 0.05);
      poly(ctx, '#5c9e5c', [[0, groundY], [W * 0.35, groundY - H * 0.2], [W * 0.7, groundY]]);
      poly(ctx, '#4a8a4a', [[W * 0.4, groundY], [W * 0.8, groundY - H * 0.16], [W, groundY]]);
      rect(ctx, '#6fb85a', 0, groundY, W, H - groundY);
      break;

    default:
      rect(ctx, '#ffffff', 0, 0, W, H);
  }
}

/** Overlay tint for day/night effects. */
export function drawTint(ctx, W, H, color) {
  rect(ctx, color, 0, 0, W, H);
}
