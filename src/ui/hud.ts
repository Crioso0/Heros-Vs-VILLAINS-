import { clamp, pointInRect, type Rect } from '../core/math';
import { heroDef } from '../content/heroes';
import { villainDef } from '../content/villains';
import { SCHEMES } from '../content/schemes';
import { drawHero, drawVillain } from '../render/characters';
import { drawLeafGlyph } from '../render/renderer';
import {
  cardRect,
  laneStripRect,
  schemeButtonRect,
  SOLAR_BOX,
  VIEW,
  villainCardRect,
} from '../render/layout';
import { alpha, ellipse, roundRect, shade, UI } from '../render/palette';
import type { BattleState } from '../sim/types';
import { meter, panel, text, type PointerState } from './widgets';

export interface HudAction {
  kind:
    | 'pickCard'
    | 'shovel'
    | 'pause'
    | 'speed'
    | 'overdrive'
    | 'pickLeaf'
    | 'villainCard'
    | 'scheme';
  index?: number;
  id?: string;
}

export interface HudInput {
  selectedCard: number | null;
  shovelActive: boolean;
  paused: boolean;
  speed: number;
  /** Villain commander UI is only drawn in versus mode. */
  villainSide: boolean;
  selectedVillainCard: number | null;
  selectedScheme: string | null;
  time: number;
  /** Replaces the wave meter when a mode has no wave list (Versus). */
  progressOverride?: { ratio: number; label: string; caption: string };
}

/** Bottom-bar geometry. Derived so the leaf row and the meter cannot collide. */
const LEAF_ROW_X = 20;
const LEAF_SLOT_PITCH = 34;
const MAX_LEAVES = 9;
const OVERDRIVE_X = LEAF_ROW_X + MAX_LEAVES * LEAF_SLOT_PITCH + 10;

export class Hud {
  /** Populated during draw so the battle screen can hit-test cheaply. */
  cardRects: Rect[] = [];
  villainRects: Rect[] = [];
  schemeRects: Rect[] = [];

  draw(
    c: CanvasRenderingContext2D,
    state: BattleState,
    p: PointerState,
    input: HudInput,
  ): HudAction | null {
    let action: HudAction | null = null;

    action = this.drawSolar(c, state, p) ?? action;
    action = this.drawTray(c, state, p, input) ?? action;
    action = this.drawTools(c, p, input) ?? action;
    action = this.drawBottomBar(c, state, p, input) ?? action;
    if (input.villainSide) action = this.drawVillainPanel(c, state, p, input) ?? action;
    this.drawWaveBanner(c, state);

    return action;
  }

  /* ---------------------------------------------------------------- */

  private drawSolar(
    c: CanvasRenderingContext2D,
    state: BattleState,
    p: PointerState,
  ): HudAction | null {
    const r = SOLAR_BOX;
    panel(c, r, { accent: alpha(UI.solar, 0.5), radius: 12 });

    const g = c.createRadialGradient(r.x + r.w / 2, r.y + 34, 3, r.x + r.w / 2, r.y + 34, 26);
    g.addColorStop(0, '#fffbe0');
    g.addColorStop(0.45, UI.solar);
    g.addColorStop(1, alpha(UI.solar, 0));
    c.fillStyle = g;
    ellipse(c, r.x + r.w / 2, r.y + 34, 26, 26);
    c.fill();

    text(c, String(Math.floor(state.solar)), r.x + r.w / 2, r.y + 82, {
      size: 26,
      align: 'center',
      weight: 800,
      color: UI.ink,
    });
    text(c, 'SOLAR', r.x + r.w / 2, r.y + 98, {
      size: 10,
      align: 'center',
      color: UI.inkDim,
    });
    void p;
    return null;
  }

