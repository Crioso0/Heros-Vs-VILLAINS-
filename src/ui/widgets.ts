import { pointInRect, type Rect } from '../core/math';
import { alpha, roundRect, shade, UI } from '../render/palette';

/**
 * Tiny immediate-mode UI. The app owns one PointerState, widgets read it while
 * drawing and report clicks. No retained widget tree, no DOM — which keeps the
 * whole interface inside the canvas and therefore identical on every platform.
 */
export interface PointerState {
  x: number;
  y: number;
  down: boolean;
  /** True for the single frame the pointer went down. */
  pressed: boolean;
  /** True for the single frame it came up. */
  released: boolean;
  /** Where the current press started. */
  downX: number;
  downY: number;
}

export function createPointer(): PointerState {
  return { x: -999, y: -999, down: false, pressed: false, released: false, downX: 0, downY: 0 };
}

export interface ButtonStyle {
  fill?: string;
  text?: string;
  accent?: string;
  disabled?: boolean;
  small?: boolean;
  align?: CanvasTextAlign;
}

export function button(
  c: CanvasRenderingContext2D,
  p: PointerState,
  rect: Rect,
  label: string,
  style: ButtonStyle = {},
): boolean {
  const hot = !style.disabled && pointInRect(p.x, p.y, rect);
  const active = hot && p.down;
  const fill = style.fill ?? '#1b2440';
  const accent = style.accent ?? UI.gold;

  c.save();
  c.globalAlpha = style.disabled ? 0.42 : 1;
  roundRect(c, rect.x, rect.y + (active ? 2 : 0), rect.w, rect.h, 10);
  c.fillStyle = hot ? shade(fill, 0.16) : fill;
  c.fill();
  c.lineWidth = 2;
  c.strokeStyle = hot ? accent : alpha(accent, 0.45);
  c.stroke();

  c.fillStyle = style.text ?? UI.ink;
  c.font = `700 ${style.small ? 14 : 18}px 'Trebuchet MS', sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + (active ? 2 : 0));
  c.restore();

  return hot && p.released && !style.disabled;
}

export function panel(
  c: CanvasRenderingContext2D,
  rect: Rect,
  opts: { title?: string; accent?: string; radius?: number } = {},
): void {
  const accent = opts.accent ?? UI.panelEdge;
  c.save();
  roundRect(c, rect.x, rect.y, rect.w, rect.h, opts.radius ?? 16);
  c.fillStyle = UI.panel;
  c.fill();
  c.strokeStyle = accent;
  c.lineWidth = 2;
  c.stroke();
  if (opts.title) {
    c.fillStyle = UI.ink;
    c.font = "700 20px 'Trebuchet MS', sans-serif";
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.fillText(opts.title, rect.x + 18, rect.y + 30);
    c.strokeStyle = alpha(accent, 0.6);
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(rect.x + 16, rect.y + 42);
    c.lineTo(rect.x + rect.w - 16, rect.y + 42);
    c.stroke();
  }
  c.restore();
}

export function text(
  c: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  opts: {
    size?: number;
    color?: string;
    align?: CanvasTextAlign;
    weight?: number;
    maxWidth?: number;
  } = {},
): void {
  c.save();
  c.font = `${opts.weight ?? 600} ${opts.size ?? 16}px 'Trebuchet MS', sans-serif`;
  c.fillStyle = opts.color ?? UI.ink;
  c.textAlign = opts.align ?? 'left';
  c.textBaseline = 'alphabetic';
  if (opts.maxWidth) c.fillText(str, x, y, opts.maxWidth);
  else c.fillText(str, x, y);
  c.restore();
}

/** Word-wrapped paragraph. Returns the y of the line after the last one drawn. */
export function paragraph(
  c: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  maxWidth: number,
  opts: { size?: number; color?: string; lineHeight?: number; align?: CanvasTextAlign } = {},
): number {
  const size = opts.size ?? 15;
  const lh = opts.lineHeight ?? size * 1.45;
  c.save();
  c.font = `500 ${size}px 'Trebuchet MS', sans-serif`;
  c.fillStyle = opts.color ?? UI.inkDim;
  c.textAlign = opts.align ?? 'left';
  const words = str.split(' ');
  let line = '';
  let cy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (c.measureText(test).width > maxWidth && line) {
      c.fillText(line, x, cy);
      line = word;
      cy += lh;
    } else {
      line = test;
    }
  }
  if (line) {
    c.fillText(line, x, cy);
    cy += lh;
  }
  c.restore();
  return cy;
}

export function meter(
  c: CanvasRenderingContext2D,
  rect: Rect,
  ratio: number,
  color: string,
  label?: string,
): void {
  c.save();
  roundRect(c, rect.x, rect.y, rect.w, rect.h, rect.h / 2);
  c.fillStyle = 'rgba(0,0,0,0.55)';
  c.fill();
  c.strokeStyle = alpha(color, 0.5);
  c.lineWidth = 1.5;
  c.stroke();
  const w = Math.max(0, Math.min(1, ratio)) * (rect.w - 4);
  if (w > 0) {
    roundRect(c, rect.x + 2, rect.y + 2, w, rect.h - 4, (rect.h - 4) / 2);
    const g = c.createLinearGradient(rect.x, 0, rect.x + rect.w, 0);
    g.addColorStop(0, shade(color, -0.2));
    g.addColorStop(1, shade(color, 0.3));
    c.fillStyle = g;
    c.fill();
  }
  if (label) {
    c.fillStyle = UI.ink;
    c.font = "700 12px 'Trebuchet MS', sans-serif";
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 0.5);
  }
  c.restore();
}
