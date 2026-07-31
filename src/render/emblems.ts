import type { EmblemKind } from '../sim/types';
import { roundRect } from './palette';

/**
 * Chest emblems.
 *
 * These are abstract geometric glyphs invented for this project — a diamond, a
 * ring, a stylised bat-shape, and so on. They are deliberately generic so the
 * roster reads as "superhero" without reproducing anyone's trademark.
 */
export function drawEmblem(
  c: CanvasRenderingContext2D,
  kind: EmblemKind,
  x: number,
  y: number,
  size: number,
  color: string,
): void {
  if (kind === 'none') return;
  const s = size;
  c.save();
  c.translate(x, y);
  c.fillStyle = color;
  c.strokeStyle = color;
  c.lineWidth = Math.max(1, s * 0.16);
  c.lineJoin = 'round';
  c.lineCap = 'round';

  switch (kind) {
    case 'diamond':
      c.beginPath();
      c.moveTo(0, -s);
      c.lineTo(s * 0.78, -s * 0.1);
      c.lineTo(0, s);
      c.lineTo(-s * 0.78, -s * 0.1);
      c.closePath();
      c.fill();
      break;

    case 'bat':
      c.beginPath();
      c.moveTo(0, -s * 0.55);
      c.quadraticCurveTo(s * 0.35, -s * 0.75, s * 0.55, -s * 0.2);
      c.quadraticCurveTo(s * 0.8, -s * 0.55, s * 1.05, -s * 0.1);
      c.quadraticCurveTo(s * 0.7, s * 0.15, s * 0.4, s * 0.65);
      c.quadraticCurveTo(s * 0.18, s * 0.2, 0, s * 0.45);
      c.quadraticCurveTo(-s * 0.18, s * 0.2, -s * 0.4, s * 0.65);
      c.quadraticCurveTo(-s * 0.7, s * 0.15, -s * 1.05, -s * 0.1);
      c.quadraticCurveTo(-s * 0.8, -s * 0.55, -s * 0.55, -s * 0.2);
      c.quadraticCurveTo(-s * 0.35, -s * 0.75, 0, -s * 0.55);
      c.closePath();
      c.fill();
      break;

    case 'ring':
      c.beginPath();
      c.arc(0, 0, s * 0.72, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.moveTo(-s * 0.72, 0);
      c.lineTo(s * 0.72, 0);
      c.stroke();
      break;

    case 'star':
      star(c, 5, s, s * 0.45);
      c.fill();
      break;

    case 'bolt':
      c.beginPath();
      c.moveTo(s * 0.35, -s);
      c.lineTo(-s * 0.45, s * 0.12);
      c.lineTo(s * 0.02, s * 0.12);
      c.lineTo(-s * 0.3, s);
      c.lineTo(s * 0.55, -s * 0.18);
      c.lineTo(s * 0.05, -s * 0.18);
      c.closePath();
      c.fill();
      break;

    case 'atom':
      for (let i = 0; i < 3; i++) {
        c.save();
        c.rotate((i * Math.PI) / 3);
        c.beginPath();
        c.ellipse(0, 0, s, s * 0.4, 0, 0, Math.PI * 2);
        c.stroke();
        c.restore();
      }
      c.beginPath();
      c.arc(0, 0, s * 0.24, 0, Math.PI * 2);
      c.fill();
      break;

    case 'web':
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(Math.cos(a) * s, Math.sin(a) * s);
        c.stroke();
      }
      for (let r = 0.4; r <= 1; r += 0.3) {
        c.beginPath();
        for (let i = 0; i <= 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const px = Math.cos(a) * s * r;
          const py = Math.sin(a) * s * r;
          if (i === 0) c.moveTo(px, py);
          else c.lineTo(px, py);
        }
        c.stroke();
      }
      break;

    case 'flame':
      c.beginPath();
      c.moveTo(0, -s);
      c.quadraticCurveTo(s * 0.75, -s * 0.1, s * 0.35, s * 0.55);
      c.quadraticCurveTo(s * 0.1, s, 0, s);
      c.quadraticCurveTo(-s * 0.1, s, -s * 0.35, s * 0.55);
      c.quadraticCurveTo(-s * 0.75, -s * 0.1, 0, -s);
      c.closePath();
      c.fill();
      break;

    case 'shield':
      c.beginPath();
      c.moveTo(0, -s);
      c.lineTo(s * 0.8, -s * 0.5);
      c.quadraticCurveTo(s * 0.8, s * 0.55, 0, s);
      c.quadraticCurveTo(-s * 0.8, s * 0.55, -s * 0.8, -s * 0.5);
      c.closePath();
      c.fill();
      break;

    case 'sun':
      c.beginPath();
      c.arc(0, 0, s * 0.5, 0, Math.PI * 2);
      c.fill();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        c.beginPath();
        c.moveTo(Math.cos(a) * s * 0.66, Math.sin(a) * s * 0.66);
        c.lineTo(Math.cos(a) * s, Math.sin(a) * s);
        c.stroke();
      }
      break;

    case 'wave':
      c.beginPath();
      for (let i = 0; i <= 12; i++) {
        const px = -s + (i / 12) * s * 2;
        const py = Math.sin((i / 12) * Math.PI * 3) * s * 0.42;
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.stroke();
      break;

    case 'eye':
      c.beginPath();
      c.moveTo(-s, 0);
      c.quadraticCurveTo(0, -s * 0.85, s, 0);
      c.quadraticCurveTo(0, s * 0.85, -s, 0);
      c.closePath();
      c.stroke();
      c.beginPath();
      c.arc(0, 0, s * 0.28, 0, Math.PI * 2);
      c.fill();
      break;

    case 'arrow':
      c.beginPath();
      c.moveTo(-s * 0.9, s * 0.6);
      c.lineTo(s * 0.7, -s * 0.7);
      c.stroke();
      c.beginPath();
      c.moveTo(s * 0.9, -s * 0.9);
      c.lineTo(s * 0.15, -s * 0.75);
      c.lineTo(s * 0.75, -s * 0.15);
      c.closePath();
      c.fill();
      break;

    case 'fist':
      roundRect(c, -s * 0.75, -s * 0.55, s * 1.5, s * 1.1, s * 0.3);
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.35)';
      for (let i = 0; i < 3; i++) {
        const yy = -s * 0.25 + i * s * 0.28;
        c.beginPath();
        c.moveTo(-s * 0.5, yy);
        c.lineTo(s * 0.5, yy);
        c.stroke();
      }
      break;
  }
  c.restore();
}

function star(c: CanvasRenderingContext2D, points: number, outer: number, inner: number): void {
  c.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) c.moveTo(px, py);
    else c.lineTo(px, py);
  }
  c.closePath();
}