  private drawTray(
    c: CanvasRenderingContext2D,
    state: BattleState,
    p: PointerState,
    input: HudInput,
  ): HudAction | null {
    this.cardRects = [];
    let action: HudAction | null = null;

    for (let i = 0; i < state.cards.length; i++) {
      const card = state.cards[i];
      const def = heroDef(card.heroId);
      const r = cardRect(i);
      this.cardRects.push(r);

      const affordable = state.solar >= def.cost;
      const ready = card.cooldown <= 0;
      const usable = affordable && ready;
      const hot = pointInRect(p.x, p.y, r);
      const selected = input.selectedCard === i;

      c.save();
      roundRect(c, r.x, r.y, r.w, r.h, 9);
      const bg = c.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
      bg.addColorStop(0, '#20293f');
      bg.addColorStop(1, '#141a2b');
      c.fillStyle = bg;
      c.fill();
      c.clip();

      // Portrait
      c.save();
      c.globalAlpha = usable ? 1 : 0.55;
      drawHero(c, def.art, r.x + r.w / 2, r.y + r.h - 26, {
        time: input.time + i,
        act: 0,
        hurt: 0,
        ult: 0,
        height: 74,
        facing: 1,
      });
      c.restore();

      // Name plate
      c.fillStyle = 'rgba(6,9,18,0.82)';
      c.fillRect(0, r.y + r.h - 32, VIEW.w, 18);
      text(c, def.name.toUpperCase(), r.x + r.w / 2, r.y + r.h - 19, {
        size: 9,
        align: 'center',
        color: usable ? UI.ink : UI.inkDim,
        weight: 800,
      });

      // Cost
      c.fillStyle = affordable ? UI.solar : '#7c6a3a';
      roundRect(c, r.x + 4, r.y + r.h - 15, r.w - 8, 13, 6);
      c.fill();
      text(c, String(def.cost), r.x + r.w / 2, r.y + r.h - 5, {
        size: 11,
        align: 'center',
        color: '#20180a',
        weight: 800,
      });

      // Recharge sweep
      if (!ready) {
        const ratio = clamp(card.cooldown / Math.max(0.001, card.recharge), 0, 1);
        c.fillStyle = 'rgba(4,7,16,0.72)';
        c.fillRect(r.x, r.y, r.w, r.h * ratio);
        text(c, card.cooldown.toFixed(1), r.x + r.w / 2, r.y + r.h * 0.5, {
          size: 15,
          align: 'center',
          weight: 800,
          color: '#cfe0ff',
        });
      } else if (!affordable) {
        c.fillStyle = 'rgba(4,7,16,0.45)';
        c.fillRect(r.x, r.y, r.w, r.h);
      }
      c.restore();

      c.lineWidth = selected ? 3 : 2;
      c.strokeStyle = selected ? UI.leaf : hot && usable ? UI.gold : 'rgba(120,150,210,0.35)';
      roundRect(c, r.x, r.y, r.w, r.h, 9);
      c.stroke();

      if (hot && p.pressed && usable) action = { kind: 'pickCard', index: i };
    }

    // Tooltip for whatever the pointer rests on.
    const hovered = this.cardRects.findIndex((r) => pointInRect(p.x, p.y, r));
    if (hovered >= 0 && input.selectedCard === null) {
      this.drawCardTooltip(c, state, hovered);
    }
    return action;
  }

  private drawCardTooltip(c: CanvasRenderingContext2D, state: BattleState, index: number): void {
    const def = heroDef(state.cards[index].heroId);
    const r = cardRect(index);
    const w = 250;
    const h = def.ultimate ? 116 : 84;
    const x = clamp(r.x + r.w / 2 - w / 2, 4, VIEW.w - w - 4);
    const y = r.y + r.h + 8;
    panel(c, { x, y, w, h }, { accent: alpha(def.art.glow ?? UI.gold, 0.6), radius: 10 });
    text(c, def.name, x + 12, y + 22, { size: 16, weight: 800 });
    text(c, def.tagline, x + 12, y + 40, { size: 11, color: UI.inkDim });
    text(c, roleLabel(def.role), x + w - 12, y + 22, {
      size: 11,
      align: 'right',
      color: def.art.glow ?? UI.gold,
      weight: 800,
    });
    text(c, `${def.hp} HP · ${def.recharge}s recharge`, x + 12, y + 60, {
      size: 11,
      color: UI.inkDim,
    });
    if (def.ultimate) {
      c.save();
      drawLeafGlyph(c, x + 20, y + 84, 10);
      c.restore();
      text(c, def.ultimate.name, x + 36, y + 82, { size: 12, weight: 800, color: UI.leaf });
      text(c, def.ultimate.description, x + 12, y + 102, { size: 10, color: UI.inkDim, maxWidth: w - 24 });
    }
  }

