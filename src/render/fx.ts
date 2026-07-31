import { clamp } from '../core/math';
import { alpha } from './palette';

/**
 * Presentation-only particle system. Nothing in here feeds back into the
 * simulation, so it is free to use Math.random and to be skipped entirely on
 * low-end devices.
 */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
  kind: 'dot' | 'spark' | 'ring' | 'text';
  text?: string;
  spin?: number;
}

export class FxLayer {
  private parts: Particle[] = [];
  shake = 0;
  private flashColor = '#ffffff';
  private flash = 0;

  clear(): void {
    this.parts.length = 0;
    this.shake = 0;
    this.flash = 0;
  }

  addShake(power: number): void {
    this.shake = Math.min(28, this.shake + power * 9);
  }

  addFlash(color: string, power: number): void {
    this.flashColor = color;
    this.flash = Math.max(this.flash, clamp(power, 0, 1));
  }

  burst(x: number, y: number, count: number, color: string, power = 1): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (40 + Math.random() * 160) * power;
      this.parts.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 40 * power,
        life: 0.3 + Math.random() * 0.45,
        maxLife: 0.75,
        size: (1.6 + Math.random() * 2.8) * power,
        color,
        gravity: 420,
        kind: Math.random() < 0.3 ? 'spark' : 'dot',
      });
    }
  }

  ring(x: number, y: number, radius: number, color: string): void {
    this.parts.push({
      x,
      y,
      vx: 0,
      vy: 0,
      life: 0.42,
      maxLife: 0.42,
      size: radius,
      color,
      gravity: 0,
      kind: 'ring',
    });
  }

  popText(x: number, y: number, text: string, color: string): void {
    this.parts.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 20,
      vy: -70,
      life: 0.9,
      maxLife: 0.9,
      size: 18,
      color,
      gravity: 60,
      kind: 'text',
      text,
    });
  }

  debris(x: number, y: number, count: number, color: string): void {
    for (let i = 0; i < count; i++) {
      this.parts.push({
        x,
        y,
        vx: (Math.random() - 0.4) * 220,
        vy: -120 - Math.random() * 220,
        life: 0.6 + Math.random() * 0.6,
        maxLife: 1.2,
        size: 3 + Math.random() * 5,
        color,
        gravity: 900,
        kind: 'dot',
        spin: (Math.random() - 0.5) * 14,
      });
    }
  }

  update(dt: number): void {
    this.shake = Math.max(0, this.shake - dt * 60);
    this.flash = Math.max(0, this.flash - dt * 2.6);
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.parts.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.vx *= 1 - dt * 1.4;
    }
    // Hard cap so a long session cannot accumulate work.
    if (this.parts.length > 900) this.parts.splice(0, this.parts.length - 900);
  }

  draw(c: CanvasRenderingContext2D): void {
    c.save();
    for (const p of this.parts) {
      const t = clamp(p.life / p.maxLife, 0, 1);
      switch (p.kind) {
        case 'ring': {
          const r = p.size * (1.35 - t);
          c.strokeStyle = alpha(p.color, t * 0.8);
          c.lineWidth = 2 + t * 4;
          c.beginPath();
          c.arc(p.x, p.y, r, 0, Math.PI * 2);
          c.stroke();
          break;
        }
        case 'spark': {
          c.strokeStyle = alpha(p.color, t);
          c.lineWidth = p.size * 0.6;
          c.beginPath();
          c.moveTo(p.x, p.y);
          c.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
          c.stroke();
          break;
        }
        case 'text': {
          c.fillStyle = alpha(p.color, t);
          c.font = `700 ${p.size}px 'Trebuchet MS', sans-serif`;
          c.textAlign = 'center';
          c.strokeStyle = `rgba(0,0,0,${t * 0.7})`;
          c.lineWidth = 3;
          c.strokeText(p.text ?? '', p.x, p.y);
          c.fillText(p.text ?? '', p.x, p.y);
          break;
        }
        default: {
          c.fillStyle = alpha(p.color, t);
          c.beginPath();
          c.arc(p.x, p.y, p.size * (0.5 + t * 0.7), 0, Math.PI * 2);
          c.fill();
          break;
        }
      }
    }
    c.restore();
  }

  drawFlash(c: CanvasRenderingContext2D, w: number, h: number): void {
    if (this.flash <= 0) return;
    c.fillStyle = alpha(this.flashColor, this.flash * 0.55);
    c.fillRect(0, 0, w, h);
  }

  shakeOffset(): { x: number; y: number } {
    if (this.shake <= 0) return { x: 0, y: 0 };
    return {
      x: (Math.random() - 0.5) * this.shake,
      y: (Math.random() - 0.5) * this.shake * 0.6,
    };
  }
}
