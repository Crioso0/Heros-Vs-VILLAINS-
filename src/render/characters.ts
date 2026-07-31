import { clamp } from '../core/math';
import { drawEmblem } from './emblems';
import { alpha, ellipse, mix, roundRect, shade } from './palette';
import type { HeroArtSpec, VillainArtSpec } from '../sim/types';

/**
 * Procedural character painting.
 *
 * Every hero and villain is drawn from the same jointed chibi rig, varied by
 * palette, head shape and emblem. That keeps the whole roster consistent, ships
 * zero image assets, and means a new character is a data entry rather than an
 * art commission.
 */

export interface FigurePose {
  /** Seconds, drives idle bob and cape sway. */
  time: number;
  /** 0..1 recoil / attack lunge. */
  act: number;
  /** 0..1 damage flash. */
  hurt: number;
  /** 0..1 Leaf Mode intensity. */
  ult: number;
  /** Overall pixel height of the figure. */
  height: number;
  /** 1 == facing right (heroes), -1 == facing left (villains). */
  facing: 1 | -1;
  /** 0..1 frozen-solid overlay. */
  frozen?: number;
  /** 0..1 walk cycle phase for villains. */
  walk?: number;
}

/* ------------------------------------------------------------------ *
 * Heroes
 * ------------------------------------------------------------------ */

export function drawHero(
  c: CanvasRenderingContext2D,
  art: HeroArtSpec,
  x: number,
  yBase: number,
  pose: FigurePose,
): void {
  const h = pose.height * (art.scale ?? 1);
  const bob = Math.sin(pose.time * 2.4) * h * 0.014;
  const lunge = pose.act * h * 0.06;

  c.save();
  c.translate(x + lunge * pose.facing, yBase + bob);
  c.scale(pose.facing, 1);

  if (pose.ult > 0) drawAura(c, h, art.glow ?? art.accent, pose.ult, pose.time);

  const body = pose.hurt > 0 ? mix(art.primary, '#ffffff', pose.hurt * 0.6) : art.primary;

  if (art.cape) drawCape(c, h, art.secondary, pose.time, pose.act);

  // Legs
  c.fillStyle = shade(art.secondary, -0.15);
  roundRect(c, -h * 0.17, -h * 0.3, h * 0.14, h * 0.3, h * 0.05);
  c.fill();
  roundRect(c, h * 0.03, -h * 0.3, h * 0.14, h * 0.3, h * 0.05);
  c.fill();
  // Boots
  c.fillStyle = art.secondary;
  roundRect(c, -h * 0.19, -h * 0.08, h * 0.19, h * 0.08, h * 0.035);
  c.fill();
  roundRect(c, h * 0.01, -h * 0.08, h * 0.19, h * 0.08, h * 0.035);
  c.fill();

  // Torso
  const torsoH = h * 0.34;
  const torsoW = h * 0.4;
  c.fillStyle = body;
  roundRect(c, -torsoW / 2, -h * 0.62, torsoW, torsoH, h * 0.08);
  c.fill();
  // Chest highlight
  c.fillStyle = alpha(shade(body, 0.35), 0.35);
  roundRect(c, -torsoW / 2 + h * 0.03, -h * 0.6, torsoW * 0.35, torsoH * 0.75, h * 0.06);
  c.fill();
  // Belt
  c.fillStyle = art.accent;
  roundRect(c, -torsoW / 2, -h * 0.33, torsoW, h * 0.05, h * 0.02);
  c.fill();

  drawEmblem(c, art.emblem, 0, -h * 0.5, h * 0.1, art.accent);

  // Arms — the front arm rises with the attack pose.
  const armLift = pose.act * 0.6;
  c.fillStyle = shade(body, -0.12);
  c.save();
  c.translate(-torsoW / 2, -h * 0.58);
  c.rotate(0.35 - armLift * 0.2);
  roundRect(c, -h * 0.06, 0, h * 0.11, h * 0.26, h * 0.05);
  c.fill();
  c.restore();
  c.save();
  c.translate(torsoW / 2 - h * 0.02, -h * 0.58);
  c.rotate(-0.25 - armLift);
  roundRect(c, -h * 0.04, 0, h * 0.11, h * 0.28, h * 0.05);
  c.fill();
  // Glove
  c.fillStyle = art.accent;
  ellipse(c, h * 0.015, h * 0.28, h * 0.055, h * 0.055);
  c.fill();
  c.restore();

  drawHead(c, art, h);

  if (pose.frozen && pose.frozen > 0) drawFrost(c, h, pose.frozen);
  c.restore();
}