  private drawTools(
    c: CanvasRenderingContext2D,
    p: PointerState,
    input: HudInput,
  ): HudAction | null {
    let action: HudAction | null = null;
    const shovel: Rect = { x: VIEW.w - 62, y: 8, w: 54, h: 54 };
    const pause: Rect = { x: VIEW.w - 62, y: 68, w: 54, h: 22 };
    const speed: Rect = { x: VIEW.w - 62, y: 94, w: 54, h: 22 };

    // Shovel
    c.save();
    roundRect(c, shovel.x, shovel.y, shovel.w, shovel.h, 10);
    c.fillStyle = input.shovelActive ? '#3a2a12' : '#1b2440';
    c.fill();
    c.strokeStyle = input.shovelActive ? UI.gold : 'rgba(120,150,210,0.4)';
    c.lineWidth = 2;
    c.stroke();
    c.translate(shovel.x + shovel.w / 2, shovel.y + shovel.h / 2);
    c.rotate(-0.5);
    c.fillStyle = '#8d6e63';
    roundRect(c, -2.5, -16, 5, 20, 2);
    c.fill();
    c.fillStyle = '#b0bec5';
    c.beginPath();
    c.moveTo(-8, 4);
    c.lineTo(8, 4);
    c.lineTo(6, 16);
    c.lineTo(-6, 16);
    c.closePath();
    c.fill();
    c.restore();
    if (pointInRect(p.x, p.y, shovel) && p.released) action = { kind: 'shovel' };

    c.save();
    for (const [rect, label, kind] of [
      [pause, input.paused ? '▶' : '❚❚', 'pause'],
      [speed, `${input.speed}×`, 'speed'],
    ] as [Rect, string, HudAction['kind']][]) {
      roundRect(c, rect.x, rect.y, rect.w, rect.h, 6);
      c.fillStyle = '#151d33';
      c.fill();
      c.strokeStyle = 'rgba(120,150,210,0.35)';
      c.lineWidth = 1.5;
      c.stroke();
      text(c, label, rect.x + rect.w / 2, rect.y + 15, {
        size: 12,
        align: 'center',
        weight: 800,
      });
      if (pointInRect(p.x, p.y, rect) && p.released) action = { kind };
    }
    c.restore();
    return action;
  }

