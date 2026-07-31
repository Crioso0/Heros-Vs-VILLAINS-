/** Small colour helpers shared by every painter. */

export function shade(hex: string, amount: number): string {
  const { r, g, b } = parse(hex);
  const f = amount < 0 ? 0 : 255;
  const t = Math.abs(amount);
  return `rgb(${Math.round(r + (f - r) * t)},${Math.round(g + (f - g) * t)},${Math.round(
    b + (f - b) * t,
  )})`;
}

export function alpha(hex: string, a: number): string {
  const { r, g, b } = parse(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export function mix(a: string, b: string, t: number): string {
  const c1 = parse(a);
  const c2 = parse(b);
  return `rgb(${Math.round(c1.r + (c2.r - c1.r) * t)},${Math.round(
    c1.g + (c2.g - c1.g) * t,
  )},${Math.round(c1.b + (c2.b - c1.b) * t)})`;
}

const CACHE = new Map<string, { r: number; g: number; b: number }>();

function parse(hex: string): { r: number; g: number; b: number } {
  const cached = CACHE.get(hex);
  if (cached) return cached;
  let r = 255;
  let g = 255;
  let b = 255;
  if (hex.startsWith('#')) {
    const h = hex.slice(1);
    if (h.length === 3) {
      r = parseInt(h[0] + h[0], 16);
      g = parseInt(h[1] + h[1], 16);
      b = parseInt(h[2] + h[2], 16);
    } else {
      r = parseInt(h.slice(0, 2), 16);
      g = parseInt(h.slice(2, 4), 16);
      b = parseInt(h.slice(4, 6), 16);
    }
  } else if (hex.startsWith('rgb')) {
    const parts = hex.replace(/[^0-9.,]/g, '').split(',');
    r = Number(parts[0]) || 0;
    g = Number(parts[1]) || 0;
    b = Number(parts[2]) || 0;
  }
  const out = { r, g, b };
  CACHE.set(hex, out);
  return out;
}

/** Rounded rectangle path. */
export function roundRect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.lineTo(x + w - rr, y);
  c.quadraticCurveTo(x + w, y, x + w, y + rr);
  c.lineTo(x + w, y + h - rr);
  c.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  c.lineTo(x + rr, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - rr);
  c.lineTo(x, y + rr);
  c.quadraticCurveTo(x, y, x + rr, y);
  c.closePath();
}

export function ellipse(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
): void {
  c.beginPath();
  c.ellipse(x, y, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
}

export const UI = {
  ink: '#f2f6ff',
  inkDim: '#9fb0cc',
  panel: 'rgba(10,14,26,0.86)',
  panelEdge: 'rgba(140,170,235,0.35)',
  gold: '#ffd75e',
  leaf: '#5ce06a',
  danger: '#ff5a5a',
  solar: '#ffd54a',
};