function drawHead(c: CanvasRenderingContext2D, art: HeroArtSpec, h: number): void {
  const hy = -h * 0.76;
  const hr = h * 0.15;

  if (art.head === 'aura') {
    const g = c.createRadialGradient(0, hy, hr * 0.2, 0, hy, hr * 2.2);
    g.addColorStop(0, alpha(art.glow ?? art.accent, 0.9));
    g.addColorStop(1, alpha(art.glow ?? art.accent, 0));
    c.fillStyle = g;
    ellipse(c, 0, hy, hr * 2.2, hr * 2.2);
    c.fill();
  }

  // Neck
  c.fillStyle = shade(art.skin, -0.1);
  roundRect(c, -h * 0.05, hy + hr * 0.6, h * 0.1, h * 0.07, h * 0.02);
  c.fill();

  // Skull
  c.fillStyle = art.skin;
  ellipse(c, 0, hy, hr, hr * 1.08);
  c.fill();

  switch (art.head) {
    case 'mask': {
      c.fillStyle = art.primary;
      c.beginPath();
      c.arc(0, hy, hr, Math.PI * 0.95, Math.PI * 2.15);
      c.closePath();
      c.fill();
      c.fillStyle = '#ffffff';
      eye(c, -hr * 0.42, hy - hr * 0.12, hr * 0.3, hr * 0.2);
      eye(c, hr * 0.42, hy - hr * 0.12, hr * 0.3, hr * 0.2);
      break;
    }
    case 'cowl': {
      c.fillStyle = art.primary;
      ellipse(c, 0, hy - hr * 0.1, hr * 1.04, hr * 1.02);
      c.fill();
      // Ears
      c.beginPath();
      c.moveTo(-hr * 0.62, hy - hr * 0.7);
      c.lineTo(-hr * 0.42, hy - hr * 1.9);
      c.lineTo(-hr * 0.18, hy - hr * 0.78);
      c.closePath();
      c.fill();
      c.beginPath();
      c.moveTo(hr * 0.62, hy - hr * 0.7);
      c.lineTo(hr * 0.42, hy - hr * 1.9);
      c.lineTo(hr * 0.18, hy - hr * 0.78);
      c.closePath();
      c.fill();
      // Jaw left bare
      c.fillStyle = art.skin;
      roundRect(c, -hr * 0.5, hy + hr * 0.24, hr, hr * 0.72, hr * 0.3);
      c.fill();
      c.fillStyle = art.accent;
      eye(c, -hr * 0.4, hy - hr * 0.08, hr * 0.28, hr * 0.16);
      eye(c, hr * 0.4, hy - hr * 0.08, hr * 0.28, hr * 0.16);
      break;
    }
    case 'helm': {
      c.fillStyle = art.primary;
      c.beginPath();
      c.arc(0, hy, hr * 1.06, Math.PI, Math.PI * 2);
      c.lineTo(hr * 1.06, hy + hr * 0.35);
      c.lineTo(-hr * 1.06, hy + hr * 0.35);
      c.closePath();
      c.fill();
      c.fillStyle = alpha(art.accent, 0.9);
      roundRect(c, -hr * 0.85, hy - hr * 0.2, hr * 1.7, hr * 0.36, hr * 0.18);
      c.fill();
      break;
    }
    case 'visor': {
      c.fillStyle = art.secondary;
      c.beginPath();
      c.arc(0, hy, hr * 1.02, Math.PI * 1.05, Math.PI * 2.1);
      c.closePath();
      c.fill();
      c.fillStyle = art.accent;
      roundRect(c, -hr * 0.9, hy - hr * 0.22, hr * 1.8, hr * 0.28, hr * 0.14);
      c.fill();
      break;
    }
    case 'hair': {
      c.fillStyle = art.hair ?? art.secondary;
      c.beginPath();
      c.moveTo(-hr * 1.05, hy - hr * 0.15);
      c.quadraticCurveTo(-hr * 1.1, hy - hr * 1.35, 0, hy - hr * 1.25);
      c.quadraticCurveTo(hr * 1.15, hy - hr * 1.3, hr * 1.02, hy + hr * 0.1);
      c.quadraticCurveTo(hr * 0.6, hy - hr * 0.55, 0, hy - hr * 0.5);
      c.quadraticCurveTo(-hr * 0.6, hy - hr * 0.5, -hr * 1.05, hy - hr * 0.15);
      c.closePath();
      c.fill();
      dots(c, hy, hr, '#1a1a24');
      break;
    }
    case 'hood': {
      c.fillStyle = art.primary;
      c.beginPath();
      c.moveTo(-hr * 1.15, hy + hr * 0.75);
      c.quadraticCurveTo(-hr * 1.3, hy - hr * 1.5, 0, hy - hr * 1.35);
      c.quadraticCurveTo(hr * 1.3, hy - hr * 1.5, hr * 1.15, hy + hr * 0.75);
      c.quadraticCurveTo(0, hy + hr * 0.2, -hr * 1.15, hy + hr * 0.75);
      c.closePath();
      c.fill();
      c.fillStyle = 'rgba(0,0,0,0.55)';
      ellipse(c, 0, hy + hr * 0.05, hr * 0.66, hr * 0.6);
      c.fill();
      c.fillStyle = art.accent;
      eye(c, -hr * 0.3, hy, hr * 0.2, hr * 0.12);
      eye(c, hr * 0.3, hy, hr * 0.2, hr * 0.12);
      break;
    }
    case 'aura':
      dots(c, hy, hr, '#3b2a10');
      break;
    case 'bare':
    default:
      dots(c, hy, hr, '#20222c');
      break;
  }
}

