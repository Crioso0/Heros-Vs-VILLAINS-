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
    { y: horizon, scale: 0.55, color: mix(world.palette.sky[1], '#0a0e1e', 0.55), lit: 0.25 },
    { y: horizon + h * 0.06, scale: 0.78, color: mix(world.palette.sky[1], '#070a16', 0.75), lit: 0.5 },
    { y: horizon + h * 0.14, scale: 1, color: '#05070f', lit: 0.8 },
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
      x += bw + rng.range(3, 14);
    }
  }

  // Rooftop the lawn sits on, with a parapet.
  paintGround(c, world, w, h, horizon + h * 0.2);
  c.fillStyle = '#0b0e1a';
  c.fillRect(0, horizon + h * 0.2 - 10, w, 12);
  c.fillStyle = 'rgba(140,165,225,0.18)';
  c.fillRect(0, horizon + h * 0.2 - 10, w, 2);

  // A pair of gargoyles watching the lawn.
  gargoyle(c, w * 0.06, horizon + h * 0.2 - 8, h * 0.075);
  gargoyle(c, w * 0.955, horizon + h * 0.2 - 8, h * 0.075, true);
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
      x += bw + rng.range(4, 16);
    }
  }

  paintGround(c, world, w, h, horizon + h * 0.18);

  // Plaza kerb.
  c.fillStyle = '#cfd8dc';
  c.fillRect(0, horizon + h * 0.18 - 8, w, 9);
  c.fillStyle = 'rgba(0,0,0,0.12)';
  c.fillRect(0, horizon + h * 0.18 + 1, w, 3);
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

  paintGround(c, world, w, h, horizon + h * 0.18);

  // Energy conduits running along the platform edge.
  c.strokeStyle = 'rgba(120,255,180,0.5)';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(0, horizon + h * 0.18 - 4);
  c.lineTo(w, horizon + h * 0.18 - 4);
  c.stroke();
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

  // A cracked, faintly glowing crater.
  c.fillStyle = 'rgba(150,255,110,0.10)';
  c.beginPath();
  c.ellipse(w * 0.3, horizon + h * 0.06, w * 0.16, h * 0.03, 0, 0, Math.PI * 2);
  c.fill();

  paintGround(c, world, w, h, horizon + h * 0.18);
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