  private drawBottomBar(
    c: CanvasRenderingContext2D,
    state: BattleState,
    p: PointerState,
    input: HudInput,
  ): HudAction | null {
    let action: HudAction | null = null;
    const y = VIEW.h - 70;

    c.fillStyle = 'rgba(6,9,18,0.72)';
    c.fillRect(0, y, VIEW.w, 70);
    c.strokeStyle = 'rgba(120,150,210,0.22)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(VIEW.w, y);
    c.stroke();

    // Leaf inventory — click one to pick it up, then drop it on a hero.
    // Leaves cap at 9 (see doCollect), so the row is reserved out to its full
    // width and the overdrive meter starts past it; otherwise a banked sixth
    // leaf sits on top of the meter and one click fires both.
    text(c, 'LEAVES', LEAF_ROW_X, y + 22, { size: 11, color: UI.inkDim, weight: 800 });
    for (let i = 0; i < Math.max(3, state.leaves); i++) {
      const r: Rect = { x: LEAF_ROW_X + i * LEAF_SLOT_PITCH, y: y + 30, w: 30, h: 30 };
      const filled = i < state.leaves;
      c.save();
      c.globalAlpha = filled ? 1 : 0.22;
      roundRect(c, r.x, r.y, r.w, r.h, 8);
      c.fillStyle = filled ? 'rgba(60,120,70,0.35)' : 'rgba(255,255,255,0.05)';
      c.fill();
      c.strokeStyle = filled ? UI.leaf : 'rgba(255,255,255,0.2)';
      c.lineWidth = 1.5;
      c.stroke();
      drawLeafGlyph(c, r.x + 15, r.y + 15, 10);
      c.restore();
      if (filled && pointInRect(p.x, p.y, r) && p.pressed) action = { kind: 'pickLeaf' };
    }

    // Overdrive
    const odRect: Rect = { x: OVERDRIVE_X, y: y + 34, w: 210, h: 22 };
    const full = state.overdrive >= 1;
    text(c, 'OVERDRIVE', OVERDRIVE_X, y + 24, { size: 11, color: UI.inkDim, weight: 800 });
    meter(
      c,
      odRect,
      state.overdrive,
      full ? UI.gold : '#6be3ff',
      full ? 'UNLEASH EVERYTHING  ·  SPACE' : `${Math.floor(state.overdrive * 100)}%`,
    );
    if (full) {
      const pulse = 0.4 + Math.sin(input.time * 7) * 0.3;
      c.strokeStyle = alpha(UI.gold, pulse);
      c.lineWidth = 3;
      roundRect(c, odRect.x - 2, odRect.y - 2, odRect.w + 4, odRect.h + 4, 13);
      c.stroke();
    }
    if (full && pointInRect(p.x, p.y, odRect) && p.released) action = { kind: 'overdrive' };

    // Wave progress — or the survival clock in modes without a wave list.
    const waveRect: Rect = { x: VIEW.w - 440, y: y + 34, w: 420, h: 22 };
    const override = input.progressOverride;
    text(c, override?.caption ?? 'WAVE PROGRESS', VIEW.w - 440, y + 24, {
      size: 11,
      color: UI.inkDim,
      weight: 800,
    });
    meter(
      c,
      waveRect,
      override ? override.ratio : state.progress,
      override ? UI.gold : UI.danger,
      override?.label,
    );
    if (!override) {
      // Flag markers for huge waves.
      c.save();
      c.fillStyle = alpha('#ffffff', 0.8);
      for (let i = 0; i < 4; i++) {
        const fx = waveRect.x + ((i + 1) / 4) * waveRect.w - 3;
        c.fillRect(fx, waveRect.y - 4, 2, waveRect.h + 8);
      }
      c.restore();
    }

    if (input.villainSide) {
      text(c, `MENACE ${Math.floor(state.menace)}`, VIEW.w / 2, y + 24, {
        size: 13,
        align: 'center',
        color: UI.danger,
        weight: 800,
      });
      meter(c, { x: VIEW.w / 2 - 90, y: y + 34, w: 180, h: 18 }, state.menace / 600, UI.danger);
    }

    return action;
  }