function dots(c: CanvasRenderingContext2D, hy: number, hr: number, color: string): void {
  c.fillStyle = color;
  ellipse(c, -hr * 0.34, hy - hr * 0.05, hr * 0.1, hr * 0.13);
  c.fill();
  ellipse(c, hr * 0.34, hy - hr * 0.05, hr * 0.1, hr * 0.13);
  c.fill();
}

function eye(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  c.beginPath();
  c.moveTo(x - rx, y + ry * 0.4);
  c.quadraticCurveTo(x, y - ry * 1.4, x + rx, y + ry * 0.4);
  c.quadraticCurveTo(x, y + ry * 0.9, x - rx, y + ry * 0.4);
  c.closePath();
  c.fill();
}

function drawCape(
  c: CanvasRenderingContext2D,
  h: number,
  color: string,
  time: number,
  act: number,
): void {
  const sway = Math.sin(time * 1.7) * h * 0.05 + act * h * 0.05;
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(-h * 0.16, -h * 0.66);
  c.quadraticCurveTo(-h * 0.55 - sway, -h * 0.42, -h * 0.4 - sway, -h * 0.02);
  c.quadraticCurveTo(-h * 0.2, -h * 0.12, h * 0.02, -h * 0.05);
  c.quadraticCurveTo(h * 0.05, -h * 0.4, h * 0.12, -h * 0.64);
  c.closePath();
  c.fill();
  c.fillStyle = alpha('#000000', 0.18);
  c.fill();
}

function drawAura(
  c: CanvasRenderingContext2D,
  h: number,
  color: string,
  power: number,
  time: number,
): void {
  const pulse = 1 + Math.sin(time * 12) * 0.08;
  const r = h * 0.62 * pulse;
  const g = c.createRadialGradient(0, -h * 0.4, r * 0.1, 0, -h * 0.4, r);
  g.addColorStop(0, alpha(color, 0.55 * power));
  g.addColorStop(0.6, alpha(color, 0.22 * power));
  g.addColorStop(1, alpha(color, 0));
  c.fillStyle = g;
  ellipse(c, 0, -h * 0.4, r, r);
  c.fill();

  // Rising motes
  c.fillStyle = alpha(color, 0.8 * power);
  for (let i = 0; i < 5; i++) {
    const t = (time * 1.6 + i * 0.2) % 1;
    const px = Math.sin((i * 2.3 + time) * 2) * h * 0.22;
    const py = -h * 0.1 - t * h * 0.8;
    ellipse(c, px, py, h * 0.02 * (1 - t), h * 0.02 * (1 - t));
    c.fill();
  }
}

function drawFrost(c: CanvasRenderingContext2D, h: number, power: number): void {
  c.fillStyle = alpha('#9fe8ff', 0.45 * power);
  roundRect(c, -h * 0.26, -h * 0.95, h * 0.52, h * 0.98, h * 0.1);
  c.fill();
  c.strokeStyle = alpha('#ffffff', 0.7 * power);
  c.lineWidth = h * 0.012;
  c.stroke();
}

/* ------------------------------------------------------------------ *
 * Villains
 * ------------------------------------------------------------------ */

export interface VillainPose extends FigurePose {
  /** 0..1 how much armour is left, drives the helmet dents. */
  armor: number;
  shield: number;
  attacking: boolean;
}

