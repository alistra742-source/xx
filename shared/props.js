// Cartoon props drawn with plain canvas calls. Each prop is drawn in a 200x200
// box, placed at (x, y) and scaled by `scale`. Ink is dark; fills are flat colours.

const INK = '#1a1a1a';

function shape(ctx, fill, draw, line = 6) {
  ctx.beginPath();
  draw();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = line;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

function door(ctx) {
  shape(ctx, '#8b5a2b', () => ctx.rect(40, 20, 120, 170));
  shape(ctx, '#c08457', () => ctx.rect(60, 40, 80, 140), 4);
  shape(ctx, '#a16207', () => ctx.rect(75, 58, 50, 50), 4);
  shape(ctx, '#a16207', () => ctx.rect(75, 122, 50, 48), 4);
  shape(ctx, '#fde047', () => ctx.arc(125, 110, 7, 0, Math.PI * 2), 3);
  shape(ctx, '#9ca3af', () => ctx.rect(25, 190, 150, 10), 4);
}

function shop(ctx) {
  shape(ctx, '#fdba74', () => ctx.rect(25, 95, 150, 95));
  for (let i = 0; i < 5; i++) {
    const x = 20 + i * 32;
    shape(ctx, i % 2 ? '#ffffff' : '#dc2626', () => {
      ctx.moveTo(x, 70); ctx.lineTo(x + 32, 70); ctx.lineTo(x + 16, 98); ctx.closePath();
    }, 4);
  }
  shape(ctx, '#dc2626', () => ctx.rect(20, 52, 160, 18), 4);
  shape(ctx, '#bae6fd', () => ctx.rect(40, 120, 38, 36), 4);
  shape(ctx, '#bae6fd', () => ctx.rect(122, 120, 38, 36), 4);
  shape(ctx, '#78350f', () => ctx.rect(88, 130, 24, 60), 5);
}

export const PROPS = { door, shop };

/** Draw a named prop at (x, y) in canvas pixels, scaled. Unknown names draw nothing. */
export function drawCartoonProp(ctx, name, x, y, scale = 1) {
  const draw = PROPS[name];
  if (!draw) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  draw(ctx);
  ctx.restore();
}