  private drawVillainPanel(
    c: CanvasRenderingContext2D,
    state: BattleState,
    p: PointerState,
    input: HudInput,
  ): HudAction | null {
    let action: HudAction | null = null;
    this.villainRects = [];
    this.schemeRects = [];

    for (let i = 0; i < state.villainCards.length; i++) {
      const card = state.villainCards[i];
      const def = villainDef(card.villainId);
      const r = villainCardRect(i, state.villainCards.length);
      this.villainRects.push(r);
      const usable = card.cooldown <= 0 && state.menace >= def.menace;
      const selected = input.selectedVillainCard === i;

      c.save();
      roundRect(c, r.x, r.y, r.w, r.h, 8);
      c.fillStyle = '#2a1420';
      c.fill();
      c.clip();
      // The column sizes itself to the deck, so the figure and the cost strip
      // are both derived from the card rather than fixed.
      const costH = Math.max(12, Math.min(16, r.h * 0.26));
      c.globalAlpha = usable ? 1 : 0.5;
      drawVillain(c, def.art, r.x + r.w / 2, r.y + r.h - costH - 2, {
        time: input.time + i,
        act: 0,
        hurt: 0,
        ult: 0,
        height: Math.max(28, r.h - costH - 6),
        facing: -1,
        walk: 0,
        armor: 1,
        shield: 0,
        attacking: false,
      });
      c.globalAlpha = 1;
      c.fillStyle = 'rgba(0,0,0,0.75)';
      c.fillRect(r.x, r.y + r.h - costH, r.w, costH);
      text(c, String(def.menace), r.x + r.w / 2, r.y + r.h - costH * 0.28, {
        size: Math.min(11, costH * 0.72),
        align: 'center',
        weight: 800,
        color: UI.danger,
      });
      if (card.cooldown > 0) {
        c.fillStyle = 'rgba(4,7,16,0.7)';
        c.fillRect(r.x, r.y, r.w, r.h * clamp(card.cooldown / card.recharge, 0, 1));
      }
      c.restore();
      c.lineWidth = selected ? 3 : 1.5;
      c.strokeStyle = selected ? UI.danger : 'rgba(255,120,120,0.3)';
      roundRect(c, r.x, r.y, r.w, r.h, 8);
      c.stroke();

      if (pointInRect(p.x, p.y, r) && p.released && usable) {
        action = { kind: 'villainCard', index: i };
      }
    }

    // Schemes sit in the strip between the card tray and the board.
    for (let i = 0; i < SCHEMES.length; i++) {
      const s = SCHEMES[i];
      const r = schemeButtonRect(i);
      this.schemeRects.push(r);
      const cd = state.schemeCooldowns[s.id] ?? 0;
      const usable = cd <= 0 && state.menace >= s.cost;
      c.save();
      roundRect(c, r.x, r.y, r.w, r.h, 6);
      c.fillStyle = input.selectedScheme === s.id ? shade(s.color, -0.5) : '#1a1020';
      c.fill();
      c.strokeStyle = usable ? s.color : 'rgba(255,255,255,0.15)';
      c.lineWidth = 1.5;
      c.stroke();
      c.globalAlpha = usable ? 1 : 0.45;
      text(c, `${s.name}  ${s.cost}`, r.x + r.w / 2, r.y + 17, {
        size: 11,
        align: 'center',
        weight: 800,
        color: usable ? UI.ink : UI.inkDim,
        maxWidth: r.w - 8,
      });
      c.restore();
      if (pointInRect(p.x, p.y, r) && p.released && usable) {
        action = { kind: 'scheme', id: s.id };
      }
    }

    // With a villain selected, the right end of each lane becomes a drop zone.
    // The click itself is handled by the battle screen against the board grid,
    // so a tap anywhere in the row works — this just shows where to aim.
    if (input.selectedVillainCard !== null) {
      for (let row = 0; row < state.rows; row++) {
        const r = laneStripRect(row, state.cols);
        const hot = p.y >= r.y && p.y <= r.y + r.h;
        c.save();
        const g = c.createLinearGradient(r.x, 0, r.x + r.w, 0);
        g.addColorStop(0, alpha(UI.danger, 0));
        g.addColorStop(1, alpha(UI.danger, hot ? 0.5 : 0.22));
        c.fillStyle = g;
        c.fillRect(r.x, r.y + 2, r.w, r.h - 4);
        text(c, '◀ DEPLOY', r.x + r.w - 12, r.y + r.h / 2 + 5, {
          size: 13,
          align: 'right',
          weight: 800,
          color: hot ? UI.ink : alpha(UI.ink, 0.6),
        });
        c.restore();
      }
    }

    return action;
  }

  private drawWaveBanner(c: CanvasRenderingContext2D, state: BattleState): void {
    if (state.hugeWaveBanner <= 0) return;
    const t = clamp(state.hugeWaveBanner / 3.2, 0, 1);
    const alphaV = t > 0.8 ? (1 - t) * 5 : Math.min(1, t * 2.2);
    c.save();
    c.globalAlpha = alphaV;
    c.fillStyle = 'rgba(120,0,20,0.35)';
    c.fillRect(0, 250, VIEW.w, 96);
    text(c, 'A HUGE WAVE OF VILLAINS IS APPROACHING', VIEW.w / 2, 310, {
      size: 34,
      align: 'center',
      weight: 800,
      color: '#ffdede',
    });
    c.restore();
  }
}

function roleLabel(role: string): string {
  switch (role) {
    case 'producer':
      return 'SOLAR';
    case 'defender':
      return 'WALL';
    case 'shooter':
      return 'RANGED';
    case 'melee':
      return 'MELEE';
    case 'instant':
      return 'INSTANT';
    case 'support':
      return 'SUPPORT';
    case 'hazard':
      return 'HAZARD';
    default:
      return role.toUpperCase();
  }
}