export function drawVillain(
  c: CanvasRenderingContext2D,
  art: VillainArtSpec,
  x: number,
  yBase: number,
  pose: VillainPose,
): void {
  const h = pose.height * (art.scale ?? 1);
  const walk = pose.walk ?? 0;
  const bob = Math.abs(Math.sin(walk * Math.PI * 2)) * h * 0.03;
  const lean = Math.sin(walk * Math.PI * 2) * 0.06;

  c.save();
  c.translate(x, yBase - bob);
  c.scale(-1, 1); // villains face left, toward the house

  if (art.glow) {
    const g = c.createRadialGradient(0, -h * 0.4, h * 0.05, 0, -h * 0.4, h * 0.6);
    g.addColorStop(0, alpha(art.glow, 0.28));
    g.addColorStop(1, alpha(art.glow, 0));
    c.fillStyle = g;
    ellipse(c, 0, -h * 0.4, h * 0.6, h * 0.6);
    c.fill();
  }

  const body = pose.hurt > 0 ? mix(art.primary, '#ffffff', pose.hurt * 0.7) : art.primary;

  c.rotate(lean * 0.35);

  // Legs — shambling, one always dragging
  c.fillStyle = shade(art.secondary, -0.1);
  const step = Math.sin(walk * Math.PI * 2) * h * 0.07;
  roundRect(c, -h * 0.18 + step, -h * 0.28, h * 0.14, h * 0.28, h * 0.05);
  c.fill();
  roundRect(c, h * 0.03 - step, -h * 0.28, h * 0.14, h * 0.28, h * 0.05);
  c.fill();

  // Torso, hunched forward
  c.save();
  c.rotate(-0.12);
  c.fillStyle = body;
  roundRect(c, -h * 0.2, -h * 0.6, h * 0.4, h * 0.34, h * 0.07);
  c.fill();
  c.fillStyle = alpha('#000000', 0.22);
  roundRect(c, -h * 0.2, -h * 0.4, h * 0.4, h * 0.14, h * 0.05);
  c.fill();
  c.restore();

  // Outstretched arms
  const reach = pose.attacking ? 0.45 + Math.sin(pose.time * 14) * 0.12 : 0.2 + walk * 0.05;
  c.fillStyle = shade(body, -0.18);
  for (const side of [-1, 1]) {
    c.save();
    c.translate(-h * 0.14, -h * 0.56 + side * h * 0.02);
    c.rotate(-1.15 - reach * 0.35 + side * 0.12);
    roundRect(c, -h * 0.05, 0, h * 0.1, h * 0.3, h * 0.04);
    c.fill();
    c.fillStyle = art.skin;
    ellipse(c, 0, h * 0.31, h * 0.05, h * 0.05);
    c.fill();
    c.fillStyle = shade(body, -0.18);
    c.restore();
  }

  drawVillainHead(c, art, h, pose);

  if (pose.shield > 0) {
    // Riot shield rides on the villain's leading side.
    c.fillStyle = alpha('#c9a227', 0.28);
    c.strokeStyle = shade(art.accent, -0.1);
    c.lineWidth = h * 0.02;
    roundRect(c, -h * 0.42, -h * 0.82, h * 0.16, h * 0.78, h * 0.04);
    c.fill();
    c.stroke();
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.moveTo(-h * 0.42, -h * 0.75 + i * h * 0.18);
      c.lineTo(-h * 0.26, -h * 0.75 + i * h * 0.18);
      c.stroke();
    }
  }

  if (pose.frozen && pose.frozen > 0) drawFrost(c, h, pose.frozen);
  c.restore();
}

