import { Rng, seedFromString } from '../core/rng';
import { drawEmblem } from './emblems';
import { alpha, mix, roundRect, shade } from './palette';
import type { WorldDef } from '../sim/types';

/**
 * Procedural world backdrops.
 *
 * Each world paints a static layer (sky + skyline + ground) into an offscreen
 * canvas once, then the live layer (weather, signal beams, drifting motes) is
 * drawn per frame on top. Repainting the skyline every frame is what kills
 * canvas games on mobile; this keeps it to one blit.
 */

const cache = new Map<string, HTMLCanvasElement>();

export function backdropLayer(world: WorldDef, w: number, h: number): HTMLCanvasElement {
  const key = `${world.id}:${w}x${h}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d')!;
  const rng = new Rng(seedFromString(world.id));

  paintSky(c, world, w, h);
  switch (world.backdrop) {
    case 'gotham':
      paintGotham(c, world, w, h, rng);
      break;
    case 'metropolis':
      paintMetropolis(c, world, w, h, rng);
      break;
    case 'lanternCoast':
      paintEmeraldReach(c, world, w, h, rng);
      break;
    case 'gamma':
      paintGammaFlats(c, world, w, h, rng);
      break;
  }

  // Keep the cache small — worlds are few and sizes change on resize only.
  // Evict the oldest entry rather than clearing: a full clear forces every
  // skyline to be repainted procedurally at an unpredictable moment.
  while (cache.size >= 12) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  cache.set(key, canvas);
  return canvas;
}

/**
 * An x somewhere down the left or right edge of the view.
 *
 * The board covers the middle of the screen in landscape (x 190..1162 of 1280),
 * so a landmark painted at the centre of the backdrop is a landmark nobody ever
 * sees. Anything with a silhouette worth looking at goes out here instead.
 */
function edgeX(rng: Rng, w: number): number {
  return rng.chance(0.5) ? rng.range(w * 0.01, w * 0.14) : rng.range(w * 0.86, w * 0.99);
}

function paintSky(c: CanvasRenderingContext2D, world: WorldDef, w: number, h: number): void {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, world.palette.sky[0]);
  g.addColorStop(1, world.palette.sky[1]);
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
}

/* ------------------------------------------------------------------ *
 * The Grim City — rain-slicked rooftops under a searchlight
 * ------------------------------------------------------------------ */

function paintGotham(
  c: CanvasRenderingContext2D,
  world: WorldDef,
  w: number,
  h: number,
  rng: Rng,
): void {
  const horizon = h * 0.46;

  // Moon behind the haze.
  const moonX = w * 0.78;
  const moonY = h * 0.14;
  const mg = c.createRadialGradient(moonX, moonY, 4, moonX, moonY, h * 0.3);
  mg.addColorStop(0, 'rgba(220,232,255,0.85)');
  mg.addColorStop(0.15, 'rgba(180,200,255,0.28)');
  mg.addColorStop(1, 'rgba(120,150,220,0)');
  c.fillStyle = mg;
  c.fillRect(0, 0, w, h * 0.6);
  c.fillStyle = '#e8f0ff';
  c.beginPath();
  c.arc(moonX, moonY, h * 0.045, 0, Math.PI * 2);
  c.fill();
  // Craters, so the moon reads as more than a white dot.
  for (let i = 0; i < 5; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(0, h * 0.032);
    c.fillStyle = 'rgba(186,200,232,0.55)';
    c.beginPath();
    c.arc(moonX + Math.cos(a) * d, moonY + Math.sin(a) * d, rng.range(2, 6), 0, Math.PI * 2);
    c.fill();
  }

  // Torn cloud bands drifting across the moon.
  for (let i = 0; i < 7; i++) {
    const cy = rng.range(h * 0.03, h * 0.4);
    const cw = rng.range(w * 0.22, w * 0.6);
    const cx = rng.range(-w * 0.1, w);
    c.fillStyle = alpha('#1d2a4a', rng.range(0.25, 0.55));
    c.beginPath();
    c.moveTo(cx, cy);
    let px = cx;
    for (let s = 0; s < 5; s++) {
      const nx = px + cw / 5;
      c.quadraticCurveTo((px + nx) / 2, cy - rng.range(4, 16), nx, cy);
      px = nx;
    }
    c.lineTo(px, cy + rng.range(6, 14));
    c.lineTo(cx, cy + rng.range(6, 14));
    c.closePath();
    c.fill();
  }

  // The signal: a cone of light thrown against the clouds.
  c.save();
  c.globalCompositeOperation = 'lighter';
  const sig = c.createLinearGradient(w * 0.2, h, w * 0.34, 0);
  sig.addColorStop(0, 'rgba(200,220,255,0)');
  sig.addColorStop(0.55, 'rgba(180,205,255,0.13)');
  sig.addColorStop(1, 'rgba(210,230,255,0.03)');
  c.fillStyle = sig;
  c.beginPath();
  c.moveTo(w * 0.16, h * 0.52);
  c.lineTo(w * 0.22, h * 0.52);
  c.lineTo(w * 0.46, -h * 0.05);
  c.lineTo(w * 0.2, -h * 0.05);
  c.closePath();
  c.fill();
  // The emblem burned into the cloud: a lit disc with the glyph knocked out.
  c.globalAlpha = 0.2;
  c.fillStyle = '#dce8ff';
  c.beginPath();
  c.ellipse(w * 0.33, h * 0.1, h * 0.078, h * 0.078, 0, 0, Math.PI * 2);
  c.fill();
  c.globalCompositeOperation = 'destination-out';
  c.globalAlpha = 1;
  drawEmblem(c, 'bat', w * 0.33, h * 0.1, h * 0.05, '#000000');
  c.restore();

  // Three parallax bands of towers, far to near.
  const bands = [
    { y: horizon, scale: 0.55, color: mix(world.palette.sky[1], '#0a0e1e', 0.55), lit: 0.25, near: false },
    { y: horizon + h * 0.06, scale: 0.78, color: mix(world.palette.sky[1], '#070a16', 0.75), lit: 0.5, near: false },
    { y: horizon + h * 0.14, scale: 1, color: '#05070f', lit: 0.8, near: true },
  ];

  for (const band of bands) {
    let x = -20;
    while (x < w + 40) {
      const bw = rng.range(28, 74) * band.scale + 18;
      const bh = rng.range(h * 0.1, h * 0.34) * band.scale;
      const top = band.y - bh;
      c.fillStyle = band.color;
      c.fillRect(x, top, bw, h - top);

      // Art-deco crown on the taller towers.
      if (bh > h * 0.22 && rng.chance(0.5)) {
        c.beginPath();
        c.moveTo(x + bw * 0.5, top - bh * 0.16);
        c.lineTo(x + bw, top);
        c.lineTo(x, top);
        c.closePath();
        c.fill();
        c.fillRect(x + bw * 0.46, top - bh * 0.28, bw * 0.08, bh * 0.14);
      }

      // Windows.
      const cols = Math.max(1, Math.floor(bw / 11));
      const rows = Math.max(1, Math.floor(bh / 15));
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          if (!rng.chance(0.3 * band.lit)) continue;
          c.fillStyle = rng.chance(0.15) ? 'rgba(255,214,130,0.75)' : 'rgba(150,180,240,0.34)';
          c.fillRect(x + 5 + i * 11, top + 8 + j * 15, 4.5, 6.5);
        }
      }

      // Rooftop clutter on the near band: water towers, masts, vents. This is
      // the row the eye actually lands on, so it carries the detail.
      if (band.near && bw > 34) {
        if (rng.chance(0.42)) waterTower(c, x + bw * rng.range(0.25, 0.7), top, rng.range(9, 15));
        if (rng.chance(0.5)) {
          const mx = x + bw * rng.range(0.1, 0.9);
          const mh = rng.range(h * 0.05, h * 0.13);
          c.strokeStyle = '#05070f';
          c.lineWidth = 2;
          c.beginPath();
          c.moveTo(mx, top);
          c.lineTo(mx, top - mh);
          c.stroke();
          // Aircraft warning light.
          c.fillStyle = 'rgba(255,90,80,0.85)';
          c.beginPath();
          c.arc(mx, top - mh, 2.2, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = 'rgba(255,90,80,0.2)';
          c.beginPath();
          c.arc(mx, top - mh, 6, 0, Math.PI * 2);
          c.fill();
        }
        if (rng.chance(0.55)) {
          const vx = x + bw * rng.range(0.05, 0.85);
          c.fillStyle = '#0a0e1c';
          c.fillRect(vx, top - 6, rng.range(7, 14), 6);
        }
      }
      x += bw + rng.range(3, 14);
    }
  }

  // Steam venting from the near rooftops, lit from below.
  for (let i = 0; i < 5; i++) {
    const vx = edgeX(rng, w);
    const vy = horizon + h * rng.range(0.1, 0.15);
    const g = c.createRadialGradient(vx, vy, 2, vx, vy, h * 0.09);
    g.addColorStop(0, 'rgba(190,210,255,0.16)');
    g.addColorStop(1, 'rgba(190,210,255,0)');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(vx, vy - h * 0.03, h * 0.035, h * 0.07, 0, 0, Math.PI * 2);
    c.fill();
  }

  // Rooftop the lawn sits on, with a parapet.
  const roof = horizon + h * 0.2;
  paintGround(c, world, w, h, roof);
  c.fillStyle = '#0b0e1a';
  c.fillRect(0, roof - 10, w, 12);
  c.fillStyle = 'rgba(140,165,225,0.18)';
  c.fillRect(0, roof - 10, w, 2);
  // Coping stones along the parapet.
  c.fillStyle = 'rgba(0,0,0,0.35)';
  for (let x = 0; x < w; x += 26) c.fillRect(x + 24, roof - 10, 2, 12);

  // Ductwork and a roof access hatch, sat behind the lawn.
  for (let i = 0; i < 4; i++) {
    const dx = rng.range(w * 0.12, w * 0.88);
    c.fillStyle = '#10141f';
    roundRect(c, dx, roof - 4, rng.range(26, 54), 9, 3);
    c.fill();
    c.fillStyle = 'rgba(150,175,235,0.1)';
    c.fillRect(dx + 2, roof - 3, 6, 2);
  }
  c.fillStyle = '#0d111c';
  roundRect(c, w * 0.44, roof - 16, 40, 17, 3);
  c.fill();
  c.fillStyle = 'rgba(255,200,120,0.16)';
  c.fillRect(w * 0.44 + 5, roof - 12, 30, 3);

  // A pair of gargoyles watching the lawn.
  gargoyle(c, w * 0.06, roof - 8, h * 0.075);
  gargoyle(c, w * 0.955, roof - 8, h * 0.075, true);
}

/** A rooftop water tower — the single most Gotham silhouette there is. */
function waterTower(c: CanvasRenderingContext2D, x: number, roofY: number, s: number): void {
  const legs = s * 0.5;
  c.strokeStyle = '#05070f';
  c.lineWidth = 1.6;
  c.beginPath();
  c.moveTo(x - s * 0.5, roofY);
  c.lineTo(x - s * 0.32, roofY - legs);
  c.moveTo(x + s * 0.5, roofY);
  c.lineTo(x + s * 0.32, roofY - legs);
  c.stroke();
  c.fillStyle = '#080b16';
  c.fillRect(x - s * 0.42, roofY - legs - s * 0.95, s * 0.84, s * 0.95);
  c.beginPath();
  c.moveTo(x - s * 0.48, roofY - legs - s * 0.95);
  c.lineTo(x, roofY - legs - s * 1.4);
  c.lineTo(x + s * 0.48, roofY - legs - s * 0.95);
  c.closePath();
  c.fill();
  // Banding catching the moon.
  c.strokeStyle = 'rgba(150,175,235,0.16)';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(x - s * 0.42, roofY - legs - s * 0.6);
  c.lineTo(x + s * 0.42, roofY - legs - s * 0.6);
  c.stroke();
}

function gargoyle(
  c: CanvasRenderingContext2D,
  x: number,
  yBase: number,
  s: number,
  flip = false,
): void {
  c.save();
  c.translate(x, yBase);
  if (flip) c.scale(-1, 1);
  c.fillStyle = '#0d1120';
  roundRect(c, -s * 0.5, -s * 0.35, s, s * 0.35, s * 0.08);
  c.fill();
  // Hunched body
  c.beginPath();
  c.moveTo(-s * 0.36, -s * 0.35);
  c.quadraticCurveTo(-s * 0.2, -s * 1.15, s * 0.14, -s * 1.1);
  c.quadraticCurveTo(s * 0.42, -s * 1.05, s * 0.34, -s * 0.35);
  c.closePath();
  c.fill();
  // Wing
  c.beginPath();
  c.moveTo(s * 0.05, -s * 1.0);
  c.quadraticCurveTo(s * 0.75, -s * 1.5, s * 0.62, -s * 0.4);
  c.quadraticCurveTo(s * 0.36, -s * 0.72, s * 0.05, -s * 1.0);
  c.closePath();
  c.fill();
  // Head
  c.beginPath();
  c.arc(-s * 0.08, -s * 1.16, s * 0.19, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = 'rgba(190,210,255,0.25)';
  c.fillRect(-s * 0.2, -s * 1.2, s * 0.1, s * 0.05);
  c.restore();
}

/* ------------------------------------------------------------------ *
 * The Bright City — civic plaza at noon
 * ------------------------------------------------------------------ */

function paintMetropolis(
  c: CanvasRenderingContext2D,
  world: WorldDef,
  w: number,
  h: number,
  rng: Rng,
): void {
  const horizon = h * 0.5;

  // Sun and a soft bloom.
  const sx = w * 0.16;
  const sy = h * 0.13;
  const sg = c.createRadialGradient(sx, sy, 4, sx, sy, h * 0.42);
  sg.addColorStop(0, 'rgba(255,255,235,0.95)');
  sg.addColorStop(0.12, 'rgba(255,240,180,0.5)');
  sg.addColorStop(1, 'rgba(255,230,160,0)');
  c.fillStyle = sg;
  c.fillRect(0, 0, w, h * 0.7);

  // Clouds.
  for (let i = 0; i < 9; i++) {
    const cx = rng.range(0, w);
    const cy = rng.range(h * 0.05, h * 0.34);
    const cw = rng.range(w * 0.07, w * 0.2);
    c.fillStyle = `rgba(255,255,255,${rng.range(0.35, 0.75).toFixed(2)})`;
    for (let p = 0; p < 5; p++) {
      const px = cx + rng.range(-cw * 0.5, cw * 0.5);
      const py = cy + rng.range(-8, 8);
      c.beginPath();
      c.ellipse(px, py, rng.range(cw * 0.2, cw * 0.4), rng.range(8, 20), 0, 0, Math.PI * 2);
      c.fill();
    }
  }

  // Gleaming towers — brighter, glassier, taller than the Grim City.
  const bands = [
    { y: horizon, scale: 0.6, tint: 0.55 },
    { y: horizon + h * 0.05, scale: 0.85, tint: 0.3 },
    { y: horizon + h * 0.12, scale: 1.05, tint: 0.12 },
  ];
  for (const band of bands) {
    let x = -20;
    while (x < w + 40) {
      const bw = rng.range(34, 82) * band.scale;
      const bh = rng.range(h * 0.14, h * 0.4) * band.scale;
      const top = band.y - bh;
      const base = mix('#9fc4e8', '#4c7fb5', 1 - band.tint);
      const g = c.createLinearGradient(x, top, x + bw, top);
      g.addColorStop(0, shade(base, 0.18));
      g.addColorStop(0.45, base);
      g.addColorStop(1, shade(base, -0.22));
      c.fillStyle = g;
      c.fillRect(x, top, bw, h - top);

      // Glass banding.
      c.fillStyle = alpha('#ffffff', 0.18);
      for (let j = 0; j < Math.floor(bh / 14); j++) {
        c.fillRect(x + 3, top + 10 + j * 14, bw - 6, 2.5);
      }
      // A spire on the odd tower.
      if (rng.chance(0.25)) {
        c.fillStyle = shade(base, 0.3);
        c.fillRect(x + bw * 0.47, top - bh * 0.22, bw * 0.06, bh * 0.22);
        c.beginPath();
        c.arc(x + bw * 0.5, top - bh * 0.24, bw * 0.05, 0, Math.PI * 2);
        c.fill();
      }
      // A globe on one landmark tower, and sunlight catching the glass.
      if (band.scale > 1 && rng.chance(0.18)) {
        c.fillStyle = shade(base, 0.35);
        c.fillRect(x + bw * 0.46, top - bh * 0.3, bw * 0.08, bh * 0.3);
        c.fillStyle = '#e8c86a';
        c.beginPath();
        c.arc(x + bw * 0.5, top - bh * 0.34, bw * 0.13, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = alpha('#ffffff', 0.5);
        c.lineWidth = 1;
        c.beginPath();
        c.ellipse(x + bw * 0.5, top - bh * 0.34, bw * 0.13, bw * 0.05, 0, 0, Math.PI * 2);
        c.stroke();
      }
      c.fillStyle = alpha('#ffffff', 0.22);
      c.beginPath();
      c.moveTo(x + bw * 0.12, top);
      c.lineTo(x + bw * 0.34, top);
      c.lineTo(x + bw * 0.16, h);
      c.lineTo(x, h);
      c.closePath();
      c.fill();
      x += bw + rng.range(4, 16);
    }
  }

  // An elevated rail crossing the mid distance.
  const railY = horizon + h * 0.045;
  c.fillStyle = 'rgba(120,150,180,0.55)';
  c.fillRect(0, railY, w, 5);
  c.fillStyle = 'rgba(90,120,150,0.5)';
  for (let x = 10; x < w; x += 58) c.fillRect(x, railY + 5, 5, h * 0.05);
  c.fillStyle = '#dfe8f0';
  const trainX = w * 0.02;
  roundRect(c, trainX, railY - 11, w * 0.16, 12, 5);
  c.fill();
  c.fillStyle = 'rgba(70,130,190,0.75)';
  for (let i = 0; i < 5; i++) c.fillRect(trainX + 8 + i * (w * 0.028), railY - 8, w * 0.018, 5);

  // A caped figure crossing the sky, with a contrail. Sold as a silhouette —
  // the whole point of the Bright City is that somebody up there is flying.
  const fx = w * 0.63;
  const fy = h * 0.2;
  c.strokeStyle = 'rgba(255,255,255,0.4)';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(fx - w * 0.2, fy + h * 0.05);
  c.quadraticCurveTo(fx - w * 0.1, fy + h * 0.02, fx - 6, fy);
  c.stroke();
  c.fillStyle = 'rgba(30,55,95,0.9)';
  c.beginPath();
  c.ellipse(fx, fy, 9, 3.4, -0.25, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.moveTo(fx - 4, fy - 1);
  c.lineTo(fx - 16, fy - 9);
  c.lineTo(fx - 13, fy + 4);
  c.closePath();
  c.fill();

  // Birds, far off.
  for (let i = 0; i < 8; i++) {
    const bx2 = rng.range(w * 0.1, w * 0.95);
    const by2 = rng.range(h * 0.08, h * 0.32);
    const bs = rng.range(3, 6);
    c.strokeStyle = 'rgba(60,80,110,0.35)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(bx2 - bs, by2);
    c.quadraticCurveTo(bx2 - bs * 0.4, by2 - bs * 0.6, bx2, by2);
    c.quadraticCurveTo(bx2 + bs * 0.4, by2 - bs * 0.6, bx2 + bs, by2);
    c.stroke();
  }

  const ground = horizon + h * 0.18;
  paintGround(c, world, w, h, ground);

  // Plaza kerb.
  c.fillStyle = '#cfd8dc';
  c.fillRect(0, ground - 8, w, 9);
  c.fillStyle = 'rgba(0,0,0,0.12)';
  c.fillRect(0, ground + 1, w, 3);

  // Street furniture along the kerb: planters, lamp posts and civic banners.
  for (let i = 0; i < 5; i++) {
    const px = edgeX(rng, w);
    c.fillStyle = '#b9c6cc';
    roundRect(c, px, ground - 20, 26, 13, 3);
    c.fill();
    c.fillStyle = '#4e9b52';
    for (let b = 0; b < 5; b++) {
      c.beginPath();
      c.arc(px + 4 + b * 5, ground - 22, rng.range(3, 6), 0, Math.PI * 2);
      c.fill();
    }
  }
  for (let i = 0; i < 4; i++) {
    const lx = edgeX(rng, w);
    const lh = h * 0.09;
    c.fillStyle = '#8fa2ac';
    c.fillRect(lx, ground - 8 - lh, 3, lh);
    c.fillStyle = 'rgba(255,240,190,0.8)';
    c.beginPath();
    c.ellipse(lx + 1.5, ground - 9 - lh, 6, 3.5, 0, 0, Math.PI * 2);
    c.fill();
    // Banner hanging off the post.
    c.fillStyle = i % 2 === 0 ? 'rgba(200,60,60,0.75)' : 'rgba(50,110,190,0.75)';
    c.fillRect(lx + 3, ground - 6 - lh * 0.7, 12, lh * 0.42);
  }
}

/* ------------------------------------------------------------------ *
 * Emerald Reach — the Corps citadel, deep space
 * ------------------------------------------------------------------ */

function paintEmeraldReach(
  c: CanvasRenderingContext2D,
  world: WorldDef,
  w: number,
  h: number,
  rng: Rng,
): void {
  const horizon = h * 0.5;

  // Starfield.
  for (let i = 0; i < 240; i++) {
    const x = rng.range(0, w);
    const y = rng.range(0, horizon + h * 0.1);
    const r = rng.range(0.4, 1.7);
    c.fillStyle = `rgba(${rng.chance(0.2) ? '180,255,210' : '255,255,255'},${rng
      .range(0.25, 0.95)
      .toFixed(2)})`;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }

  // Shooting stars, frozen mid-streak.
  for (let i = 0; i < 5; i++) {
    const x = rng.range(w * 0.05, w * 0.95);
    const y = rng.range(h * 0.02, h * 0.34);
    const len = rng.range(20, 70);
    const g = c.createLinearGradient(x, y, x - len, y + len * 0.4);
    g.addColorStop(0, 'rgba(220,255,235,0.85)');
    g.addColorStop(1, 'rgba(220,255,235,0)');
    c.strokeStyle = g;
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x - len, y + len * 0.4);
    c.stroke();
  }

  // A green nebula.
  for (let i = 0; i < 4; i++) {
    const cx = rng.range(w * 0.1, w * 0.9);
    const cy = rng.range(h * 0.05, h * 0.32);
    const r = rng.range(h * 0.12, h * 0.34);
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(70,255,150,0.16)');
    g.addColorStop(0.5, 'rgba(30,180,120,0.08)');
    g.addColorStop(1, 'rgba(10,60,40,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fill();
  }

  // A ringed world hanging off to one side, terminator facing the citadel.
  // Sized off the short edge and pushed clear of the left rim, so the rings
  // still fit on screen when the view is a tall phone rather than a monitor.
  const pr = Math.min(w, h) * 0.1;
  const px = Math.max(pr * 2.15, w * 0.2);
  const py = Math.max(h * 0.14, pr * 1.3);
  const pg = c.createRadialGradient(px + pr * 0.4, py - pr * 0.3, pr * 0.1, px, py, pr);
  pg.addColorStop(0, '#7fd6a8');
  pg.addColorStop(0.55, '#2f7d5c');
  pg.addColorStop(1, '#0a2a20');
  c.fillStyle = pg;
  c.beginPath();
  c.arc(px, py, pr, 0, Math.PI * 2);
  c.fill();
  // Cloud belts.
  c.save();
  c.beginPath();
  c.arc(px, py, pr, 0, Math.PI * 2);
  c.clip();
  for (let i = 0; i < 4; i++) {
    c.fillStyle = alpha('#bdf5d6', rng.range(0.06, 0.16));
    c.beginPath();
    c.ellipse(px, py - pr * 0.6 + i * pr * 0.42, pr * 1.2, rng.range(3, 8), 0, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
  c.strokeStyle = 'rgba(150,255,200,0.45)';
  c.lineWidth = 3;
  c.beginPath();
  c.ellipse(px, py, pr * 1.75, pr * 0.4, -0.32, 0, Math.PI * 2);
  c.stroke();
  c.strokeStyle = 'rgba(150,255,200,0.2)';
  c.lineWidth = 7;
  c.beginPath();
  c.ellipse(px, py, pr * 2.05, pr * 0.47, -0.32, 0, Math.PI * 2);
  c.stroke();

  // The central citadel: a lantern-shaped tower with a burning core.
  const cx = w * 0.5;
  const base = horizon + h * 0.04;
  c.fillStyle = '#082b1d';
  c.beginPath();
  c.moveTo(cx - w * 0.075, base);
  c.lineTo(cx - w * 0.045, base - h * 0.34);
  c.lineTo(cx + w * 0.045, base - h * 0.34);
  c.lineTo(cx + w * 0.075, base);
  c.closePath();
  c.fill();
  c.fillStyle = '#0d4630';
  roundRect(c, cx - w * 0.058, base - h * 0.44, w * 0.116, h * 0.12, h * 0.03);
  c.fill();
  const core = c.createRadialGradient(cx, base - h * 0.38, 2, cx, base - h * 0.38, h * 0.14);
  core.addColorStop(0, 'rgba(190,255,215,0.95)');
  core.addColorStop(0.3, 'rgba(77,255,135,0.6)');
  core.addColorStop(1, 'rgba(77,255,135,0)');
  c.fillStyle = core;
  c.beginPath();
  c.arc(cx, base - h * 0.38, h * 0.14, 0, Math.PI * 2);
  c.fill();

  // Outlying spires.
  for (let i = 0; i < 14; i++) {
    const x = rng.range(0, w);
    const sh = rng.range(h * 0.05, h * 0.2);
    const sw = rng.range(8, 26);
    c.fillStyle = alpha('#0a3a28', rng.range(0.5, 0.95));
    c.beginPath();
    c.moveTo(x, base);
    c.lineTo(x + sw * 0.5, base - sh);
    c.lineTo(x + sw, base);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(120,255,180,0.5)';
    c.beginPath();
    c.arc(x + sw * 0.5, base - sh, 1.8, 0, Math.PI * 2);
    c.fill();
  }

  // A ring of orbiting light around the citadel core.
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.strokeStyle = 'rgba(120,255,180,0.28)';
  c.lineWidth = 2;
  for (const tilt of [0.34, -0.2]) {
    c.beginPath();
    c.ellipse(cx, base - h * 0.38, w * 0.14, h * 0.035, tilt, 0, Math.PI * 2);
    c.stroke();
  }
  c.restore();

  // Corps flyers holding station, each trailing a light.
  for (let i = 0; i < 7; i++) {
    const fx = rng.range(w * 0.08, w * 0.92);
    const fy = rng.range(h * 0.14, horizon - h * 0.02);
    const g = c.createRadialGradient(fx, fy, 0, fx, fy, 9);
    g.addColorStop(0, 'rgba(200,255,220,0.9)');
    g.addColorStop(1, 'rgba(77,255,135,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(fx, fy, 9, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(120,255,180,0.22)';
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(fx, fy);
    c.quadraticCurveTo(fx - 18, fy + rng.range(-10, 10), fx - rng.range(30, 70), fy + rng.range(-6, 14));
    c.stroke();
  }

  // Floating plates drifting in front of the skyline.
  for (let i = 0; i < 5; i++) {
    const fx = edgeX(rng, w) - 40;
    const fy = rng.range(horizon - h * 0.14, horizon + h * 0.04);
    const fw = rng.range(30, 90);
    c.fillStyle = alpha('#0d4630', 0.85);
    c.beginPath();
    c.moveTo(fx, fy);
    c.lineTo(fx + fw, fy);
    c.lineTo(fx + fw * 0.78, fy + 9);
    c.lineTo(fx + fw * 0.2, fy + 9);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(120,255,180,0.4)';
    c.fillRect(fx + 4, fy - 1.5, fw - 8, 1.5);
  }

  const plat = horizon + h * 0.18;
  paintGround(c, world, w, h, plat);

  // Energy conduits running along the platform edge.
  c.strokeStyle = 'rgba(120,255,180,0.5)';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(0, plat - 4);
  c.lineTo(w, plat - 4);
  c.stroke();

  // Lantern posts marking the platform, each with a bloom.
  for (let i = 0; i < 6; i++) {
    const lx = (i + 0.5) * (w / 6) + rng.range(-14, 14);
    const lh = h * 0.075;
    c.fillStyle = '#0a3a28';
    c.fillRect(lx, plat - 6 - lh, 4, lh);
    const g = c.createRadialGradient(lx + 2, plat - 8 - lh, 0, lx + 2, plat - 8 - lh, 16);
    g.addColorStop(0, 'rgba(200,255,220,0.85)');
    g.addColorStop(1, 'rgba(77,255,135,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(lx + 2, plat - 8 - lh, 16, 0, Math.PI * 2);
    c.fill();
  }
}

/* ------------------------------------------------------------------ *
 * Gamma Flats — irradiated desert at dusk
 * ------------------------------------------------------------------ */

function paintGammaFlats(
  c: CanvasRenderingContext2D,
  world: WorldDef,
  w: number,
  h: number,
  rng: Rng,
): void {
  const horizon = h * 0.5;

  const sx = w * 0.68;
  const sy = h * 0.34;
  const sg = c.createRadialGradient(sx, sy, 4, sx, sy, h * 0.36);
  sg.addColorStop(0, 'rgba(255,220,150,0.9)');
  sg.addColorStop(0.25, 'rgba(255,140,90,0.35)');
  sg.addColorStop(1, 'rgba(180,70,60,0)');
  c.fillStyle = sg;
  c.fillRect(0, 0, w, h * 0.7);

  // Mesas.
  for (let band = 0; band < 3; band++) {
    const y = horizon - h * 0.02 + band * h * 0.05;
    const dark = 0.25 + band * 0.25;
    let x = -30;
    while (x < w + 40) {
      const mw = rng.range(90, 260);
      const mh = rng.range(h * 0.05, h * 0.18) * (1 - band * 0.15);
      c.fillStyle = mix('#8a5b3b', '#2a1a18', dark);
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + mw * 0.12, y - mh);
      c.lineTo(x + mw * 0.88, y - mh);
      c.lineTo(x + mw, y);
      c.closePath();
      c.fill();
      x += mw + rng.range(-30, 40);
    }
  }

  // Dust haze pooling along the base of the mesas, so the bands separate.
  const haze = c.createLinearGradient(0, horizon - h * 0.06, 0, horizon + h * 0.12);
  haze.addColorStop(0, 'rgba(255,180,120,0)');
  haze.addColorStop(0.6, 'rgba(255,175,120,0.18)');
  haze.addColorStop(1, 'rgba(230,150,110,0)');
  c.fillStyle = haze;
  c.fillRect(0, horizon - h * 0.06, w, h * 0.18);

  // A gamma storm on the horizon: a green cloud with a fork of lightning.
  const stx = w * 0.07;
  const sty = horizon - h * 0.12;
  const sg2 = c.createRadialGradient(stx, sty, 2, stx, sty, h * 0.16);
  sg2.addColorStop(0, 'rgba(150,255,110,0.22)');
  sg2.addColorStop(1, 'rgba(150,255,110,0)');
  c.fillStyle = sg2;
  c.beginPath();
  c.ellipse(stx, sty, h * 0.18, h * 0.08, 0, 0, Math.PI * 2);
  c.fill();
  const fork = new Path2D();
  fork.moveTo(stx, sty);
  let lx2 = stx;
  let ly2 = sty;
  for (let s = 0; s < 4; s++) {
    lx2 += rng.range(-10, 10);
    ly2 += (horizon - sty) / 4;
    fork.lineTo(lx2, ly2);
  }
  // Halo first, then the core, so the bolt sits in the cloud rather than
  // looking like a stray line drawn over it.
  c.strokeStyle = 'rgba(150,255,110,0.22)';
  c.lineWidth = 6;
  c.stroke(fork);
  c.strokeStyle = 'rgba(214,255,190,0.75)';
  c.lineWidth = 1.6;
  c.stroke(fork);

  // Vultures wheeling high over the flats.
  for (let i = 0; i < 6; i++) {
    const bx2 = rng.range(w * 0.08, w * 0.92);
    const by2 = rng.range(h * 0.04, h * 0.26);
    const bs = rng.range(4, 9);
    c.strokeStyle = 'rgba(40,26,30,0.45)';
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(bx2 - bs, by2);
    c.quadraticCurveTo(bx2 - bs * 0.4, by2 - bs * 0.7, bx2, by2 - bs * 0.15);
    c.quadraticCurveTo(bx2 + bs * 0.4, by2 - bs * 0.7, bx2 + bs, by2);
    c.stroke();
  }

  // Thin dust streaks catching the last of the light.
  for (let i = 0; i < 6; i++) {
    const y = rng.range(h * 0.06, h * 0.4);
    c.fillStyle = alpha('#ffb27a', rng.range(0.04, 0.1));
    c.beginPath();
    c.ellipse(rng.range(0, w), y, rng.range(w * 0.12, w * 0.4), rng.range(3, 9), 0, 0, Math.PI * 2);
    c.fill();
  }

  // A wind-carved rock arch, the one landmark on the flats.
  const ax = w * 0.93;
  const ay = horizon + h * 0.06;
  const aw = w * 0.1;
  const ah = h * 0.16;
  c.fillStyle = mix('#8a5b3b', '#2a1a18', 0.6);
  c.beginPath();
  c.moveTo(ax - aw * 0.5, ay);
  c.lineTo(ax - aw * 0.5, ay - ah);
  c.quadraticCurveTo(ax, ay - ah * 1.35, ax + aw * 0.5, ay - ah);
  c.lineTo(ax + aw * 0.5, ay);
  c.lineTo(ax + aw * 0.26, ay);
  c.lineTo(ax + aw * 0.26, ay - ah * 0.55);
  c.quadraticCurveTo(ax, ay - ah * 0.95, ax - aw * 0.26, ay - ah * 0.55);
  c.lineTo(ax - aw * 0.26, ay);
  c.closePath();
  c.fill();

  // Dead trees, bleached and leaning.
  for (let i = 0; i < 5; i++) {
    deadTree(c, edgeX(rng, w), horizon + h * rng.range(0.08, 0.15), h * rng.range(0.05, 0.1), rng);
  }

  // A cracked, faintly glowing crater.
  c.fillStyle = 'rgba(150,255,110,0.10)';
  c.beginPath();
  c.ellipse(w * 0.3, horizon + h * 0.06, w * 0.16, h * 0.03, 0, 0, Math.PI * 2);
  c.fill();

  const flat = horizon + h * 0.18;
  paintGround(c, world, w, h, flat);

  // Containment fence and leaking drums along the near edge.
  c.strokeStyle = 'rgba(40,26,20,0.55)';
  c.lineWidth = 1.2;
  for (let x = 0; x < w; x += 34) {
    c.beginPath();
    c.moveTo(x, flat - 4);
    c.lineTo(x, flat - 22);
    c.stroke();
  }
  c.beginPath();
  for (const yy of [flat - 8, flat - 15, flat - 21]) {
    c.moveTo(0, yy);
    c.lineTo(w, yy);
  }
  c.stroke();
  for (let i = 0; i < 4; i++) {
    const dx = edgeX(rng, w);
    c.fillStyle = '#4d5a2f';
    roundRect(c, dx, flat - 24, 14, 22, 3);
    c.fill();
    c.fillStyle = 'rgba(150,255,110,0.35)';
    c.fillRect(dx, flat - 18, 14, 3);
    const g = c.createRadialGradient(dx + 7, flat - 3, 0, dx + 7, flat - 3, 18);
    g.addColorStop(0, 'rgba(150,255,110,0.22)');
    g.addColorStop(1, 'rgba(150,255,110,0)');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(dx + 7, flat - 2, 18, 6, 0, 0, Math.PI * 2);
    c.fill();
  }
}

/** A bleached, leaning trunk with a few broken limbs. */
function deadTree(
  c: CanvasRenderingContext2D,
  x: number,
  yBase: number,
  s: number,
  rng: Rng,
): void {
  const lean = rng.range(-0.22, 0.22);
  c.save();
  c.translate(x, yBase);
  c.rotate(lean);
  c.strokeStyle = 'rgba(38,24,20,0.85)';
  c.lineCap = 'round';
  c.lineWidth = Math.max(1.6, s * 0.09);
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(0, -s);
  c.stroke();
  c.lineWidth = Math.max(1, s * 0.055);
  for (let i = 0; i < 4; i++) {
    const y = -s * rng.range(0.4, 0.95);
    const dir = i % 2 === 0 ? 1 : -1;
    c.beginPath();
    c.moveTo(0, y);
    c.quadraticCurveTo(dir * s * 0.24, y - s * 0.1, dir * s * rng.range(0.28, 0.46), y - s * rng.range(0.12, 0.3));
    c.stroke();
  }
  c.restore();
  c.lineCap = 'butt';
}

/* ------------------------------------------------------------------ *
 * Shared ground
 * ------------------------------------------------------------------ */

function paintGround(
  c: CanvasRenderingContext2D,
  world: WorldDef,
  w: number,
  h: number,
  top: number,
): void {
  const g = c.createLinearGradient(0, top, 0, h);
  g.addColorStop(0, world.palette.ground[0]);
  g.addColorStop(1, world.palette.ground[1]);
  c.fillStyle = g;
  c.fillRect(0, top, w, h - top);
}

/* ------------------------------------------------------------------ *
 * The lawn
 * ------------------------------------------------------------------ */

const lawnCache = new Map<string, HTMLCanvasElement>();

/**
 * The playfield itself, painted once per world and size into an offscreen
 * canvas. It used to be rebuilt every frame with a fresh gradient per tile —
 * 45 gradient objects and 90 colour strings per frame — which is exactly the
 * kind of thing that melts a phone. Baking it also buys room for real ground
 * detail, since the cost is paid once.
 */
export function lawnLayer(
  world: WorldDef,
  cols: number,
  rows: number,
  cellW: number,
  cellH: number,
): HTMLCanvasElement {
  const key = `${world.id}:${cols}x${rows}:${cellW}x${cellH}`;
  const hit = lawnCache.get(key);
  if (hit) return hit;

  const w = cols * cellW;
  const h = rows * cellH;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d')!;
  const rng = new Rng(seedFromString(`lawn:${world.id}`));

  // Checker.
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const even = (r + col) % 2 === 0;
      c.fillStyle = even ? world.palette.lane[0] : world.palette.lane[1];
      c.fillRect(col * cellW, r * cellH, cellW, cellH);
    }
  }

  // One top-light gradient for the whole board rather than one per tile.
  const shade1 = c.createLinearGradient(0, 0, 0, cellH);
  shade1.addColorStop(0, alpha('#ffffff', 0.07));
  shade1.addColorStop(1, alpha('#000000', 0.12));
  for (let r = 0; r < rows; r++) {
    c.save();
    c.translate(0, r * cellH);
    c.fillStyle = shade1;
    c.fillRect(0, 0, w, cellH);
    c.restore();
  }

  // Per-world ground detail.
  switch (world.backdrop) {
    case 'gotham': {
      // Wet gravel and rooftop tar, with puddles catching the sky.
      for (let i = 0; i < w * h * 0.0016; i++) {
        const x = rng.range(0, w);
        const y = rng.range(0, h);
        c.fillStyle = alpha(rng.chance(0.5) ? '#000000' : '#8fa4d8', rng.range(0.05, 0.16));
        c.fillRect(x, y, rng.range(1, 3), rng.range(1, 2));
      }
      for (let i = 0; i < 9; i++) {
        const x = rng.range(20, w - 20);
        const y = rng.range(20, h - 20);
        const rx = rng.range(18, 46);
        const g = c.createRadialGradient(x, y, 1, x, y, rx);
        g.addColorStop(0, alpha('#9fb4ff', 0.16));
        g.addColorStop(1, alpha('#9fb4ff', 0));
        c.fillStyle = g;
        c.beginPath();
        c.ellipse(x, y, rx, rx * 0.38, rng.range(-0.3, 0.3), 0, Math.PI * 2);
        c.fill();
      }
      // Tar seams between roof sections.
      c.strokeStyle = alpha('#05070f', 0.5);
      c.lineWidth = 2;
      for (let i = 1; i < cols; i += 2) {
        c.beginPath();
        c.moveTo(i * cellW, 0);
        c.lineTo(i * cellW, h);
        c.stroke();
      }
      break;
    }
    case 'metropolis': {
      // Mown grass: tufts and stripes.
      for (let i = 0; i < w * h * 0.004; i++) {
        const x = rng.range(0, w);
        const y = rng.range(0, h);
        const len = rng.range(3, 8);
        c.strokeStyle = alpha(rng.chance(0.5) ? '#7fd07a' : '#2f6b32', rng.range(0.12, 0.3));
        c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + rng.range(-2, 2), y - len);
        c.stroke();
      }
      // Paving kerb along the top and bottom edge of the lawn.
      c.fillStyle = alpha('#cfd8dc', 0.18);
      c.fillRect(0, 0, w, 4);
      c.fillRect(0, h - 4, w, 4);
      // A few clover patches.
      for (let i = 0; i < 14; i++) {
        const x = rng.range(0, w);
        const y = rng.range(0, h);
        c.fillStyle = alpha('#a8e6a1', 0.16);
        c.beginPath();
        c.ellipse(x, y, rng.range(6, 16), rng.range(4, 9), 0, 0, Math.PI * 2);
        c.fill();
      }
      break;
    }
    case 'lanternCoast': {
      // Hex energy plating with lit seams.
      c.strokeStyle = alpha('#4dff87', 0.16);
      c.lineWidth = 1.5;
      const s = 22;
      for (let y = 0; y < h + s; y += s * 0.87) {
        for (let x = 0; x < w + s; x += s * 1.5) {
          const ox = (Math.round(y / (s * 0.87)) % 2) * s * 0.75;
          c.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const px = x + ox + Math.cos(a) * s * 0.5;
            const py = y + Math.sin(a) * s * 0.5;
            if (i === 0) c.moveTo(px, py);
            else c.lineTo(px, py);
          }
          c.closePath();
          c.stroke();
        }
      }
      // Power nodes at some intersections.
      for (let i = 0; i < 26; i++) {
        const x = rng.range(0, w);
        const y = rng.range(0, h);
        const g = c.createRadialGradient(x, y, 0, x, y, 14);
        g.addColorStop(0, alpha('#c7ffd9', 0.5));
        g.addColorStop(1, alpha('#4dff87', 0));
        c.fillStyle = g;
        c.beginPath();
        c.arc(x, y, 14, 0, Math.PI * 2);
        c.fill();
      }
      break;
    }
    case 'gamma': {
      // Cracked, irradiated hardpan.
      for (let i = 0; i < 30; i++) {
        const x = rng.range(0, w);
        const y = rng.range(0, h);
        c.strokeStyle = alpha('#2a1a12', rng.range(0.2, 0.5));
        c.lineWidth = rng.range(0.8, 2);
        c.beginPath();
        c.moveTo(x, y);
        let px = x;
        let py = y;
        for (let seg = 0; seg < 4; seg++) {
          px += rng.range(-30, 30);
          py += rng.range(-22, 22);
          c.lineTo(px, py);
        }
        c.stroke();
      }
      for (let i = 0; i < 40; i++) {
        const x = rng.range(0, w);
        const y = rng.range(0, h);
        c.fillStyle = alpha('#a8ff7a', rng.range(0.05, 0.14));
        c.beginPath();
        c.arc(x, y, rng.range(2, 7), 0, Math.PI * 2);
        c.fill();
      }
      // Pebbles.
      for (let i = 0; i < 70; i++) {
        c.fillStyle = alpha('#000000', rng.range(0.1, 0.25));
        c.beginPath();
        c.ellipse(rng.range(0, w), rng.range(0, h), rng.range(1.5, 4), rng.range(1, 2.5), 0, 0, Math.PI * 2);
        c.fill();
      }
      break;
    }
  }

  // Lane separators last so they stay crisp over the texture.
  c.strokeStyle = alpha('#000000', 0.22);
  c.lineWidth = 1;
  for (let r = 0; r <= rows; r++) {
    c.beginPath();
    c.moveTo(0, r * cellH + 0.5);
    c.lineTo(w, r * cellH + 0.5);
    c.stroke();
  }

  while (lawnCache.size >= 10) {
    const oldest = lawnCache.keys().next().value;
    if (oldest === undefined) break;
    lawnCache.delete(oldest);
  }
  lawnCache.set(key, canvas);
  return canvas;
}

/* ------------------------------------------------------------------ *
 * Live weather layer
 * ------------------------------------------------------------------ */

const drops: { x: number; y: number; v: number; len: number }[] = [];
const motes: { x: number; y: number; vx: number; vy: number; r: number }[] = [];

/**
 * Drop the weather particles so they are reseeded against the new view size.
 * They are seeded once against whatever w/h they first saw, so after a rotation
 * a good fraction of them sit outside the visible area.
 */
export function resetWeather(): void {
  drops.length = 0;
  motes.length = 0;
}

export function drawWeather(
  c: CanvasRenderingContext2D,
  world: WorldDef,
  w: number,
  h: number,
  time: number,
  dt: number,
): void {
  switch (world.weather) {
    case 'rain': {
      if (drops.length === 0) {
        for (let i = 0; i < 150; i++) {
          drops.push({
            x: Math.random() * w,
            y: Math.random() * h,
            v: 700 + Math.random() * 500,
            len: 10 + Math.random() * 18,
          });
        }
      }
      c.strokeStyle = 'rgba(175,200,255,0.32)';
      c.lineWidth = 1.2;
      c.beginPath();
      for (const d of drops) {
        d.y += d.v * dt;
        d.x -= d.v * dt * 0.16;
        if (d.y > h) {
          d.y = -20;
          d.x = Math.random() * (w + 200);
        }
        if (d.x < -20) d.x = w + 20;
        c.moveTo(d.x, d.y);
        c.lineTo(d.x + d.len * 0.16, d.y + d.len);
      }
      c.stroke();
      break;
    }
    case 'motes':
    case 'embers': {
      const color = world.weather === 'motes' ? '120,255,180' : '255,170,90';
      if (motes.length === 0) {
        for (let i = 0; i < 70; i++) {
          motes.push({
            x: Math.random() * w,
            y: Math.random() * h,
            vx: (Math.random() - 0.5) * 22,
            vy: -12 - Math.random() * 26,
            r: 1 + Math.random() * 2.4,
          });
        }
      }
      for (const m of motes) {
        m.x += (m.vx + Math.sin(time + m.y * 0.01) * 8) * dt;
        m.y += m.vy * dt;
        if (m.y < -10) {
          m.y = h + 10;
          m.x = Math.random() * w;
        }
        c.fillStyle = `rgba(${color},${(0.25 + Math.sin(time * 2 + m.x) * 0.2).toFixed(2)})`;
        c.beginPath();
        c.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        c.fill();
      }
      break;
    }
    default:
      break;
  }

  // Global colour wash that ties the sprites to the world palette.
  c.fillStyle = world.palette.fog;
  c.fillRect(0, 0, w, h);
}