function drawVillainHead(
  c: CanvasRenderingContext2D,
  art: VillainArtSpec,
  h: number,
  pose: VillainPose,
): void {
  const hy = -h * 0.72;
  const hr = h * 0.145;

  c.fillStyle = art.skin;
  ellipse(c, -h * 0.02, hy, hr, hr * 1.05);
  c.fill();

  // Sunken eyes
  c.fillStyle = '#141018';
  ellipse(c, -hr * 0.36, hy - hr * 0.06, hr * 0.16, hr * 0.2);
  c.fill();
  ellipse(c, hr * 0.32, hy - hr * 0.06, hr * 0.16, hr * 0.2);
  c.fill();

  switch (art.head) {
    case 'helm':
      if (pose.armor > 0) {
        c.fillStyle = art.accent;
        c.beginPath();
        c.arc(-h * 0.02, hy - hr * 0.1, hr * 1.12, Math.PI * 1.02, Math.PI * 2.02);
        c.lineTo(hr * 1.1, hy + hr * 0.1);
        c.lineTo(-hr * 1.14, hy + hr * 0.1);
        c.closePath();
        c.fill();
        c.fillStyle = alpha('#000000', 0.25 * (1 - pose.armor));
        c.fill();
      }
      break;
    case 'hood':
      c.fillStyle = art.secondary;
      c.beginPath();
      c.moveTo(-hr * 1.2, hy + hr * 0.7);
      c.quadraticCurveTo(-hr * 1.2, hy - hr * 1.5, 0, hy - hr * 1.3);
      c.quadraticCurveTo(hr * 1.2, hy - hr * 1.5, hr * 1.1, hy + hr * 0.7);
      c.quadraticCurveTo(0, hy + hr * 0.1, -hr * 1.2, hy + hr * 0.7);
      c.closePath();
      c.fill();
      break;
    case 'mask':
      c.fillStyle = art.secondary;
      roundRect(c, -hr, hy - hr * 0.5, hr * 2, hr, hr * 0.3);
      c.fill();
      break;
    case 'grin':
      c.fillStyle = art.accent;
      c.beginPath();
      c.moveTo(-hr * 0.7, hy + hr * 0.22);
      c.quadraticCurveTo(0, hy + hr * 0.95, hr * 0.7, hy + hr * 0.22);
      c.quadraticCurveTo(0, hy + hr * 0.5, -hr * 0.7, hy + hr * 0.22);
      c.closePath();
      c.fill();
      c.fillStyle = art.primary;
      c.beginPath();
      c.moveTo(-hr * 1.2, hy - hr * 1.05);
      c.quadraticCurveTo(0, hy - hr * 1.9, hr * 1.2, hy - hr * 1.05);
      c.quadraticCurveTo(0, hy - hr * 0.5, -hr * 1.2, hy - hr * 1.05);
      c.closePath();
      c.fill();
      break;
    case 'brute':
      c.fillStyle = shade(art.primary, -0.1);
      roundRect(c, -hr * 1.1, hy + hr * 0.15, hr * 2.2, hr * 0.85, hr * 0.25);
      c.fill();
      c.fillStyle = '#f5f5f5';
      for (let i = 0; i < 4; i++) {
        roundRect(c, -hr * 0.85 + i * hr * 0.45, hy + hr * 0.2, hr * 0.28, hr * 0.3, hr * 0.06);
        c.fill();
      }
      break;
    case 'wings': {
      const flap = Math.sin(pose.time * 9) * 0.5;
      c.fillStyle = alpha(art.accent, 0.85);
      for (const side of [-1, 1]) {
        c.save();
        c.translate(0, -h * 0.62);
        c.rotate(side * (0.5 + flap * 0.4));
        c.beginPath();
        c.moveTo(0, 0);
        c.quadraticCurveTo(h * 0.24, -h * 0.16, h * 0.46, -h * 0.02);
        c.quadraticCurveTo(h * 0.24, h * 0.06, 0, h * 0.06);
        c.closePath();
        c.fill();
        c.restore();
      }
      break;
    }
    case 'crown':
      c.fillStyle = art.accent;
      c.beginPath();
      c.moveTo(-hr * 1.05, hy - hr * 0.85);
      c.lineTo(-hr * 0.6, hy - hr * 1.7);
      c.lineTo(-hr * 0.15, hy - hr * 0.95);
      c.lineTo(hr * 0.3, hy - hr * 1.8);
      c.lineTo(hr * 0.72, hy - hr * 0.95);
      c.lineTo(hr * 1.05, hy - hr * 1.6);
      c.lineTo(hr * 1.05, hy - hr * 0.7);
      c.lineTo(-hr * 1.05, hy - hr * 0.7);
      c.closePath();
      c.fill();
      break;
    case 'goon':
    default:
      c.fillStyle = shade(art.secondary, 0.1);
      c.beginPath();
      c.moveTo(-hr * 1.05, hy - hr * 0.35);
      c.quadraticCurveTo(0, hy - hr * 1.5, hr * 1.05, hy - hr * 0.35);
      c.quadraticCurveTo(0, hy - hr * 0.85, -hr * 1.05, hy - hr * 0.35);
      c.closePath();
      c.fill();
      break;
  }
}

/* ------------------------------------------------------------------ *
 * Shared
 * ------------------------------------------------------------------ */

export function drawShadow(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  strength = 0.35,
): void {
  c.fillStyle = alpha('#000000', clamp(strength, 0, 1));
  ellipse(c, x, y, w * 0.5, w * 0.18);
  c.fill();
}

export function drawHealthBar(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  ratio: number,
  color: string,
): void {
  const h = 5;
  c.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(c, x - w / 2, y, w, h, 2.5);
  c.fill();
  c.fillStyle = color;
  roundRect(c, x - w / 2, y, Math.max(0, w * clamp(ratio, 0, 1)), h, 2.5);
  c.fill();
}
